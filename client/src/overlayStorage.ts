export type OverlayPanelId = "enemy" | "team";

export interface PanelVisibility {
  enemy: boolean;
  team: boolean;
}

const WEB_VIS_KEY = "starcraft-ds-web-overlay-vis";

const DEFAULT_WEB_VISIBILITY: PanelVisibility = { enemy: false, team: false };

export interface PanelPosition {
  x: number;
  y: number;
}

export interface OverlayPanelSpec {
  id: OverlayPanelId;
  storageKey: string;
  title: string;
  width: number;
  height: number;
  defaultPosition: PanelPosition;
}

export const OVERLAY_PANELS: Record<OverlayPanelId, OverlayPanelSpec> = {
  enemy: {
    id: "enemy",
    storageKey: "enemy-waves",
    title: "Enemy waves",
    width: 380,
    height: 520,
    defaultPosition: { x: 24, y: 24 },
  },
  team: {
    id: "team",
    storageKey: "team-selection",
    title: "Team selection",
    width: 380,
    height: 440,
    defaultPosition: { x: 408, y: 24 },
  },
};

const POS_PREFIX = "starcraft-ds-overlay-pos-";

export function loadPanelPosition(
  storageKey: string,
  fallback: PanelPosition
): PanelPosition {
  try {
    const raw = localStorage.getItem(`${POS_PREFIX}${storageKey}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as PanelPosition;
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      Number.isFinite(parsed.x) &&
      Number.isFinite(parsed.y)
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function savePanelPosition(
  storageKey: string,
  pos: PanelPosition
): void {
  try {
    localStorage.setItem(`${POS_PREFIX}${storageKey}`, JSON.stringify(pos));
  } catch {
    /* quota */
  }
}

export function loadWebOverlayVisibility(): PanelVisibility {
  try {
    const raw = sessionStorage.getItem(WEB_VIS_KEY);
    if (!raw) return DEFAULT_WEB_VISIBILITY;
    const parsed = JSON.parse(raw) as Partial<PanelVisibility>;
    return {
      enemy: parsed.enemy === true,
      team: parsed.team === true,
    };
  } catch {
    return DEFAULT_WEB_VISIBILITY;
  }
}

export function saveWebOverlayVisibility(vis: PanelVisibility): void {
  try {
    sessionStorage.setItem(WEB_VIS_KEY, JSON.stringify(vis));
  } catch {
    /* quota */
  }
}

export function parseOverlayPanel(): OverlayPanelId | null {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash === "overlay/enemy") return "enemy";
  if (hash === "overlay/team") return "team";
  const panel = new URLSearchParams(window.location.search).get("panel");
  if (panel === "enemy" || panel === "team") return panel;
  return null;
}
