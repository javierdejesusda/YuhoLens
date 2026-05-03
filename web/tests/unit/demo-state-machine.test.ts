import { describe, it, expect } from "vitest";
import { reduce, INITIAL, type DemoState } from "@/components/demo/demo-state-machine";

describe("demo state machine", () => {
  it("idle → ingest on RUN", () => {
    expect(reduce(INITIAL, { type: "RUN" }).stage).toBe("ingest");
  });

  it("walks ingest → pass1 → critic → ground → composing → ready", () => {
    let s: DemoState = INITIAL;
    s = reduce(s, { type: "RUN" });
    s = reduce(s, { type: "ADVANCE" });
    s = reduce(s, { type: "ADVANCE" });
    s = reduce(s, { type: "ADVANCE" });
    s = reduce(s, { type: "ADVANCE" });
    s = reduce(s, { type: "STREAM_DONE" });
    expect(s.stage).toBe("ready");
  });

  it("RUN while running is a no-op", () => {
    const s = reduce(INITIAL, { type: "RUN" });
    expect(reduce(s, { type: "RUN" }).stage).toBe("ingest");
  });

  it("RESET goes back to idle", () => {
    const s = reduce(INITIAL, { type: "RUN" });
    expect(reduce(s, { type: "RESET" }).stage).toBe("idle");
  });

  it("SET_FILER updates filerId without changing stage", () => {
    const s = reduce(INITIAL, { type: "SET_FILER", filerId: "x" });
    expect(s.filerId).toBe("x");
    expect(s.stage).toBe("idle");
  });
});
