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
