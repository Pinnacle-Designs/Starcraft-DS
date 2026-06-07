interface Props {
  label: string;
  colorClass: string;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function CollapsibleWaveSection({
  label,
  colorClass,
  summary,
  expanded,
  onToggle,
  children,
}: Props) {
  return (
    <section className={`wave-collapsible ${colorClass}`}>
      <button
        type="button"
        className="wave-collapsible-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="panel-section-chevron" aria-hidden>
          {expanded ? "▼" : "▶"}
        </span>
        <span className="wave-collapsible-label">{label}</span>
        {summary ? (
          <span className="wave-collapsible-summary">{summary}</span>
        ) : null}
      </button>
      {expanded ? <div className="wave-collapsible-body">{children}</div> : null}
    </section>
  );
}
