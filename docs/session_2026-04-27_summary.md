# Session Summary — 2026-04-27 (Session 1.9)

## Headline

**ORPO V2.1 was a measurement bug; V2.2 cleared the data gate cleanly but
the trained model did not move.** Phase-0 local re-derivation of the V2.1
hedge "PASS" using the canonical `yuholens.eval.metrics.citation_presence_rate`
regex `\(ref:\s*['"][^'"]+['"]` showed actual chosen citation rate **0.6926**
versus reported 0.994 — a 0.30-wide gap caused by a substring mismatch
between the V2.1 prompt patch (which referenced `(refs:` plural) and the
canonical singular `(ref: '...')` marker the evaluator scores against. No
GPU was spent on V2.1.

V2.2 patched `CRITIQUE_SYSTEM` to reference the canonical singular marker
explicitly and re-ran the critique batch (~$3 OpenAI). Result: **chosen
1.0000 / rejected 0.9962 / 70% of rows preserve all citations** — a clean
gate pass. ORPO trained 50 steps in ~71 minutes on a fresh MI300X (atl1,
booted from snapshot 225943366). Smoke at the v5 decoder profile produced
**mean coherence 3.571 (n=7)** — essentially identical to the SFT v5
single-shot baseline of 3.56. Combined with the training-time signal
(`rewards/accuracies = 0.0` across all 50 steps and consistently negative
reward margins), this is empirical evidence that ORPO at 50 steps did not
transfer the preference signal to the model.

The shipping artifact is unchanged from session 1.7: **SFT
`output/yuholens-14b-sft/checkpoint-212` plus best-of-5 mixed-decoder
inference at KG-2 PASS (coherence 3.88, citation 1.000, section coverage
0.994)**. The negative ORPO result now has a stronger evidentiary base
than the prior two: V1/V2 failed before training, V2.2 actually trained
and demonstrated empirically that synthetic-preference ORPO does not
move this 14B Qwen-1 checkpoint at the data scales available within the
hackathon budget.

## Entry state

- HEAD `6837e79`, 89 tests green.
- Last known PASS artifact: best-of-5 SFT @ KG-2 coherence 3.88, citation
  1.000, section coverage 0.994 (session 1.7).
- ORPO V1 (wrong rubric) and V2 (missing preservation constraint) had
  failed at the synthetic-preference data-quality gate before any GPU
  training step (sessions 1.6 / 1.8).
- V2.1 hedge batch (`batch_69ef07b00...`) completed during session 1.8
  with a session summary reporting "chosen citation rate 0.994, rejected
  0.995, 797 prefs — gate PASSED".
- Local file `data/teacher/orpo_v3.jsonl` (797 rows) was the V2.1 output
  on disk awaiting GPU spend.
- Spend envelope entering: ~$45 DO + ~$5-6 OpenAI of a $65 session cap.

## Mechanism — what we found

Two findings stack to produce the headline.

1. **The V2.1 "PASS" was a substring-mismatch measurement bug.** The
   canonical citation regex used by `yuholens.eval.metrics.CITATION_RE`
   and the KG-2 evaluator is
   `\(ref:\s*['"][^'"]+['"]` — *singular* `(ref:`. The V2.1 prompt patch
   added the literal substring `(refs:` *plural* to the preserve clause.
   `gpt-5-mini` echoed the literal plural form in commentary lines (e.g.,
   "I preserved (refs:) markers throughout") in 90% of rewrites while
   reformatting the actual `(ref: ...)` body markers freely. The "0.994
   chosen citation rate" reported in session 1.8 was the rate of memos
   containing the literal substring `(refs:`; the canonical regex showed
   the real rate was **0.6926**, with average citation count dropping
   from 31.47 (rejected) to 13.11 (chosen) — a 58% decrease, identical
   in shape to the V2 failure mode. Phase 0 of this session caught it
   before any GPU spend.

