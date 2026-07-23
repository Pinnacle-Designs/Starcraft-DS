const CANONICAL_ORIGIN = "https://starcraftcoach.com";

export const SEO_FAQ = [
  {
    question: "What is Starcraft Coach?",
    answer:
      "Starcraft Coach is a free counter tool for StarCraft II Direct Strike. You tag enemy units per wave, choose your team race and unlocked tech tier, and get suggested counters for Terran, Zerg, and Protoss.",
  },
  {
    question: "Does Starcraft Coach work with Direct Strike?",
    answer:
      "Yes. Starcraft Coach is built for the Direct Strike arcade mode. Counter data is tuned for Direct Strike unit tiers and common army compositions, not standard ladder matchmaking.",
  },
  {
    question: "How do tech tiers affect counter suggestions?",
    answer:
      "Each of your waves has a max unlocked tech (T1–T3). The coach prioritizes counters at or below that tier so recommendations match what you can build right now. Higher-tech counters appear as locked options until you unlock them.",
  },
  {
    question: "What are enemy waves and wave shift?",
    answer:
      "Direct Strike fights across three waves. You tag enemy units per wave, then optionally set wave shift if your active team is ahead of the enemy wave you tagged. That mapping decides which of your races answers each enemy composition.",
  },
  {
    question: "Is Starcraft Coach free?",
    answer:
      "Yes. The web tool is free to use in your browser. The Windows desktop app is also free to download and includes always-on-top overlay panels for in-game use.",
  },
  {
    question: "Do I need the desktop app?",
    answer:
      "No. You can tag enemy waves and view counter suggestions in the browser. The Windows app adds draggable overlay windows, screen-capture hotkeys, and a dedicated coach window while you play.",
  },
  {
    question: "Where does the counter data come from?",
    answer:
      "Counter relationships are compiled from public StarCraft II counter resources and Direct Strike-oriented guides, then filtered by your race, tech unlocks, and tagged enemy army. Always use in-game judgment for timing and economy.",
  },
] as const;

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  );
}

function isOverlayUtilityUrl(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.has("panel")) return true;
  const hash = window.location.hash.replace(/^#\/?/, "");
  return hash === "overlay/enemy" || hash === "overlay/team";
}

function isIndexingMirror(hostname: string): boolean {
  return hostname !== "starcraftcoach.com" && !isLocalHost(hostname);
}

function upsertMeta(name: string, content: string): void {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string): void {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Apply robots/canonical rules before React mounts. */
export function applyIndexingMeta(): void {
  const { hostname } = window.location;

  if (isOverlayUtilityUrl()) {
    upsertMeta("robots", "noindex, nofollow");
    return;
  }

  if (isIndexingMirror(hostname)) {
    upsertMeta("robots", "noindex, follow");
    upsertCanonical(`${CANONICAL_ORIGIN}/`);
  }
}
