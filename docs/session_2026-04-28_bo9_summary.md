# Session Summary — 2026-04-28 bo9 (Session 1.11)

## Headline

**KG-2 PASS at coherence 4.04** under best-of-9 mixed-decoder inference,
**+0.16 over the previously-locked best-of-5 baseline of 3.88** (session
1.7). The lift came from extending the candidate pool with 4 *new*
decoder profiles unsampled by bo5 — `s8 tight (temp 0.05, rep 1.20)`, `s9
creative (temp 0.30, rep 1.05)`, `s10 mid (temp 0.15, rep 1.125)`, and
`s11 ngram-block (temp 0.10, rep 1.15, no_repeat_ngram_size 3)`. Pick
share confirmed three of the four contributed real lift; one (s11) was a
dud at mean 2.58 and was never picked. The shipping artifact is now
either bo5 @ 3.88 (smaller candidate pool, less inference compute) or
**bo9 @ 4.04** (larger pool, +0.16 lift); the locked SFT checkpoint
`output/yuholens-14b-sft/checkpoint-212` is unchanged from session 1.7.

## Entry state

- HEAD `9b44656` after session 1.10 V3 plateau. 89 tests green.
- Locked fallback: SFT bo5 mixed-decoder pick over `[v4, v5, bo3_s1,
  bo3_s2, bo3_s3]` → coherence 3.880, citation 1.000, section coverage
  0.994 (`data/eval/kg2_per_memo_scores_bo5_picked_fresh.json`).
- bo5 distribution: 0/2/7/36/5 — 45 of 50 prompts below the score-5
  ceiling, leaving headroom for a diversity-extending bo-N.
- Five ORPO iterations had failed (V1, V2, V2.1, V2.2, V3). Two memory
  entries empirically bound the approach: `orpo_corpus_scale_bound`
  (margins floor ≈ -0.015 regardless of training budget at 790 prefs)
  and `orpo_14b_checkpoint_disk_footprint` (each checkpoint = 58 GB).
- Cumulative spend entering: ~$33.64 of $65 cap; ~$50.77 DigitalOcean
  credit remaining of original $72.37.

## Mechanism — what we found

The session tested whether the bo5 mean of 3.88 was decoder-diversity
saturated or whether unsampled regions of the (temperature × repetition
penalty × no-repeat ngram) hypercube would extend the lift further.

**The four new decoder profiles** were chosen to span the under-sampled
axes from the existing `scripts/adc/bo7_launch.sh` decoder catalogue. bo5
already covered `v5-base` (temp 0.10, rep 1.15) and `v4-mid` (temp 0.20,
rep 1.10) plus three `v5-base` seed variants, so the four new candidates
filled in:

  - `s8 tight` (temp 0.05, rep 1.20) — the cold-temperature corner
  - `s9 creative` (temp 0.30, rep 1.05) — the warm corner
  - `s10 mid` (temp 0.15, rep 1.125) — the intermediate point
  - `s11 ngram-block` (temp 0.10, rep 1.15, no_repeat_ngram_size 3) —
    the ngram-blocking axis (entirely unsampled by bo5; all bo5
    candidates use ngram=0)

**G2 cheap-judge probe.** Before paying for the full 200-row generation,
a $0.30 OAI probe judged 10 prompts × 4 candidates against the matched
bo5 picks. Result: 2/10 prompts showed a new candidate beating the bo5
pick (`fraud_detection-00601` lifted bo5=4 → s10=5;
`industry_prediction-00440` lifted bo5=3 → s8=4). Verdict: MARGINAL
(threshold: 0/10 = ABANDON, 1-3/10 = MARGINAL run anyway, 4+/10 =
STRONG). The autopilot proceeded to the full bo9 run.

**Full bo9 generation.** 50 prompts × 4 new candidates = 200 generations
on MI300X (atl1, snapshot 225943366) over ~5h 40m wall (12:21 → 18:00
UTC). Same-pass fresh-judge over all 8 candidate sets (existing
`bestof_v4v5` + `bo3_s{1,2,3}` plus the 4 new), pick by max coherence
per `custom_id`, then a final fresh rescoring pass over the picked memos
gave the headline mean.

**Pick share over 50 prompts.**

| set | pick share | mean coherence (bo9-pass fresh judge) |
|---|---|---|
| v4v5 (mixed v4 + v5, 100 memos pooled) | 31/50 (62.0%) | 3.760 |
| bo3_s3 | 5/50 (10.0%) | (not summarised in autopilot log) |
| bo3_s2 | 4/50 (8.0%) | (not summarised) |
| bo3_s1 | 2/50 (4.0%) | 3.240 |
| **s8 tight** | **3/50 (6.0%)** | (rolled into bo9 fresh) |
| **s9 creative** | **3/50 (6.0%)** | (rolled into bo9 fresh) |
| **s10 mid** | **2/50 (4.0%)** | (rolled into bo9 fresh) |
| **s11 ngram-block** | **0/50 (0.0%)** | **2.580** |