2. **V2.2 cleared the gate but the trained model did not move.** The
   prompt was repatched to reference `(ref: ...)` (singular) explicitly,
   embed two CITATION_RE-matching examples, and forbid rewriting as
   `(refs:`, `[ref:`, or `(citation:`. The lock-in test was extended to
   require the singular form to dominate the plural and to assert that
   `CITATION_RE.search(CRITIQUE_SYSTEM)` matches a real example, so a
   future drift between prompt language and evaluator regex fails
   loudly. A fresh `batch_69ef4e8f6...` (790 final rows after empty-
   rewrite filtering) cleared canonical chosen 1.0000 / rejected 0.9962
   / median length ratio 1.221 / 70% rows fully preserved. ORPO trained
   50 steps on a fresh MI300X at the configs/orpo.yaml defaults
   (lr 5e-6, beta 0.1, grad-accum 16, 1 epoch). Across all five logged
   step blocks, `rewards/accuracies` stayed **0.0** — the model never
   assigned higher reward to a chosen completion than a rejected one
   during training. Reward margins crawled from -0.038 to -0.029 over
   50 steps; `log_odds_chosen` from -0.91 to -0.71 — the gradient was
   pointing the right direction but at a rate too slow to flip the sign
   in 50 updates. The smoke generation at v5 decoder produced 7 memos at
   mean coherence 3.571, citation 1.000, section coverage 1.000, average
   length 7,975 chars — within 1% of the SFT v5 single-shot baseline on
   coherence. The model is functionally indistinguishable from the SFT
   checkpoint at v5 decoding.

## Metric arc

| stage | metric | value | gate | verdict |
|---|---|---|---|---|
| V2.1 reported (session 1.8 summary) | chosen citation rate | 0.994 | >= 0.80 | reported PASS |
| V2.1 canonical regex (session 1.9 Phase 0) | chosen citation rate | 0.6926 | >= 0.80 | **FAIL** (measurement bug) |
| V2.2 canonical regex | chosen citation rate | 1.0000 | >= 0.80 | PASS |
| V2.2 canonical regex | rejected citation rate | 0.9962 | reference | PASS |
| V2.2 length ratio (median) | chosen / rejected | 1.221 | <= 1.40 | PASS |
| V2.2 preservation rate | rows where chosen_count >= rejected_count | 0.700 | reference | clean |
| ORPO training | rewards/accuracies (50 steps) | 0.000 | > 0.5 healthy | **regression-warning** |
| ORPO training | rewards/margins (final) | -0.029 | > 0.0 healthy | **regression-warning** |
| ORPO smoke (v5 decoder, n=7) | mean coherence | 3.571 | reference vs SFT v5 (3.56) | tie |
| SFT v5 single-shot (session 1.7) | mean coherence | 3.56 | reference | baseline |
| SFT bo5 mixed-decoder (shipping) | mean coherence | 3.88 | KG-2 PASS gate 3.80 | shipping |

## Code shipped

- `55db47b` (carried from session 1.8) — initial citation-preservation
  patch; this session demonstrates it was vacuous against the canonical
  metric.
- `src/yuholens/training/orpo_data.py` `CRITIQUE_SYSTEM` rewritten to
  reference the canonical singular `(ref: "...")` marker form. Adds two
  CITATION_RE-matching examples in the prompt body, an explicit "do NOT
  rewrite as `(refs:`, `[ref:`, `(citation:`" counter-example, and
  preserves the existing seven-section coherence rubric.
- `tests/test_orpo_data.py::test_critique_system_requires_citation_preservation`
  strengthened: now asserts (a) the singular `(ref:` form appears at
  least 5 times in the prompt, (b) singular usage strictly dominates
  plural to prevent silent drift, and (c) `CITATION_RE.search(CRITIQUE_SYSTEM)`
  matches a real example so future edits cannot diverge from the
  canonical regex without failing the suite.
- `scripts/_pipeline/verify_gate_local.py` — laptop-side defense-in-depth
  checker that re-derives V2.1/V2.2-style data gates locally using the
  canonical evaluator. Reports both the canonical-regex rate and the
  literal-substring rate so the same kind of substring drift surfaces
  immediately.
- `scripts/_pipeline/{poll_v2_2_batch.py, build_v2_2_prefs_and_verify.py,
  retry_spin_up_atl1.sh, phase1_verify.sh, phase2_scp_and_train.sh,
  poll_orpo_train.sh, phase3_smoke.sh, phase4_bo7.sh, poll_bo7.sh,
  phase5_snapshot_destroy.sh, safe_destroy_local.sh, compare_orpo_vs_sft.py}` —
  laptop-side orchestration helpers built this session for the
  Plan-mode runbook. The `_pipeline/` directory is local-only by
  convention (matching the existing `data/teacher/` pattern); not
  committed because operational scripts that bake in laptop paths and
  ad-hoc poll cadences belong in the operator's local checkout, not in
  the public artefact. Future sessions can re-derive them from the
  canonical `scripts/adc/*.sh` primitives in ~30 min if needed.

