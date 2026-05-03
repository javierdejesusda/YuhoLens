export interface DecoderProfile {
  name: string;
  temperature: number;
  top_p: number;
  repetition_penalty: number;
  no_repeat_ngram_size: number;
  seed: number | null;
  uiLabel: string;
  isDefault: boolean;
}

export interface Citation {
  span: string;
  section: string;
  pageRef: string;
}

export interface MemoLine {
  /** Raw line as it appeared in the model output (still contains `(ref: ...)`). */
  text: string;
  /** Cleaned line for the typed render: bullets prettified, refs stripped. */
  displayText: string;
  citations: Citation[];
  refused: boolean;
}

export interface Filer {
  customId: string;
  jpName: string;
  /**
   * Romanised / English name when known for the picked row, e.g.
   * `Kintetsu Group Holdings`. Empty when no verified mapping exists.
   */
  enName: string;
  chipLabel: string;
  subset: string;
  /** Friendly title, e.g. `EDINET Row 00270 · Earnings Forecast`. */
  displayLabel: string;
  coherence: number;
  memo: MemoLine[];
  jpSourceExcerpt: string;
}

export interface ArcPoint {
  stage: string;
  label: string;
  coherence: number;
  citationRate: number;
  config: string;
  isShip: boolean;
  preview: string;
}

export interface ReproRow {
  key: string;
  value: string;
  tag: string;
  scriptPath: string;
  isTotal: boolean;
}

export type EmphasisSegment = { text: string; bold?: boolean; em?: boolean };

export interface FailureCase {
  num: string;
  type: string;
  caughtBy: string;
  headline: EmphasisSegment[];
  claim: string;
  outputBlock: string;
  customId: string;
}
