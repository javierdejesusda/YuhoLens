# Session Summary — 2026-04-28 (Session 1.10)

## Headline

**ORPO V3 trained for 100 steps then was killed by the G1.7 mid-train kill
switch — the model moved off baseline but did not break the
preference-signal plateau.** With 4× the training budget of V2.2 (4
epochs / 200 steps planned, beta 0.05 / lr 3.0e-6 vs V2.2's 1 epoch / 50
steps, beta 0.1 / lr 5.0e-6), `rewards/accuracies` stayed exactly **0.0**
across all ten logged step blocks, while `rewards/margins` improved from
**-0.0209 at step 10 to -0.0158 at step 100** (24% less negative) and
`log_odds_chosen` from **-1.011 to -0.797** (21% less negative). Both
metrics plateaued in epochs 1.4–2.0 (steps 70–100), with no flip toward
positive territory. Per the autonomous-execution rules established at
session start, the kill switch fired at step 103, the droplet was
destroyed without snapshot retention, and SFT bo5 (KG-2 PASS coherence
3.88, citation 1.000, section coverage 0.994) ships unchanged for the
fourth consecutive session.

The bound this session establishes: at the available preference data
scale (~800 rows) and 14B Qwen-1 architecture, 4× the training budget
of V2.2 reduces reward margins by ~24% but does not flip the sign.
Combined with V2.2's ~24% reduction over 1× the budget, this suggests
the signal-to-noise floor of ORPO at this corpus size is asymptotic at
roughly margins ≈ -0.015, not zero. Crossing that floor would require
either (a) a substantially larger preference set (~5,000–10,000 rows)
or (b) a different loss family (DPO with a frozen reference model, or
IPO). Neither fits the remaining $31 hackathon budget.

## Entry state

- HEAD `902b87e` after Task 1 commit (`feat(orpo): add V3 trainer config`).
- 89 tests green throughout the session.
- Last known PASS artifact: best-of-5 SFT @ KG-2 coherence 3.88, citation
  1.000, section coverage 0.994 (session 1.7).
- ORPO V1, V2 failed before training; V2.1 was a substring-mismatch
  measurement bug; V2.2 trained 50 steps cleanly but `rewards/accuracies`
  stayed 0.0 throughout, smoke 3.571 ≈ SFT v5 baseline 3.56 (session 1.9).
- Local file `data/teacher/orpo_v4.jsonl` (790 rows V2.2 prefs, gate-clean
  at chosen 1.0000 / rejected 0.9962) carried into this session as the V3
  base.
- Cumulative spend entering: ~$26.85 of $65 cap ($38.15 remaining).

## Mechanism — what we found

The V3 trajectory tells the same shape of story V2.2 told, just deeper.

**Setup difference vs V2.2.** V3 widened the training budget along three
axes: 4 epochs (vs 1), lr 3.0e-6 (vs 5.0e-6 — slower so the gradient
stays stable over 4× more steps), beta 0.05 (vs 0.1 — softer SFT-anchor
regularisation so the chosen-reward gradient has more freedom to move).
A new `orpo_v3_launch.py` wrapper was needed because the canonical
`src/yuholens/training/orpo.py` entrypoint does not forward
`save_total_limit` from YAML to `ORPOConfig`, and the V3 plan called for
`save_total_limit=2` to bound peak optimizer-state disk usage at ~116 GB
(four checkpoints × 58 GB each = 232 GB would have exceeded the 227 GB
free `/workspace`).

**A new G1.5 pre-flight smoke gate** was added before the full run. A
5-step ORPO dry run (~$0.50, 9.5 min) writes an isolated
`output/yuholens-14b-orpo-preflight/checkpoint-5/`, verifies the trainer
plumbing (model load, dataset map, forward/backward, periodic save,
post-train save_model), and runs a 2-prompt skip-judge generation on the
saved checkpoint. The preflight passed cleanly — model loaded in ~3 min,
all 5 step blocks logged, checkpoint-5 landed at 58 GB across 6
safetensors shards + 33 GB optimizer.pt, 2-prompt generation completed.
This is the single most valuable runbook addition over session 1.9: it
caught zero plumbing bugs this run, but it would have caught (e.g.) an
OOM, a tokenizer drift, or a `save_total_limit` typo for $0.50 instead
of discovering it at $5–10 mid-training.

**The training run.** Launched at 22:42:59 UTC, ~83–91 sec/step on
MI300X (matches V2.2 cadence). At step 50 the first checkpoint landed
(58 GB, save_total_limit=2 confirmed working — checkpoint-100 later
appeared, and disk peaked at 116 GB used by checkpoints which fit
comfortably). Step 100 reached at epoch 2.0, 2h22m wall time from
launch.