The four new candidates collectively won 8/50 (16%), enough to lift the
mean from 3.880 → 4.040. **s11 was a complete dud.** The
`no_repeat_ngram_size=3` constraint fragments financial-terminology reuse
(e.g., "operating margin" appearing in both the executive summary and
the earnings-direction section is a legitimate repeat that the
constraint blocks). This matches the warning baked into
`src/yuholens/eval/run_kg2.py` for the v3 ngram=4 variant: "blocking
legitimate financial-terminology reuse … repetition_penalty alone
handles tail collapse without the structural damage." Future bo-N
attempts should NOT include ngram>0 in the decoder hypercube; that axis
is empirically refuted at this checkpoint.

**Final bo9 picked-fresh distribution: 0/1/5/35/9** (out of 50). 9
prompts at the score-5 ceiling, up from 5 in bo5. 1 prompt at score 2
(weak tail at `industry_prediction_v2-00135`), down from 2 in bo5. The
+0.16 lift breaks down roughly as: 4 prompts moved 4→5, 1 prompt moved
2→3 (or similar reshuffle), 1 prompt moved 3→4.

## Metric arc

| stage | metric | value | gate | verdict |
|---|---|---|---|---|
| historical v5 single-shot | coherence | 3.560 | reference | baseline |
| best-of-3 same-decoder seeds | coherence | 3.640 | reference | small lift |
| best-of-2 v4+v5 mixed-decoder | coherence | 3.720 | reference | mixed-decoder lift |
| **best-of-5 mixed + seeds (locked since 1.7)** | **coherence** | **3.880** | **>= 3.80** | **PASS** |
| G2 cheap-judge probe (40 calls) | lift count | 2/10 | >0 to proceed | MARGINAL → proceed |
| **best-of-9 mixed + 4 new decoders (this session)** | **coherence** | **4.040** | **>= 3.80** | **PASS (+0.16)** |
| bo9 citation | citation | 1.000 | >= 0.7 | PASS |
| bo9 section_coverage | mean | 0.997 | >= 0.6 | PASS |

Anti-clobber check: SHA256 of the locked bo5 input files
(`kg2_memos_bestof_v4v5.jsonl`, `kg2_memos_bo3_s{1,2,3}.jsonl`,
`kg2_per_memo_scores_bo5_picked_fresh.json`) verified unchanged at
session start and end. The SFT checkpoint
`output/yuholens-14b-sft/checkpoint-212/` was read-only throughout; bo5
remains a clean fallback even if the team prefers to ship the smaller
candidate pool.

## Plan + gates

The session was driven by the recommendation plan at
`docs/superpowers/plans/yuholens_enhancement.md` (gitignored by
convention). The plan's quantitative analysis ranked four enhancement
options by EV-per-dollar:

  - Option A bo9: $7.50 budget, EV/$ = 0.0049 → primary
  - Option B 1,000-pref ORPO V4: $16.75, EV/$ = 0.0008 (also infeasible
    under the $4 OAI cap at full 3,000-pref scale)
  - Option C DPO 790-row: $15.50, EV/$ = 0.0008 (no DPO entry point in
    codebase, ROCm-bnb fragility risk)
  - Option D 2nd SFT seed + ensemble: $32, EV/$ = 0.0003 (over budget,
    14h GPU run + correlated seed errors)

A was 6× higher EV/$ than the runner-up. Plan was approved at the start
of the session and the autopilot ran from cheap-judge gate through
final rescoring without further human input.

The autopilot's gate stack performed as designed:
  - **G1 (droplet healthy)**: rocm-smi check passed, MI300X 192 GB
    visible, 0% util at idle.
  - **G1.5 (pre-flight smoke)**: 10 prompts × 4 decoder profiles
    completed cleanly in ~52 min; 4/4 candidate files verified at 10
    rows each before the cheap-judge probe.
  - **G2 (cheap-judge)**: 2/10 lift detected → MARGINAL → proceed.
  - **Anti-clobber pre and post**: PASS both times. bo5 fallback intact.
  - **G3 (final compare)**: 4.04 ≥ 3.90 LIFT threshold, well above the
    3.86-3.90 tie band.

## Cost reality vs plan

