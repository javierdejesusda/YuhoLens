import type { Filer } from "@/lib/types";

interface Props {
  filers: Filer[];
  active: string;
  onPick: (id: string) => void;
}

/** Strip the leading `EDINET Row ` prefix for compact chip rendering. */
function compactTail(label: string): string {
  return label.replace(/^EDINET Row\s+/i, "Row ");
}

export function TickerChips({ filers, active, onPick }: Props) {
  return (
    <div className="ld-chips" role="tablist" aria-label="Sample filers">
      {filers.map((f) => {
        const isRefuse = f.customId === "REFUSE.X";
        const isActive = f.customId === active;
        const cls =
          "ld-chip" +
          (isRefuse ? " ld-chip-refuse" : "") +
          (isActive ? " is-active" : "");
        const tail = isRefuse
          ? "refused"
          : f.displayLabel
          ? compactTail(f.displayLabel)
          : f.subset;
        const tooltip = f.enName
          ? `${f.jpName} · ${f.enName} · ${f.displayLabel}`
          : f.displayLabel;
        return (
          <button
            key={f.customId}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onPick(f.customId)}
            className={cls}
            title={tooltip}
          >
            <span className="jp">{f.chipLabel}</span>
            {tail ? ` · ${tail}` : ""}
          </button>
        );
      })}
    </div>
  );
}