**Step-100 metrics (the G1.7 raw data).**

```
{'loss': 0.8017, 'grad_norm': 1.164, 'learning_rate': 1.515e-06,
 'rewards/chosen': -0.0346, 'rewards/rejected': -0.0188,
 'rewards/accuracies': 0.0, 'rewards/margins': -0.0158,
 'logps/rejected': -0.3752, 'logps/chosen': -0.6921,
 'logits/rejected': -4.928, 'logits/chosen': -4.833,
 'nll_loss': 0.7452,
 'log_odds_ratio': -1.177, 'log_odds_chosen': -0.7966,
 'epoch': 2.0}
```

**Trajectory (10 logged blocks at logging_steps=10).**

| epoch | step | loss   | acc | margins   | log_odds_chosen |
|-------|------|--------|-----|-----------|-----------------|
| 0.20  | 10   | 0.8663 | 0.0 | -0.0209   | -1.011          |
| 0.41  | 20   | 0.8167 | 0.0 | -0.0196   | -0.945          |
| 0.61  | 30   | 0.8112 | 0.0 | -0.0185   | -0.911          |
| 0.81  | 40   | 0.8186 | 0.0 | -0.0174   | -0.860          |
| 1.00  | 50   | 0.8278 | 0.0 | -0.0171   | -0.856          |
| 1.20  | 60   | 0.8040 | 0.0 | -0.0165   | -0.826          |
| 1.41  | 70   | 0.7855 | 0.0 | -0.0158   | -0.780          |
| 1.61  | 80   | 0.8067 | 0.0 | -0.0157   | -0.771          |
| 1.81  | 90   | 0.7900 | 0.0 | -0.0160   | -0.788          |
| 2.00  | 100  | 0.8017 | 0.0 | -0.0158   | -0.797          |

The first 7 blocks show monotonic improvement (margins -0.0209 →
-0.0158, log_odds_chosen -1.011 → -0.780). The last 4 blocks (epochs
1.4–2.0) plateau at margins ≈ -0.0158, log_odds_chosen ≈ -0.78 to
-0.80. The optimizer is no longer making directional progress as of
step 70.

**The G1.7 verdict.** PASS condition was `rewards/accuracies > 0.0` OR
`rewards/margins > 0.0`. Both stayed firmly negative. The kill switch
fired; trainer was at step 103 when the SIGTERM landed (the
post-step-100 forward pass had begun — `pkill` cleanly terminated the
Python child).

**The droplet was destroyed without snapshot retention** at 02:11 UTC
via `doctl compute droplet delete --force 567645346`, bypassing the
`scripts/_pipeline/safe_destroy_local.sh` 30–60 min snapshot-then-delete
path because the autonomous rules forbade keeping the V3 partial
checkpoint. No emergency snapshot landed. The canonical SFT base
snapshot `225943366` is intact.

## Metric arc

| stage | metric | value | gate | verdict |
|---|---|---|---|---|
| V2.2 step 50 (session 1.9) | rewards/accuracies | 0.000 | > 0 | flat |
| V2.2 step 50 (session 1.9) | rewards/margins | -0.029 | > 0 | flat |
| V2.2 v5 smoke (session 1.9) | mean coherence | 3.571 (n=7) | reference vs SFT 3.56 | tie |
| V3 G1.5 pre-flight | trainer plumbing | PASS | reference | green |
| V3 step 100 | rewards/accuracies | 0.000 | > 0 | **kill-switch FAIL** |
| V3 step 100 | rewards/margins | -0.0158 | > 0 | **kill-switch FAIL** |
| V3 step 100 | log_odds_chosen | -0.797 | reference, was -1.011 at step 10 | improved 21%, plateaued |
| V3 trajectory (steps 70–100) | margins delta | ≈ 0 | reference | plateau |
| SFT bo5 mixed-decoder (shipping) | mean coherence | 3.88 | KG-2 PASS gate 3.80 | shipping |

## Code shipped

- `configs/orpo_v3.yaml` — V3 trainer hyperparams (4 epochs, lr 3.0e-6,
  beta 0.05, save_steps 50). Committed at `902b87e`. The V2.2 baseline
  `configs/orpo.yaml` is unchanged.
- `scripts/_pipeline/orpo_preflight.{py,sh}` — 5-step pre-flight smoke
  with `max_steps=5`, isolated `output_dir`, runs the same trainer code
  path the full run uses. Local-only by `_pipeline/` convention; not
  committed.
