# Session Summary — 2026-04-26 (Session 1.8)

## Headline

**ORPO V2 abandoned at the citation gate.** The synthetic preference batch
produced rewrites that strip citations from already-grounded SFT drafts
(chosen citation rate 0.305 versus rejected rate 0.995, gate threshold
0.80). Training on this data would teach the model to drop citations,
strictly worse than the SFT baseline. No retrain was attempted.

The shipping artifact is unchanged from session 1.7: SFT
`output/yuholens-14b-sft/checkpoint-212` plus the best-of-5 mixed-decoder
inference layer that hit KG-2 PASS at coherence 3.88. The negative ORPO
result is documentable and bounds the synthetic-preference approach for
citation-grounded memo generation.

## Entry state

- Last known PASS artifact: best-of-5 over `[v4, v5, bo3_s1, bo3_s2,
  bo3_s3]`, mean coherence 3.88, citation 1.000, section coverage 0.994
  (session 1.7).
- ORPO infrastructure on disk and ready: `configs/orpo.yaml` model_id
  pinned to `checkpoint-212`, coherence-flavoured `CRITIQUE_SYSTEM`,
  drafts generator `run_sft_drafts.py`, gate script in place.
- Spend envelope entering session: ~$72.37 DigitalOcean credit, ~$8
  OpenAI.
- Goal: lift the single-shot distribution above 3.88 by ORPO-aligning
  the SFT checkpoint against gpt-5-mini critique rewrites at the v5
  decoder profile.

## Mechanism — what went wrong

Two structural problems compounded.

1. **The critique prompt forbade inventing citations but never required
   preserving existing ones.** The `CRITIQUE_SYSTEM` from session 1.7
   carried a "do not invent new citations" clause aimed at preventing
   the rewriter from gaming the citation metric. gpt-5-mini read that
   clause as license to drop citations entirely whenever a body claim
   felt structurally weak. The SFT drafts entering critique already had
   near-perfect citation grounding (0.995), so the rewrites had nowhere
   to go but down.
2. **The gate's chosen-vs-rejected asymmetry fully inverted.** The
   "chosen" rewrite — the supposedly stronger ORPO target — averaged
   0.305 citation rate, while the "rejected" SFT draft averaged 0.995.
   ORPO trained on these pairs would minimise reward on citation-rich
   completions and maximise it on citation-poor ones. This is the exact
   opposite of the desired behaviour for a citation-grounded memo
   generator.

This is the second structural failure of synthetic-preference ORPO on
this project: V1 used the wrong rubric (citation-flavoured, not
coherence-flavoured); V2 used the right rubric but the wrong
constraint. The gate caught both before any GPU training cost was
incurred — defense-in-depth on data quality is the lesson.

A separate orchestration mechanism worked exactly as designed:
`auto_pipeline.sh` deployed to droplet `567209998` at 01:04 UTC included
a `safe_destroy()` trap that snapshots and destroys the droplet on
EVERY exit path. At 04:30:17 the pipeline triggered safe_destroy
mid-Phase-3; the exact root cause is not preserved in the log tail,
but snapshot `226314834` (505 GiB) was created cleanly and the droplet
was destroyed with no idle GPU bill. Recovery on a new droplet
`567491199` confirmed the OpenAI batch had completed (800/800, 0
failed) while the droplet was down, and the poll-and-build step ran
locally with no GPU dependency.

## Metric arc

| stage | metric | value | gate | verdict |
|---|---|---|---|---|
| SFT drafts (input pool) | citation rate | 0.995 | n/a | baseline |
| ORPO V2 chosen (gpt-5-mini rewrite) | citation rate | 0.305 | >= 0.80 | **FAIL** |
| ORPO V2 rejected (SFT draft) | citation rate | 0.995 | n/a | reference |
| length ratio chosen / rejected (median) | ratio | 1.168 | <= 1.40 | pass |
| mean chosen length | chars | 7,645 | n/a | reference |
| mean rejected length | chars | 6,920 | n/a | reference |

The length ratio gate passed comfortably; the rewriter was not padding
to game length. The failure was specifically and only citation
preservation.

## Code shipped

- **No commits this session.** The only code change is a working-tree
  patch to `src/yuholens/training/orpo_data.py` `CRITIQUE_SYSTEM` that
  promotes citation preservation from absent constraint to a hard,
  explicit rule. New text added under "What you must NOT change"
  requires the rewriter to "PRESERVE EVERY (refs: ...) citation marker
  that appears in the draft" verbatim, forbids deleting / renaming /
  merging / rewording / reordering existing tags, requires distinct
  spans to appear at least as many times as in the draft, and pins
  unsupported claims to "not disclosed" while keeping the associated
  marker attached. The patch sits uncommitted pending the V2.1 hedge
  result.
- Tests unchanged at 65 passed (no regressions, no additions).

## ORPO status

Now blocked at preference data quality, not infrastructure. Training
config, drafts generator, gate, and orchestration scaffolding all work.
The remaining failure surface is the critique prompt: without explicit
citation-preservation enforcement, gpt-5-mini drops citations
~70% of the time on this draft pool.

Hedge in flight: one fresh OpenAI batch (~$3) with the patched
`CRITIQUE_SYSTEM` will re-run the same 800 drafts and re-check the
gate. If chosen citation rate clears 0.80, GPU spend on ORPO retrain
becomes reconsiderable. If it fails again, synthetic-preference ORPO
is conclusively the wrong tool for citation-grounded memo generation
on this corpus, and the project ships best-of-5 at 3.88 as the
headline.

## Spend

- Drafts V2 generation on MI300X (~3 hours @ $1.99/hr): ~$10.
- Recovery droplet (~30 minutes @ $1.99/hr): ~$1.
- Misc (snapshot transfer, brief rescore probe): ~$5.
- OpenAI gpt-5-mini critique batch (800 requests, completed): ~$3.
- **Session total: ~$18-23.**
- Remaining: ~$72.37 DigitalOcean credit, ~$5-6 OpenAI credit.

GPU droplet `567491199` destroyed at end of recovery. Snapshot
`226314834` deleted (drafts.jsonl, orpo.jsonl, raw critiques all
already on local disk; nothing irreplaceable left in the snapshot).

## Decision / next steps

What we will try:

- Resubmit one fresh gpt-5-mini critique batch (~$3) against the
  patched `CRITIQUE_SYSTEM` and re-run the citation gate locally. No
  GPU spend until the gate clears.
- If the gate clears, weigh ORPO retrain (~$15-20 GPU + judge passes)
  against the marginal lift it would buy over the existing 3.88 PASS.

What we will not try:

- No third synthetic-preference variant if V2.1 fails the gate. Two
  structural failures already bound the approach; a third would not
  pay for itself.
- No further single-shot decoder sweeps. Best-of-5 already sits 0.08
  above the gate; further single-shot lift would only reduce inference
  cost, not improve the shipping headline.
- No interactive judge experiments. The cached / fresh judge gap from
  session 1.7 already characterised the noise floor.

Session 1.7's PASS artifact remains the shipping headline. The
negative ORPO result documents the bound and adds technical credibility
to the build narrative — the project chose the higher-PASS, lower-cost
path on evidence rather than on convenience.
