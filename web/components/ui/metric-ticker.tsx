type Cell = { value: string; key: string; emphasize?: boolean };

const CELLS: Cell[] = [
  { value: "1.000", key: "Citation rate", emphasize: true },
  { value: "3.88", key: "KG-2 coherence", emphasize: true },
  { value: "14B", key: "nekomata-qfin" },
  { value: "1×", key: "MI300X" },
  { value: "~$80", key: "Total compute" },
];

export function MetricTicker() {
  return (
    <div className="metric-ticker" role="list" aria-label="Headline metrics">
      {CELLS.map((c) => (
        <div className="mt-cell" key={c.key} role="listitem">
          <span className="v">
            {c.emphasize ? <strong className="accent">{c.value}</strong> : c.value}
          </span>
          <span className="k">{c.key}</span>
        </div>
      ))}
    </div>
  );
}
