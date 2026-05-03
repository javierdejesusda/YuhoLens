export type Stage =
  | "idle"
  | "ingest"
  | "pass1"
  | "critic"
  | "ground"
  | "composing"
  | "ready";

export interface DemoState {
  stage: Stage;
  filerId: string;
  profileId: string;
  streamedLines: number;
}

export const INITIAL: DemoState = {
  stage: "idle",
  filerId: "",
  profileId: "v5_seed_a",
  streamedLines: 0,
};

export type Action =
  | { type: "RUN"; filerId?: string; profileId?: string }
  | { type: "ADVANCE" }
  | { type: "STREAM_LINE" }
  | { type: "STREAM_DONE" }
  | { type: "RESET" }
  | { type: "SET_FILER"; filerId: string }
  | { type: "SET_PROFILE"; profileId: string };

const NEXT: Record<Stage, Stage> = {
  idle: "idle",
  ingest: "pass1",
  pass1: "critic",
  critic: "ground",
  ground: "composing",
  composing: "composing",
  ready: "ready",
};

export function reduce(s: DemoState, a: Action): DemoState {
  switch (a.type) {
    case "RUN":
      return s.stage !== "idle" && s.stage !== "ready"
        ? s
        : {
            ...s,
            stage: "ingest",
            streamedLines: 0,
            filerId: a.filerId ?? s.filerId,
            profileId: a.profileId ?? s.profileId,
          };
    case "ADVANCE":
      return { ...s, stage: NEXT[s.stage] };
    case "STREAM_LINE":
      return { ...s, streamedLines: s.streamedLines + 1 };
    case "STREAM_DONE":
      return { ...s, stage: "ready" };
    case "RESET":
      return { ...INITIAL, profileId: s.profileId, filerId: s.filerId };
    case "SET_FILER":
      return { ...s, filerId: a.filerId };
    case "SET_PROFILE":
      return { ...s, profileId: a.profileId };
    default:
      return s;
  }
}

export const STAGE_LABELS: Array<{ stage: Stage; label: string; node: string }> = [
  { stage: "ingest", label: "Ingestor", node: "src/yuholens/ingestor.py" },
  { stage: "pass1", label: "Pass-1 detect", node: "agents/graph.py:_pass1_detect" },
  { stage: "critic", label: "Best-of-5 Critic", node: "agents/memo_critic.py" },
  { stage: "ground", label: "Grounder", node: "agents/citation_grounder.py" },
];

export const STAGE_DURATIONS_MS: Record<Stage, number> = {
  idle: 0,
  ingest: 600,
  pass1: 1100,
  critic: 1300,
  ground: 800,
  composing: 0,
  ready: 0,
};

export function isApproved(stage: Stage): boolean {
  return stage === "ready";
}
