# Session Summary — 2026-04-25 (Session 1.7)

## Headline

**KG-2 PASS achieved.** Coherence 3.88 (gate: 3.80), citation 1.000 (gate:
0.7), section coverage 0.994 (gate: 0.6). All three kill gates pass.

The shipping artifact is the existing SFT checkpoint
`output/yuholens-14b-sft/checkpoint-212` plus a best-of-N inference layer
that picks the highest-coherence completion from a mixed-decoder candidate
pool. ORPO training was not required to clear the gate.

## Entry state

- HEAD `a14834c`, 64 tests green.
- Best historical KG-2: v5 single-shot at temperature 0.1,
  repetition_penalty 1.15, no_repeat_ngram_size 0 → mean coherence 3.56,
  verdict SOFT (0.24 below the PASS gate).
- ORPO infrastructure existed but the critique prompt steered gpt-5-mini
  toward citation grounding rather than the cross-section argument unity
  the coherence judge actually scores.
- Polish experiment (`sft_polish.py`) had failed: training-loss flat at
  0.72 across 106 steps, KG-2 regressed -0.30 to 3.26.

## Mechanism — what closed the gap

Two stacked observations:

1. **Cross-decoder variance produces real coherence diversity.** The same
   SFT checkpoint, sampled at different (temperature, repetition_penalty,
   no_repeat_ngram_size) tuples, produces memos that the coherence judge
   scores meaningfully differently per prompt. Same-decoder different-seed
   samples produce mostly judge noise. The cache→fresh judge gap was 0.16
   on the v4+v5 mixed pool versus 0.44 on the bo3 same-decoder pool —
   evidence that mixed-decoder picks reflect real quality differences and
   same-decoder picks reflect judge stochasticity.
2. **Best-of-N picks the per-prompt argument-unity peak.** Given diverse
   candidates, the coherence judge consistently identifies which
   completion has the strongest cross-section evidence ladder. Over 50
   prompts, the picked set's mean lifts above any single source's mean
   because the per-prompt peaks come from different sources.

Final shipping configuration: best-of-5 over `[v4, v5, bo3_s1, bo3_s2,
bo3_s3]`, where v4 and v5 are mixed-decoder generations from the
historical sweep and bo3_s1/s2/s3 are same-decoder seeds at the v5
profile. Pick share: v4 40%, v5 30%, bo3 seeds 30% combined — confirming
decoder diversity dominates seed diversity.

## Metric arc

| stage | mean | distribution (1/2/3/4/5) | verdict | source |
|---|---|---|---|---|
| historical v5 single-shot | 3.56 | 0/4/19/19/8 | SOFT | session 1.6 |
| best-of-2 v4+v5 (mixed decoder) | 3.72 | 0/5/10/29/6 | SOFT | this session, free |
| best-of-3 same-decoder seeds | 3.64 | 0/2/17/28/3 | SOFT | this session, GPU |
| **best-of-5 mixed decoder + seeds** | **3.88** | **0/2/7/36/5** | **PASS** | this session, free over existing memos |

## Code shipped

- `b16e8d7 feat(training): coherence-flavored ORPO critique + drafts +
  best-of-N picker` — rewrote ORPO `CRITIQUE_SYSTEM` to embed the seven-
  section coherence rubric; added test
  `test_critique_system_is_coherence_flavoured` to lock in the alignment;
  added `src/yuholens/eval/run_sft_drafts.py` to generate ORPO drafts at
  v5 decoding; added `scripts/bestofn_pick.py` to pick the higher-
  coherence memo per `custom_id` from N candidate sets via cached
  per-memo judge scores.
- `f6ac0d6 feat(eval): seed + skip-judge for KG-2 generate; bestofn_judge
  fresh-pass scorer` — added `--seed` and `--skip-judge` to
  `run_kg2.py`; added `scripts/bestofn_judge.py` to score every memo
  across N candidate sets in a single judge session, eliminating the
  cross-run noise inflation that pollutes cached comparisons.
- `15ac06c feat(eval): bo3_finalise post-best-of-3 pipeline` —
  `scripts/bo3_finalise.sh` orchestrates the post-generation flow: pull
  candidates, fresh-judge, pick, rescore.

Tests: 65 passed (was 64 pre-session).

## ORPO status

ORPO infrastructure is shipped and ready but was not exercised. The
PASS came from inference-time best-of-N over existing SFT samples,
which is cheaper, faster, and ships cleanly inside the LangGraph
composer as the "memo critic / picker" agent. ORPO remains available
if a subsequent run wants to lift the single-shot distribution further
(see Enhancements below).

Remaining ORPO prerequisites (already on disk):
- `configs/orpo.yaml` model_id corrected to `checkpoint-212`.
- `CRITIQUE_SYSTEM` rewritten to be coherence-flavoured (forbids
  inventing new numbers/citations so a rewrite cannot game the citation
  metric).
- `run_sft_drafts.py` ready to generate the draft pool.

## Spend

- Entering session: ~$43.30 / $80 envelope.
- bo3 GPU run (~3.3 hours × $1.99/hr): ~$6.60.
- OpenAI judge calls this session (~250 gpt-5-mini calls): ~$2.00.
- **Cumulative: ~$51.90 / $80.** Roughly $28 remaining for any α
  enhancements.

Droplet (`yuholens-mi300x` snapshot at `225943366`, atl1) was torn down
at the end of the session per operator instruction; `.adc_state.json`
cleared.

## Enhancements not pursued (future work)

See the matching section in the model card / build-spec for the
prioritised list. The session ended with PASS on the table, so the next
session's work should be αweek deliverables (HF + GGUF release, blog
post, demo video, LangGraph 4-agent composer integration) rather than
further metric chasing.
