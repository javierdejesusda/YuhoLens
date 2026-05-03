import { STAGE_LABELS, type Stage } from "./demo-state-machine";

const ORDER: Stage[] = [
  "idle",
  "ingest",
  "pass1",
  "critic",
  "ground",
  "composing",
  "ready",
];

export function LdPipe({ current }: { current: Stage }) {
  const idx = ORDER.indexOf(current);
  return (
    <div className="ld-pipe" aria-label="Pipeline stages">
      {STAGE_LABELS.map((s, i) => {
        const stageIdx = ORDER.indexOf(s.stage);
        const isActive = stageIdx === idx;
        const isDone = stageIdx < idx;
        const cls =
          "stage" +
          (isActive ? " is-active" : "") +
          (isDone ? " is-done" : "");
        return (
          <span key={s.stage} className={cls} title={s.node}>
            <span className="ico" aria-hidden="true" />
            <span>{s.label}</span>
            {i < STAGE_LABELS.length - 1 && <span className="arr" aria-hidden="true">→</span>}
          </span>
        );
      })}
    </div>
  );
}
