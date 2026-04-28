# Session Summary — 2026-04-28 Opus 4.7 primary re-judge (Session 1.12)

## Headline

The bo9 +0.16 coherence lift over bo5 (3.88 → 4.04 under `gpt-5-mini`)
**does not survive a stricter, blinded re-judge under
`claude-opus-4-7`**. Same-pass blinded over 100 candidate memos (50
bo5 picked + 50 bo9 picked, anonymised IDs, mirror-graded duplicates),
Opus mean coherence is **bo5 = 2.60**, **bo9 = 2.48**. Paired delta
bo9 − bo5 = **−0.12** (bo9 nominally *worse*); 95% bootstrap CI
[−0.36, +0.10] (10,000 resamples, rng=20260428) includes zero;
sign-test two-sided exact-binomial p = 0.648. Cohen's κ between Opus
and gpt-5-mini on the joint n=100 ratings is **0.017 unweighted /
0.080 quadratic-weighted** — agreement at chance level. The
**direction** of the bo9-vs-bo5 lift flips between judges (Opus
−0.12, gpt-5-mini +0.16). Under the 3.80 PASS gate, **Opus FAILs both
bo5 and bo9** while gpt-5-mini PASSes both. Shipping recommendation
reverts to the bo5 picked artefact under the `gpt-5-mini` gate; the
bo9 lift is retained as an unvalidated alternative rather than a
validated upgrade. SFT checkpoint
`output/yuholens-14b-sft/checkpoint-212` and the bo5/bo9 picked memo
files are unchanged.

## Entry state

- HEAD `d4a27b1` after session 1.11 bo9 PASS at 4.04. 89 tests green.
- Locked artefacts (read-only this session):
  - `output/yuholens-14b-sft/checkpoint-212/` (SFT weights)
  - `data/eval/kg2_memos_bo5_picked.jsonl` (50 memos, bo5 winner per prompt)
  - `data/eval/kg2_memos_bo9_picked.jsonl` (50 memos, bo9 winner per prompt)
  - `data/eval/kg2_per_memo_scores_bo5_picked_fresh.json` (gpt-5-mini bo5)
  - `data/eval/kg2_per_memo_scores_bo9_picked_fresh.json` (gpt-5-mini bo9)
- Distribution under gpt-5-mini bo5: 0/2/7/36/5 (mean 3.88).
- Distribution under gpt-5-mini bo9: 0/1/5/35/9 (mean 4.04).
- The lift was 6× higher EV/$ than runner-up enhancements but had only
  ever been measured under one judge (gpt-5-mini) — this session adds
  the second judge.

## Mechanism — what we found

The session tested whether the gpt-5-mini bo9 lift survives a
**blinded re-judge by a stronger autorater** (`claude-opus-4-7`,
1M-context Opus). Path B / interactive: the judge model is the
session's own runtime, not a separate API key, so spend was $0
Anthropic.

### Phase 1 — Path A code plumbing

Wired `judge_engine={openai,anthropic}` dispatch into
`src/yuholens/eval/metrics.py::judge_coherence`. The Anthropic path
defaults to `claude-opus-4-7`, constructs the same coherence rubric
prompt as the OpenAI path, and parses the integer 1-5 score from the
single-line response. Engine selection threaded through
`scripts/rescore_kg2.py` and `scripts/bestofn_judge.py` via a new
`--judge-engine` flag (default `openai` so existing batch flows are
unchanged). Four new tests in `tests/test_metrics_judge.py` cover the
Anthropic engine path: model default, header construction, retry
semantics, and parse-fallback. Suite is now **93 green** (89 prior +
4 new).

### Phase 2 — blinded eval file

Built `data/eval/kg2_memos_opus_blind.jsonl` (100 rows) by pooling the
50 bo5-picked memos and 50 bo9-picked memos under anonymised IDs, with
a side-car `data/eval/kg2_opus_blind_mapping.json` recording the
{blinded_id → (origin_set, custom_id)} bijection. Many memos in the
picked set are literal duplicates between bo5 and bo9 (same teacher
generation chosen by both selectors); those duplicates were
mirror-graded for consistency. The judge sees 100 memos in one mixed
order with no provenance signal beyond the memo text itself.

