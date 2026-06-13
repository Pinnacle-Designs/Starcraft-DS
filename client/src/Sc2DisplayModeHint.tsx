interface Props {
  compact?: boolean;
  className?: string;
}

export function Sc2DisplayModeHint({
  compact = false,
  className = "status sc2-display-hint",
}: Props) {
  if (compact) {
    return (
      <p className={className}>
        Set SC2 to <strong>Options → Video → Display Mode → Fullscreen Windowed</strong>{" "}
        so overlays and capture work on top of the game.
      </p>
    );
  }

  return (
    <p className={className}>
      In StarCraft II, open <strong>Menu (Esc) → Options → Video</strong> and set{" "}
      <strong>Display Mode</strong> to <strong>Fullscreen Windowed</strong> (not
      exclusive Fullscreen). That lets the coach overlay and screen capture sit on
      top of the game while you play.
    </p>
  );
}
