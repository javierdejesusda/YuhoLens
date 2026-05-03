import type { DecoderProfile } from "@/lib/types";

interface Props {
  profiles: DecoderProfile[];
  active: string;
  onPick: (name: string) => void;
}

export function DecoderToggle({ profiles, active, onPick }: Props) {
  const activeP = profiles.find((p) => p.name === active);
  return (
    <div className="ld-decoder">
      <span className="ldd-lab">Decoder</span>
      <div className="ldd-seg" role="radiogroup" aria-label="Decoder profile">
        {profiles.map((p, i) => {
          const isActive = p.name === active;
          return (
            <button
              key={p.name}
              role="radio"
              type="button"
              aria-checked={isActive}
              aria-label={`Decoder profile ${i + 1}: ${p.uiLabel}`}
              onClick={() => onPick(p.name)}
              className={"ldd-btn" + (isActive ? " is-on" : "")}
            >
              {p.uiLabel}
              {p.isDefault ? " ★" : ""}
            </button>
          );
        })}
      </div>
      {activeP && (
        <span className="ldd-meta">
          T={activeP.temperature.toFixed(2)} · top_p={activeP.top_p.toFixed(2)} ·
          rep_pen={activeP.repetition_penalty.toFixed(3)} · seed={activeP.seed} ·
          score 3.88
        </span>
      )}
    </div>
  );
}
