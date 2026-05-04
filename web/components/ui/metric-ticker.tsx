import { NumberRoll } from "@/components/ui/number-roll";

type Cell = {
  value: string;
  key: string;
  emphasize?: boolean;
  live?: boolean;
  /** When set, render a `NumberRoll` that counts up to this value
   *  on first view. The cell's parent `.metric-ticker` already has
   *  `font-variant-numeric: tabular-nums`, so digit width never
   *  shifts during the roll — zero CLS. The roll fires after the
   *  ticker fades in (1.1 s post-load), well past LCP.
   */
  roll?: { to: number; decimals: number };
};

const CELLS: Cell[] = [
  {
    value: "1.000",
    key: "Citation rate",
    emphasize: true,
    roll: { to: 1.0, decimals: 3 },
  },
  { value: "3.88", key: "KG-2 coherence", emphasize: true, live: true },
  { value: "14B", key: "nekomata-qfin" },
  { value: "1×", key: "MI300X" },
  { value: "~$80", key: "Total compute" },
];

function CellValue({ c }: { c: Cell }) {
  if (c.roll) {
    const inner = (
      <NumberRoll to={c.roll.to} decimals={c.roll.decimals} />
    );
    return c.emphasize ? <strong className="accent">{inner}</strong> : inner;
  }
  return c.emphasize ? <strong className="accent">{c.value}</strong> : <>{c.value}</>;
}

export function MetricTicker() {
  return (
    <div className="metric-ticker" role="list" aria-label="Headline metrics">
      {CELLS.map((c) => (
        <div className="mt-cell" key={c.key} role="listitem">
          <span className="v">
            <CellValue c={c} />
            {c.live ? (
              <span
                className="mt-caret"
                aria-hidden="true"
                title="Live KG-2 score"
              >
                ▍
              </span>
            ) : null}
          </span>
          <span className="k">{c.key}</span>
        </div>
      ))}
    </div>
  );
}