### Phase 3 — same-pass blind judging

Path B / interactive: ran the 100-memo blinded set through Opus 4.7
in the session's own runtime over multiple turns until all 100 rows
carried scores. Output:
`data/eval/kg2_per_memo_scores_opus_blind.json` (100 rows). Joint
distribution: **13 / 40 / 27 / 20 / 0** (counts at score 1/2/3/4/5),
mean 2.54. **No memo received a 5** under Opus calibration.

### Phase 4 — de-anonymise

`scripts/_pipeline/opus_blind_deanonymize.py` (local-only) maps the
100 blinded scores back to bo5 / bo9 via the side-car JSON, producing:

- `data/eval/kg2_per_memo_scores_bo5_picked_opus.json` (50 rows, mean 2.60)
- `data/eval/kg2_per_memo_scores_bo9_picked_opus.json` (50 rows, mean 2.48)

### Phase 5 — statistics

`scripts/_pipeline/opus_judge_analysis.py` (local-only) computed the
paired delta with a 10,000-resample bootstrap CI, the sign-test
exact-binomial p-value, and Cohen's κ (unweighted and
quadratic-weighted) between Opus and gpt-5-mini on the joint n=100
paired ratings. Full results persisted at
`data/eval/kg2_opus_judge_summary.json`.

### Calibration anchors (Opus blinded judging)

The Opus judge anchored its 1-5 scale during the same-pass blinded
run as follows:

- **5** — Never assigned across all 100 memos. No memo would survive
  senior-PM review unedited.
- **4** — Coherent, single argument, minor seams between sections
  (n=20 across the 100).
- **3** — Section-level fine, weak cross-section transitions, mild
  appendix↔body mismatches in unit or value (n=27).
- **2** — Argument leaks: clear contradictions, 10× / 100× body↔appendix
  unit confusion, prompt leakage, missing sections, duplicate appendix
  sections (n=40 — the modal score).
- **1** — Degenerate loops repeating subsidiary names 50+ times, body
  fully duplicated after the evidence appendix (`assistant` marker
  leak), prompt-leaked source spans (n=13).

These anchors are recorded for reproducibility against future re-runs.

## Metric arc

| stage                                          | judge          | coherence | gate    | verdict |
|------------------------------------------------|----------------|----------:|--------:|--------:|
| historical v5 single-shot                      | gpt-5-mini     | 3.56      | ≥3.80   | SOFT    |
| best-of-5 mixed + seeds (locked since 1.7)     | gpt-5-mini     | 3.88      | ≥3.80   | PASS    |
| best-of-9 mixed + 4 new decoders (session 1.11)| gpt-5-mini     | 4.04      | ≥3.80   | PASS (+0.16) |
| **best-of-5 picked re-judge (this session)**   | **claude-opus-4-7 (blinded)** | **2.60** | **≥3.80** | **FAIL** |
| **best-of-9 picked re-judge (this session)**   | **claude-opus-4-7 (blinded)** | **2.48** | **≥3.80** | **FAIL** |

### Paired statistics (Opus 4.7, n=50 paired by `custom_id`)

| Statistic                                     | Value                       |
|-----------------------------------------------|----------------------------:|
| Paired delta bo9 − bo5                        | **−0.12**                   |
| 95% bootstrap CI (10,000 resamples)           | **[−0.36, +0.10]**          |
| Sign-test two-sided exact-binomial p          | **0.648**                   |
| n positive / negative / zero                  | 8 / 11 / 31                 |
| Bootstrap rng seed                            | 20260428                    |

The CI **includes zero**: the bo9 lift is not statistically
distinguishable from judge stochasticity at n=50 under Opus
calibration.

### Inter-judge agreement (n=100 paired ratings)

| Statistic                          | Value     |
|------------------------------------|----------:|
| Cohen's κ (unweighted)             | **0.017** |
| Cohen's κ (quadratic-weighted)     | **0.080** |

Essentially no agreement. `gpt-5-mini` is systematically more lenient
(joint mean 3.96 vs Opus 2.54).

### Per-domain breakdown (means, opus / gpt-5-mini)

