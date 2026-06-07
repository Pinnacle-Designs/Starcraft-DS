export const CAPTURE_HOTKEY_STORAGE_KEY = "starcraft-ds-capture-hotkey";
export const DEFAULT_CAPTURE_HOTKEY = "Alt+Shift+C";

const MODIFIER_KEYS = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "OS",
  "Command",
]);

const ELECTRON_KEY_ALIASES: Record<string, string> = {
  control: "Control",
  ctrl: "Control",
  command: "Command",
  cmd: "Command",
  commandorcontrol: "CommandOrControl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  space: "Space",
  spacebar: "Space",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  plus: "Plus",
  minus: "Minus",
};

/** Display label for overlay UI (Electron uses Control, not Ctrl). */
export function formatHotkeyLabel(accelerator: string): string {
  return accelerator
    .replace(/CommandOrControl/g, "Ctrl")
    .replace(/Control/g, "Ctrl")
    .replace(/Command/g, "Cmd")
    .replace(/\+/g, " + ");
}

export function loadCaptureHotkey(): string {
  try {
    const raw = localStorage.getItem(CAPTURE_HOTKEY_STORAGE_KEY);
    if (raw?.trim()) return normalizeAccelerator(raw);
  } catch {
    /* ignore */
  }
  return DEFAULT_CAPTURE_HOTKEY;
}

export function saveCaptureHotkey(accelerator: string): void {
  localStorage.setItem(CAPTURE_HOTKEY_STORAGE_KEY, normalizeAccelerator(accelerator));
}

/** Normalize user-typed or recorded shortcuts for Electron globalShortcut. */
export function normalizeAccelerator(input: string): string {
  const trimmed = input.trim().replace(/\s*\+\s*/g, "+");
  if (!trimmed) return DEFAULT_CAPTURE_HOTKEY;

  return trimmed
    .split("+")
    .map((part) => {
      const token = part.trim();
      if (!token) return "";
      const alias = ELECTRON_KEY_ALIASES[token.toLowerCase()];
      if (alias) return alias;
      if (/^f\d{1,2}$/i.test(token)) return token.toUpperCase();
      if (token.length === 1) return token.toUpperCase();
      return token;
    })
    .filter(Boolean)
    .join("+");
}

export function isValidCaptureHotkey(accelerator: string): boolean {
  const parts = normalizeAccelerator(accelerator).split("+");
  if (parts.length < 2) return false;
  const hasModifier = parts.some((part) =>
    ["Control", "Command", "CommandOrControl", "Alt", "Shift"].includes(part)
  );
  return hasModifier && parts[parts.length - 1].length > 0;
}

export function keyboardEventToAccelerator(event: KeyboardEvent): string | null {
  const key = event.key;
  if (MODIFIER_KEYS.has(key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  if (parts.length === 0) return null;

  let normalized = key;
  if (normalized.length === 1) normalized = normalized.toUpperCase();
  else if (normalized === " ") normalized = "Space";
  else if (normalized === "ArrowUp") normalized = "Up";
  else if (normalized === "ArrowDown") normalized = "Down";
  else if (normalized === "ArrowLeft") normalized = "Left";
  else if (normalized === "ArrowRight") normalized = "Right";
  else if (/^f\d+$/i.test(normalized)) normalized = normalized.toUpperCase();

  parts.push(normalized);
  return parts.join("+");
}
