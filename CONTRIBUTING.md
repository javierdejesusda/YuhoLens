# Contributing to YuhoLens-Pipeline

Thank you for thinking about contributing. YuhoLens is a research artefact
produced for the AMD Developer Hackathon (lablab.ai, May 2026). Issues and
pull requests are welcome — both for the wrapper code and for the released
model weights.

## Scope of contributions

The repository is split into two layers with different licences and
different acceptance criteria.

- **Wrapper code (MIT).** Anything under `src/yuholens/`, `scripts/`,
  `tests/`, `docs/`, `configs/`. Pull requests are welcome here. Coding
  style and review guidance are in `pyproject.toml` (`[tool.ruff]`) and
  the `Coding standards` section below.
- **Model weights (Tongyi Qianwen).** Released on HuggingFace at
  `yuholens/yuholens-14b`. Weight changes happen via re-training on the
  MI300X. Bug reports against the released checkpoint are welcome as
  GitHub issues; PRs touching weights are not.

## Filing an issue

Please include:

- The Python version and operating system.
- The exact command you ran and the full traceback (or the unexpected
  output) — copy-paste; do not paraphrase.
- For training-side issues: the GPU you targeted and the relevant
  excerpt from `pip freeze`.
- For inference-side issues: the model artefact identifier (BF16
  checkpoint or GGUF quant) and the LangGraph node that surfaced the
  problem (Ingestor, Pass-1, MemoCriticAgent, or Citation-Grounder).

## Sending a pull request

1. **Open an issue first** for non-trivial changes so the design can be
   discussed before code is written.
2. **Fork, branch, and run the test suite.** New behaviour must come
   with a test:
   ```bash
   pip install -e .[dev]
   PYTHONPATH=src python -m pytest tests/ -q
   ```
   The CI workflow in `.github/workflows/test.yml` is the gate; CI must
   stay green to merge.
3. **Match the existing style.** Google Python style is enforced by
   ruff (`pip install -e .[dev]` then `ruff check`); the configuration
   lives in `pyproject.toml`. The `.pre-commit-config.yaml` hook runs
   the same checks locally.
4. **Keep the diff focused.** A bug fix does not need to refactor the
   surrounding code; a feature does not need to add tooling or
   abstractions beyond what the feature itself needs.
5. **Write the commit message in the project style.** Lowercase
   prefix, scoped, no AI-tool mentions, no emojis. Match the format you
   see in `git log --oneline -20`.

## Coding standards

- **Python 3.12** is the only supported runtime.
- **Google-style docstrings** — `Args:`, `Returns:`, `Raises:` blocks.
  No banner comments (`# ===`, `# ---`), no `print(f"{'='*72}")`.
- **Imports grouped** stdlib → third-party → local, separated by blank
  lines. Ruff's `I` rule enforces this.
- **Tests live in `tests/`** with the `test_` prefix. Tests must run
  on a laptop with no GPU, no MI300X access, and no OpenAI key (mock
  the judge client).
- **Never commit** secrets, the `.env` file, the `.claude/` directory,
  the `CLAUDE.md` file, anything in `data/teacher/` or `data/eval/`,
  or implementation-plan files under `docs/superpowers/`.

## Boundaries that must not be crossed

- Do not introduce a hard dependency on torch, transformers, or
  flash-attn in laptop-runnable test paths. CI does not install the
  GPU stack.
- Do not silently lower the citation grounding gate: every claim in a
  generated memo must either cite a Pass-1 span or be replaced with
  `[evidence insufficient]`. Abstention is a feature, not a failure
  mode.
- Do not bypass the `require_tables` check in the best-of-N path.
  Fabricating accrual or earnings analysis under missing-table input
  is a trust-boundary regression.

## Code of conduct

Be civil, be specific, and assume good faith. The project is small
enough that we do not maintain a separate CODE_OF_CONDUCT.md; treat
issues and PRs the way you would treat a respectful colleague's
review.

## Contact

- GitHub issues: https://github.com/javierdejesusda/YuhoLens/issues
- Email: javier.dejesusj9@gmail.com
