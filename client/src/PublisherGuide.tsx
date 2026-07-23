import { isElectronApp } from "./overlaySync";

/**
 * Publisher content for AdSense / indexing quality.
 * Keep this unique prose — not a thin wrapper around the tool UI.
 */
export function PublisherGuide() {
  if (isElectronApp()) return null;

  return (
    <article className="publisher-guide" aria-labelledby="publisher-guide-heading">
      <h2 id="publisher-guide-heading" className="publisher-guide-title">
        Direct Strike counter guide
      </h2>
      <p className="publisher-guide-lead">
        Direct Strike is a StarCraft II arcade mode where teams fight across three
        waves with race picks, tech unlocks, and platform limits that differ from
        standard 1v1 ladder. Starcraft Coach is a free counter helper for that
        mode: tag what the enemy is building, set your race and unlocked tech, and
        get unit suggestions you can actually field.
      </p>

      <section className="publisher-guide-section" aria-labelledby="guide-how">
        <h3 id="guide-how">How to use the counter coach</h3>
        <ol className="publisher-guide-list">
          <li>
            <strong>Tag enemy waves.</strong> For each of the three waves, choose
            the opponent race and enter unit counts you see on the field or in
            production. Accurate tags matter more than guessing every unit.
          </li>
          <li>
            <strong>Set your team race and tech.</strong> Pick your race per wave
            and the highest tech tier you have unlocked (T1–T3). Suggestions
            prioritize counters you can build right now.
          </li>
          <li>
            <strong>Read coverage and build paths.</strong> The coach shows hard
            and soft counters, how many you still need, and options that need
            higher tech so you can plan the next unlock.
          </li>
          <li>
            <strong>Optional desktop overlays.</strong> The Windows app adds
            always-on-top panels you can drag over the game while you play.
          </li>
        </ol>
      </section>

      <section className="publisher-guide-section" aria-labelledby="guide-waves">
        <h3 id="guide-waves">Why waves and tech matter in Direct Strike</h3>
        <p>
          In Direct Strike, each wave can use a different race, and your available
          tech changes as the match progresses. A counter that wins on ladder may
          be locked behind a building you have not unlocked yet. Massing a strong
          lower-tech unit can beat waiting for a perfect high-tech answer when the
          next fight is seconds away.
        </p>
        <p>
          Wave shift (how far ahead your active team is relative to enemy tags)
          also changes which of your races answers an enemy wave. Tagging the
          correct wave and tech keeps suggestions aligned with the fight you are
          about to take, not a generic matchup chart.
        </p>
      </section>

      <section className="publisher-guide-section" aria-labelledby="guide-tips">
        <h3 id="guide-tips">Practical counter tips</h3>
        <ul className="publisher-guide-list">
          <li>
            Prefer counters at your current tech tier first; treat higher-tech
            units as goals for the next unlock, not automatic builds.
          </li>
          <li>
            Watch air vs ground platform capacity. Overfilling one lane wastes
            minerals while the other lane stays empty.
          </li>
          <li>
            Soft counters still help when you already have those units on the
            field. Coverage badges show whether you are covered, partial, or
            exposed.
          </li>
          <li>
            Update tags after big fights. Armies change quickly; stale tags lead
            to the wrong primary counter.
          </li>
          <li>
            Use Fullscreen Windowed in StarCraft II if you run the desktop
            overlays, so panels stay visible and movable over the game.
          </li>
        </ul>
      </section>

      <section className="publisher-guide-section" aria-labelledby="guide-about">
        <h3 id="guide-about">About this site</h3>
        <p>
          Starcraft Coach is built by Pinnacle Designs for Direct Strike players
          who want faster army decisions between waves. Counter data is compiled
          from public StarCraft II counter resources and Direct Strike-oriented
          guides, then filtered by your race and unlocked tech. The browser tool
          and Windows desktop app are free to use.
        </p>
        <p>
          This page is the main coach interface plus a short overview. For the
          full article on waves, tech tiers, platforms, and match habits, read the{" "}
          <a href={`${import.meta.env.BASE_URL}guide.html`}>
            Direct Strike counter guide
          </a>
          .
        </p>
      </section>
    </article>
  );
}
