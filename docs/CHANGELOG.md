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