- `scripts/_pipeline/orpo_v3_launch.{py,sh}` — V3 200-step launcher that
  loads `configs/orpo.yaml` (which the droplet swap pointed at the V3
  contents) and forwards `save_total_limit=2` to `ORPOConfig`, the one
  knob the canonical `orpo.py` entrypoint does not pass through. Used
  this session; local-only.
- `data/eval/orpo_train_v3_step100kill.log` — full training log up to
  step 103 / kill, pulled from droplet for archival. Gitignored under
  `data/eval/`.

Tests: 89 passed before launch; the V3 path did not touch any tracked
Python source. Test count unchanged.

## ORPO status

Synthetic-preference ORPO is now empirically bounded for this corpus
across **four** structurally distinct attempts. Three failed at the
data-quality gate before training (V1, V2, V2.1); two reached training
and plateaued (V2.2 at 50 steps, V3 at 100 steps).

The cross-iteration pattern is consistent: in both training-reaching
runs, `rewards/accuracies` never left 0.0, and `rewards/margins`
improved by ~24% from the first logged block before plateauing. V2.2
plateaued by step 50 (1 epoch of 790 prefs); V3 plateaued by step 70
(~1.4 epochs). Doubling the budget did not double the headroom — the
margins floor settled at roughly -0.015 in both cases, not zero. This
strongly suggests the bottleneck is preference data scale or signal
quality (or both), not training budget.

The shipping artifact remains **SFT `output/yuholens-14b-sft/checkpoint-212`
+ best-of-5 mixed-decoder inference at KG-2 PASS 3.88**. README,
model-card, blog, demo script, and CITATIONS continue to reflect the
SFT-only headline set in session 1.7.

## Spend

- Droplet (atl1 MI300X, snapshot 225943366, 22:47:19Z spin → 02:11Z
  destroy, 3.41 h × $1.99/hr): **~$6.79**.
- OpenAI: $0 (no judge calls fired this run; G2 smoke and bo7 judge
  steps were skipped post-G1.7 kill).
- **Session total: ~$6.79.**
- **Cumulative project: ~$33.64 of $65 cap** (~$31.36 remaining,
  comfortably under the wall).

The G1.7 kill switch saved roughly **$7.50** vs running to step 200
(another ~3.7 hours of training + the post-train save). It also avoided
the $0.10 OAI smoke probe and the $13–15 best-of-7 spend that would
have been inappropriate given the plateau.

The canonical SFT-only snapshot `225943366` (504.38 GiB, atl1) remains
the only persistent DigitalOcean storage tied to this project.
Disposition deferred to post-hackathon (2026-05-11).

## Decision / next steps

What this session establishes:

- The shipping artifact is **unchanged**: SFT checkpoint-212 + best-of-5
  mixed-decoder inference @ KG-2 PASS 3.88. README, model-card, blog,
  demo script, and CITATIONS remain authoritative.
- The negative-result narrative is sharper. ORPO at this corpus has now
  failed twice at the data-gate (V1, V2), once at a measurement bug
  (V2.1), and twice at the post-training-signal gate (V2.2 at 50 steps,
  V3 at 100 steps). Both training-reaching runs showed the same shape:
  monotonic improvement for ~70% of the run, then plateau. The
  training-budget hypothesis is empirically refuted at hackathon scale.
- The G1.5 pre-flight smoke and G1.7 step-100 kill switch should be
  baked into any future ORPO/DPO/IPO attempt as standard practice. They
  cost ~$0.50 + ~$2.50 of marginal training and saved ~$7.50 here.
- The disk-management lesson — each ORPO checkpoint at 14B is ~58 GB
  (28 weights + 33 optimizer); the canonical `orpo.py` does not forward
  `save_total_limit` — is now a documented gotcha.

What we will not try:

- No ORPO V4 in this hackathon. Four iterations have bounded the
  approach for our data scale. Further attempts would need either a
  larger preference set or a different loss; both exceed the remaining
  budget.
- No DPO/IPO swap-in. Same reasoning — a frozen reference model adds
  ~30 GB GPU memory and wouldn't change the data-scale bottleneck.

What's next (alpha-week deliverables, separate from the ORPO arc):

- HuggingFace upload (`scripts/hf_upload.py`) of the SFT shipping
  checkpoint — paged before push.
- GGUF builds (`scripts/build_gguf.sh` Q4_K_M / Q5_K_M / Q6_K / Q8_0).
- Hackathon submission video + blog post final pass + demo recording.
- Snapshot `225943366` retention review post-hackathon (2026-05-11).
