import OpenAI from "openai";
import {
  loadSystemPrompt,
  parseVisionJson,
  VISION_USER_TEXT,
  type VisionResult,
} from "./shared.js";

function resolveOpenAiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (/your-(key|actual)/i.test(key) || key === "sk-your-key-here") return null;
  if (!key.startsWith("sk-") || key.length < 20) return null;
  return key;
}

export function isOpenAiConfigured(): boolean {
  return resolveOpenAiKey() !== null;
}

export async function analyzeWithOpenAi(
  imageBase64: string,
  mimeType: string
): Promise<VisionResult> {
  const apiKey = resolveOpenAiKey();
  if (!apiKey) {
    return {
      detectedUnits: [],
      scene:
        "OPENAI_API_KEY missing or still the placeholder — save server/.env and restart npm run dev.",
      mode: "heuristic",
    };
  }

  const client = new OpenAI({ apiKey });
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
    max_tokens: 500,
    messages: [
      { role: "system", content: loadSystemPrompt() },
      {
        role: "user",
        content: [
          { type: "text", text: VISION_USER_TEXT },
          { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "";
  return {
    detectedUnits: parseVisionJson(content),
    scene: content.slice(0, 200),
    mode: "ai",
    provider: "openai",
    raw: content,
  };
}

const OPENAI_MAX_RATE_LIMIT_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readOpenAiErrorFields(err: unknown): {
  type?: string;
  code?: string;
  message?: string;
  status?: number;
  retryAfterMs?: number;
} {
  if (!(err instanceof OpenAI.APIError)) {
    return { message: err instanceof Error ? err.message : String(err) };
  }

  const body = err.error as
    | { type?: string; code?: string; message?: string }
    | undefined;
  const retryAfter = err.headers?.get?.("retry-after");
  let retryAfterMs: number | undefined;
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      retryAfterMs = seconds * 1000;
    }
  }

  return {
    type: err.type ?? body?.type,
    code: err.code ?? body?.code,
    message: body?.message ?? err.message,
    status: err.status,
    retryAfterMs,
  };
}

function openAiErrorToken(err: unknown): string {
  const { type, code, message } = readOpenAiErrorFields(err);
  return `${type ?? ""} ${code ?? ""} ${message ?? ""}`.toLowerCase();
}

/** Billing/quota exhaustion — safe to fall back to free OCR. */
export function isOpenAiInsufficientQuotaError(err: unknown): boolean {
  const { status } = readOpenAiErrorFields(err);
  if (status === 402) return true;

  const token = openAiErrorToken(err);
  if (/insufficient_quota|billing_hard_limit|payment_required/.test(token)) {
    return true;
  }
  if (/exceeded your current quota|check your plan and billing/.test(token)) {
    return true;
  }

  return false;
}

/** Transient throughput limit — should retry, not OCR-fallback. */
export function isOpenAiRateLimitError(err: unknown): boolean {
  if (isOpenAiInsufficientQuotaError(err)) return false;

  const { status } = readOpenAiErrorFields(err);
  if (status !== 429) return false;

  const token = openAiErrorToken(err);
  if (/rate_limit_exceeded|rate_limit/.test(token)) return true;

  // Unknown 429: prefer retry over mislabeling as quota exhaustion.
  return true;
}

/** @deprecated Use isOpenAiInsufficientQuotaError */
export function isOpenAiQuotaError(err: unknown): boolean {
  return isOpenAiInsufficientQuotaError(err);
}

export async function analyzeWithOpenAiResilient(
  imageBase64: string,
  mimeType: string
): Promise<VisionResult> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= OPENAI_MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
      return await analyzeWithOpenAi(imageBase64, mimeType);
    } catch (err) {
      lastErr = err;
      if (
        !isOpenAiRateLimitError(err) ||
        attempt >= OPENAI_MAX_RATE_LIMIT_RETRIES
      ) {
        throw err;
      }
      const { retryAfterMs } = readOpenAiErrorFields(err);
      const delay = retryAfterMs ?? Math.min(1000 * 2 ** attempt, 8000);
      await sleep(delay);
    }
  }

  throw lastErr;
}
