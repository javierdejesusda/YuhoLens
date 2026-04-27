# Changelog

All notable engineering milestones for YuhoLens-Pipeline. Dates are
hackathon calendar days; commit hashes refer to `main` on
`github.com/javierdejesusda/YuhoLens`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project does not yet follow semantic versioning because the public
artefact is the HuggingFace checkpoint, not a Python package release.

## [Unreleased]

Phase-9 ship-readiness: operator CLI, offline picker, release validator,
README rewrite, sample fixture, social-media refresh, CI, pre-commit.

### Added

- `python -m yuholens.agents` operator CLI for the 4-agent composer with
  `--best-of-n / --judge-mode / --n-candidates` flags.
- `scripts/run_bestofn_offline.py` for heuristic-only best-of-N picking
  without OpenAI calls.
- `scripts/check_release_set.py` pre-HF-upload validator (tokenizer,
  generation_config v5 invariants, weights, architecture).
- `scripts/hf_upload.py` that patches `generation_config.json` to v5
  defaults before pushing to the Hub.
- `scripts/build_gguf.sh` covering Q4_K_M / Q5_K_M / Q6_K / Q8_0.
- `data/sample/sample_yuho.jsonl` so the README quickstart works on a
  fresh clone.
- `.github/workflows/test.yml` running `pytest` on push and PR.
- `.pre-commit-config.yaml` wired to the existing ruff config.
- `docs/CHANGELOG.md` (this file).
- `MemoCriticAgent` LangGraph node + `decoder_profiles.py` catalogue.
- `JudgeUnavailableError` with auto-fallback to the heuristic when the
  judge backend is unreachable, and a finite-score guard against
  silently picking an unscored candidate.

### Changed

- README rewritten with the KG-2 PASS headline, metric arc, mermaid
  4-agent diagram, cost table, and a sharper quickstart.
- `docs/social_media.md` refreshed with the real PASS metrics
  (3.88 coherence, 1.000 citation, 0.994 section coverage).
- `docs/blog_post.md` numbers replaced with the metric arc and the
  cross-decoder vs cross-seed finding.
- `docs/demo_script.md` adds a 5-minute live walkthrough alongside the
  90-second submission video script.
- `docs/model-card.md` quantization table now lists Q8_0 and references
  the new build script.
- `scripts/mi300x_preflight.py` performs a real OpenAI auth probe
  instead of bare env-var presence.
- `pyproject.toml` and `requirements.txt` add `huggingface_hub` and
  `safetensors` to runtime deps; new `release` extra collects
  matplotlib for figure rendering.

## [2026-04-27] — Session 1.9 — ORPO V2.1 measurement bug, V2.2 trained-but-flat

### Changed

- `CRITIQUE_SYSTEM` in `src/yuholens/training/orpo_data.py` now references
  the canonical singular `(ref: "...")` citation marker form explicitly,
  with two `CITATION_RE`-matching examples and a counter-example that
  forbids rewriting markers as `(refs:`, `[ref:`, or `(citation:`. The
  V2.1 patch had referenced the plural `(refs:` form, which does not
  match the canonical evaluator regex; under the canonical regex the
  V2.1 hedge "PASS" was actually chosen 0.6926 / rejected 0.9950 — a
  measurement bug, not a real gate clearance.
- `tests/test_orpo_data.py::test_critique_system_requires_citation_preservation`
  strengthened to (a) require the singular `(ref:` form to dominate the
  plural in count, (b) require at least 5 occurrences of the singular
  form, and (c) assert that `CITATION_RE.search(CRITIQUE_SYSTEM)` matches
  a real example. Future drifts between prompt language and evaluator
  regex now fail this test loudly.

### Result