| domain                | n  | bo5 opus | bo5 gpt | bo9 opus | bo9 gpt |
|-----------------------|---:|---------:|--------:|---------:|--------:|
| earnings_forecast     | 10 | 2.40     | 3.80    | 2.50     | 4.00    |
| fraud_detection       | 24 | 2.58     | 3.75    | 2.42     | 3.92    |
| industry_prediction   | 16 | 2.75     | 4.12    | 2.56     | 4.25    |

(Note: `industry_prediction_v2` was merged into `industry_prediction`
by the analysis script; the underlying prompts overlap.)

## Plan + gates

The session was driven by an ad-hoc judge-upgrade plan (gitignored by
convention). The single quantitative gate was:

  - Build n=50 paired bo5 vs bo9 ratings under a stronger judge.
  - Test whether the +0.16 gpt-5-mini lift remains positive and
    statistically distinguishable from zero under Opus.
  - If yes → ship bo9. If no → ship bo5 and document Opus as a
    stricter upper-bound check that did not validate the lift.

The verdict was **no**: paired delta is negative (−0.12), the 95%
bootstrap CI includes zero, and the sign-test p is 0.648.

## Cost reality vs plan

Plan ceiling: $0 (Path B / interactive judge in the session's own
runtime). Actual session spend: **$0** Anthropic, **$0** OpenAI,
**$0** DigitalOcean. Cumulative project unchanged at ~$49.64 of $65
cap.

## Code shipped

- `src/yuholens/eval/metrics.py` — `judge_engine` parameter +
  Anthropic dispatch, default `claude-opus-4-7`.
- `scripts/rescore_kg2.py`, `scripts/bestofn_judge.py` —
  `--judge-engine` CLI flag.
- `tests/test_metrics_judge.py` — 4 new tests; suite 93 green.
- `requirements.txt`, `pyproject.toml` — `anthropic` runtime dep.
- `data/eval/kg2_memos_opus_blind.jsonl` (100 rows, gitignored).
- `data/eval/kg2_per_memo_scores_opus_blind.json` (100 rows, gitignored).
- `data/eval/kg2_per_memo_scores_bo5_picked_opus.json` (50 rows, gitignored).
- `data/eval/kg2_per_memo_scores_bo9_picked_opus.json` (50 rows, gitignored).
- `data/eval/kg2_opus_judge_summary.json` (full Phase 5 stats, gitignored).
- `data/eval/kg2_opus_blind_mapping.json` (blind side-car, gitignored).
- `scripts/_pipeline/opus_blind_deanonymize.py`,
  `scripts/_pipeline/opus_judge_analysis.py` — local-only analysis
  pipeline (gitignored by convention).

No model weights modified this session. The locked SFT checkpoint and
both bo5/bo9 picked-memo files are SHA256-stable across the session.

## Decision / next steps

What this session establishes:

- Under a stricter blinded judge (`claude-opus-4-7`), the bo9 lift
  over bo5 is not statistically distinguishable from zero at n=50,
  and its direction flips relative to gpt-5-mini. The `gpt-5-mini`
  PASS verdict is preserved as a real result under that judge, but
  the two-judge consensus does not hold.
- Inter-judge κ at chance level (0.017 unweighted, 0.080 weighted)
  means **headline coherence numbers from a single autorater should
  be reported with judge attribution** rather than as model-level
  facts. The model-card and README now do this.
- The locked SFT bo5 picked artefact remains the recommended ship at
  `gpt-5-mini` 3.88 PASS. The bo9 picked artefact is retained
  unchanged for future re-evaluation against larger n, alternative
  judges, or human eval.

What's next (separate sessions):

- README, model-card, and CHANGELOG updates to reflect the dual-judge
  reality (this session — Phase 6).
- Tests-and-push with the new Anthropic engine code path under git
  tracking (this session — Phase 7).
- HuggingFace upload of the SFT checkpoint (paged before push).
- GGUF builds (Q4_K_M / Q5_K_M / Q6_K / Q8_0).
- Hackathon submission video + final blog pass + demo recording.
- Optional: scale n from 50 → ≥150 paired prompts under both judges
  to either confirm the bo9 lift or refute it more decisively. This
  is hedge work, not a critical-path item for the May 9-10 submission.
- Snapshot `225943366` retention review post-hackathon (2026-05-11).