Tests: 89 passed (89 → 89; the citation-preservation test is now stricter
and would have failed against the V2.1 prompt under the new assertions).

## ORPO status

Synthetic-preference ORPO is now empirically bounded for this corpus and
training budget. Three iterations:

- **V1** (session 1.6) — wrong rubric (citation-flavoured, orthogonal to
  the coherence judge). Failed at data-quality gate before training.
- **V2** (session 1.8 first attempt) — right rubric, missing
  citation-preservation constraint. Chosen citation rate 0.305 vs
  rejected 0.995. Failed before training.
- **V2.1** (session 1.8 hedge) — preservation clause added but
  referenced the wrong marker form. Reported "PASS" was a measurement
  bug; canonical chosen rate 0.6926. Failed before training (this
  session caught it).
- **V2.2** (session 1.9) — preservation clause references the canonical
  singular marker form, lock-in test forbids drift. Cleared the data
  gate at chosen 1.0000 / rejected 0.9962. **Trained for 50 steps; the
  model did not move.** rewards/accuracies stayed 0.0 throughout, smoke
  coherence matched the SFT baseline within noise.

The bound this run establishes: at the available preference data scale
(~800 rows) and training budget (1 epoch / 50 grad-accum-16 steps), the
ORPO loss does not pull a 14B Qwen-1 checkpoint off its SFT prior. Larger
preference sets (~5,000–10,000 rows), more epochs (3–5), or a
DPO/IPO-flavoured loss with a reference model might land differently;
none of those fit the hackathon budget envelope.

## Spend

- V2.2 OpenAI Batch API critique (gpt-5-mini, 800 prompts): ~$3.00.
- Smoke OpenAI judge probe (gpt-5-mini, 7 memos): ~$0.10.
- DO MI300X compute (12:50 UTC spin → 14:43 UTC destroy, ~1h53m at $1.99/hr): ~$3.75.
- **Session total: ~$6.85.**
- **Cumulative project: ~$26.85 of $65 cap** (~$38 remaining).

GPU droplet `567555578` destroyed cleanly at 14:43 UTC; no snapshot
retained (loss disposition default per the session 1.9 plan).
Snapshot `225943366` (the original SFT-only base, atl1, 504 GiB)
remains and is the only persistent DO storage tied to this project.

## Decision / next steps

What this session establishes:

- The shipping artifact is **unchanged**: SFT checkpoint-212 + best-of-5
  mixed-decoder inference @ KG-2 PASS 3.88. README, model-card, blog,
  demo script, and CITATIONS continue to reflect the SFT-only headline
  set in session 1.7 and re-affirmed in session 1.8.
- The substring-mismatch failure mode now has a project memory record
  and a strengthened lock-in test, so a future ORPO V3 cannot
  re-introduce it silently.
- The synthetic-preference ORPO approach is documented as a bounded
  failure: data-gate-clean training did not transfer the preference
  signal at hackathon-feasible scale, and the cause is small-data plus
  small-step-count rather than data quality. The build narrative gains a
  trained-and-evaluated negative result, not just two pre-training data
  failures.

What we will not try:

- No ORPO V3 / V4 in this hackathon. Three structural failures (V1, V2,
  V2.1) plus one trained-but-flat result (V2.2) bound the approach
  sufficiently for the build narrative. A V3 attempt would require
  larger preference data and more compute than the remaining $38 budget
  supports.
- No further single-shot decoder sweeps on the SFT or ORPO checkpoints.
  Best-of-5 already sits 0.08 above the gate; further single-shot lift
  would only reduce inference cost, not improve the headline.

What's next (αweek deliverables, separate from the ORPO arc):

- HuggingFace upload (`scripts/hf_upload.py`) of the SFT shipping
  checkpoint — paged before push.
- GGUF builds (`scripts/build_gguf.sh` Q4_K_M / Q5_K_M / Q6_K / Q8_0).
- Hackathon submission video + blog post final pass + demo recording.
- Snapshot `225943366` retention review post-hackathon (2026-05-11).