V2.2 critique batch (gpt-5-mini, 800 prompts, ~$3) cleared the
canonical-regex data gate cleanly: chosen citation rate **1.0000**,
rejected **0.9962**, median length ratio 1.221, 70% of rows fully
preserve all citations, 790 prefs after empty-rewrite filtering. ORPO
trained 50 steps in ~71 min on a fresh MI300X (atl1, snapshot 225943366,
~$3.75 compute) at the configs/orpo.yaml defaults. Across all five
logged step blocks, `rewards/accuracies` stayed **0.0** and reward
margins stayed negative — the preference signal did not transfer at
this data scale and step count. Smoke at the v5 decoder (n=7) produced
mean coherence **3.571**, citation 1.000, section coverage 1.000 —
indistinguishable from the SFT v5 single-shot baseline of 3.56 within
judge noise. Best-of-7 generation was skipped on the basis of the smoke
result + training-time signal (expected bo7 mean would tie SFT bo5 at
3.88, not exceed it). Shipping artifact unchanged from session 1.7
(SFT bo5 @ KG-2 PASS 3.88). Negative ORPO arc now spans three failed
data-gate iterations plus one trained-and-evaluated tie, documenting
the bound for the build narrative. Session note in
`docs/session_2026-04-27_summary.md`.

## [2026-04-26] — Session 1.8 — ORPO V2 negative result

### Changed

- `CRITIQUE_SYSTEM` in `src/yuholens/training/orpo_data.py` requires the
  rewriter to PRESERVE EVERY `(refs: ...)` citation marker from the SFT
  draft verbatim and never delete, rename, merge, reword, or reorder
  existing tags (`55db47b`). Locked in by
  `tests/test_orpo_data.py::test_critique_system_requires_citation_preservation`.
- `docs/blog_post.md` corrected: the previous draft claimed ORPO ran on
  ~1,000 preference pairs and that infrastructure was staged but not
  exercised. ORPO was wired end-to-end and tried twice; both attempts
  failed at a pre-training data-quality gate before any GPU training
  step (`cd0f0cf`).
- `docs/model-card.md` abstract no longer claims "supervised fine-tuning
  and reference-free preference optimization"; the shipped artifact is
  SFT only. Training, hyperparameter table, evaluation, and limitations
  sections all updated to reflect the two ORPO data-gate failures
  (`e01823d`).

### Result

ORPO V2 critique batch (gpt-5-mini, 800 prompts) landed at chosen
citation rate **0.305** versus rejected **0.995** — a hard fail on the
0.80 gate. No GPU training step was run. Shipping artifact unchanged
from session 1.7 (best-of-5 SFT @ 3.88 KG-2 PASS). Negative result and
$3-OpenAI prompt-patch hedge plan documented in
`docs/session_2026-04-26_summary.md`.

## [2026-04-25] — Session 1.7 — KG-2 PASS

### Added

- `src/yuholens/eval/run_sft_drafts.py` for ORPO draft generation at v5
  decoding (`b16e8d7`).
- `scripts/bestofn_pick.py` to pick the highest-coherence memo per
  `custom_id` from N candidate sets via cached judge scores
  (`b16e8d7`).
- `scripts/bestofn_judge.py` fresh-pass scorer that judges every memo
  across N candidate sets in a single session (`f6ac0d6`).
- `scripts/bo3_finalise.sh` orchestrating the post-best-of-3 pipeline
  (`15ac06c`).
- `--seed` and `--skip-judge` flags on `run_kg2.py` so candidate sets
  are independently reproducible (`f6ac0d6`).

### Changed

- ORPO `CRITIQUE_SYSTEM` rewritten to embed the seven-section coherence
  rubric, replacing citation-grounded language that was orthogonal to
  what the KG-2 judge actually scores (`b16e8d7`).
- `configs/orpo.yaml` `model_id` corrected to `checkpoint-212`.

### Result

KG-2 PASS at coherence **3.88**, citation rate **1.000**, section
coverage **0.994** under the best-of-5 mixed-decoder composer. Verdict
documented in `docs/session_2026-04-25_summary.md` (committed in
`9b17222`).

## [2026-04-22] — Session 1.6 — SFT polish module

### Added

- LM-head + last-4-layers SFT polish module (`a14834c`). Polish
  experiment regressed KG-2 to 3.26 (-0.30) and was abandoned in favour
  of inference-time best-of-N.

## Pre-history (2026-04-17 onwards)

Initial SFT loop, teacher bootstrap, ROCm bitsandbytes source build,
ingestor regex tuning, Pass-1 / Pass-2 prompt design, citation-grounder
with `[evidence insufficient]` abstention, kill-gate metrics, and the
six-variant decoding sweep that established v5 as the single-shot
default.