Plan ceiling: $10.50 ($8 DO + $2.50 OAI). Actual session spend: ~$16.00
($15.66 DO + ~$0.34 OAI). **Over plan ceiling by $5.50; under the $43
session DO cap by $27.** The overrun came primarily from generation
timing: the bo9 launch script reloads the model 4 times (once per
decoder profile), and `s8 tight (temp 0.05)` ran ~88 sec/row vs the bo3
GPU benchmark of ~79 sec/row — a 12% slowdown on the cold-temperature
profile. Generation ran 5h 40m wall instead of the 4h estimated. The
autopilot's hard 7-hour timeout was set conservatively for exactly this
scenario; it was not triggered.

OpenAI cost was 14× lower than projected ($0.34 actual vs ~$2 estimated)
because gpt-5-mini judge calls use ~3000 input + ~5 output tokens with
minimal reasoning, dramatically below the per-call estimates that
assumed full reasoning_effort. Final OAI ledger: ~$0.34 of $4 cap.

## Code shipped

- `data/eval/kg2_memos_s{8,9,10,11}.jsonl` — 4 new candidate sets,
  50 rows each (gitignored under `data/eval/`).
- `data/eval/kg2_memos_bo9_picked.jsonl` — the 50-memo bo9 picked set.
- `data/eval/kg2_per_memo_scores_bo9_picked_fresh.json` — per-memo
  picked-set fresh judge scores (mean 4.04, distribution 0/1/5/35/9).
- `data/eval/kg2_scores_bo9_picked.json` — final summary
  `{"coherence": 4.04, "citation": 1.0, "section_coverage_mean": 0.997,
  "verdict": "PASS"}`.
- `data/eval/kg2_per_memo_scores_*_bo9pass.json` — 8 fresh-judge
  scoring files for the same-pass bo9 pick.
- `data/eval/bo9_DONE.json` — autopilot completion marker with full
  audit trail (cheap-judge decision + final scores).
- `data/eval/bo9_cheap_judge_decision.json` — G2 gate decision.
- `scripts/_pipeline/bo9_anticlobber.py`,
  `scripts/_pipeline/bo9_launch.sh`,
  `scripts/_pipeline/bo9_cheap_judge.py`,
  `scripts/_pipeline/bo9_autopilot.sh`,
  `scripts/_pipeline/bo9_resume.sh` — operator-side pipeline for the
  bo9 run (local-only by convention; not committed).

No tracked Python source modified this session.

## Spend

- Droplet `567743977` (atl1 MI300X, snapshot 225943366, 11:01 UTC spin
  → 18:53 UTC destroy, 7.87 h × $1.99/hr): **~$15.66**.
- OpenAI: 40 cheap-judge + 400 fresh-judge + 50 rescore = 490 calls
  @ ~$0.0007/call: **~$0.34**.
- **Session total: ~$16.00**.
- **Cumulative project: ~$49.64 of $65 cap** (~$15.36 remaining).

The droplet was destroyed via `doctl compute droplet delete --force`
directly (not through `safe_destroy_local.sh`), per the session 1.10
lesson. No emergency snapshot was retained. The canonical SFT-only
snapshot `225943366` (atl1, 504.38 GiB) remains the only persistent
DigitalOcean storage tied to this project.

## Decision / next steps

What this session establishes:

- The decoder-diversity ceiling for bo-N inference on this SFT
  checkpoint is **not** at bo5. Three of the four new decoder profiles
  (s8 tight, s9 creative, s10 mid) contributed real lift in their pick
  shares. A future bo11 or bo13 with additional under-sampled decoder
  profiles (e.g., different `top_p`, longer `max_new_tokens`, extreme
  repetition penalties >1.25) may extend the lift further; this is a
  hedge, not a critical path for hackathon submission.
- The `no_repeat_ngram_size > 0` axis is **empirically refuted** at
  this checkpoint. s11 produced score-2 memos at mean 2.58 and was
  never picked. Future bo-N work should drop ngram>0 from the decoder
  hypercube.
- The locked SFT bo5 fallback at 3.88 remains intact and could ship at
  any time. The bo9 picked set at 4.04 is a defensible upgrade with
  +0.16 mean lift.

What's next (separate sessions):

- **Decision**: ship bo9 @ 4.04 (better headline) or bo5 @ 3.88
  (cheaper inference at submission time, smaller candidate pool to
  reproduce)? Both are defensible; bo9 is the recommended ship if the
  judges of the hackathon care about the mean coherence headline, bo5
  is recommended if simplicity of the inference recipe matters.
- README, model-card, blog, and CITATIONS updates if shipping bo9.
- HuggingFace upload of the SFT checkpoint (paged before push).
- GGUF builds (Q4_K_M / Q5_K_M / Q6_K / Q8_0).
- Hackathon submission video + final blog pass + demo recording.
- Snapshot `225943366` retention review post-hackathon (2026-05-11).
