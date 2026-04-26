# Troubleshooting

Common problems and their resolutions, organised by which part of the
pipeline first surfaces the symptom. Most of these are gotchas that
cost real time on the project; the structured form is intended to
save the next contributor an afternoon of debugging.

## Installation

### `bitsandbytes` import fails on ROCm

**Symptom.** `ImportError: libbitsandbytes_cpu.so` or
`AttributeError: '...' has no attribute 'cadam32bit_grad_fp32'`.

**Cause.** PyPI ships only the CUDA build. ROCm 7.0 has no prebuilt
wheel for `gfx942` (MI300X).

**Fix.** Build from source against the ROCm fork:

```bash
bash scripts/install_bnb_rocm.sh
```

The script clones `ROCm/bitsandbytes` branch `rocm_enabled` and runs
`cmake -DCOMPUTE_BACKEND=hip -DBNB_ROCM_ARCH="gfx942"`, then verifies
the resulting `libbitsandbytes_rocm*.so` is importable before
returning.

### `flash_attention_2` silently downgrades to vanilla attention

**Symptom.** Throughput on MI300X is ~30% lower than the Qwen1
baseline expects; CPU temperature climbs faster than GPU.

**Cause.** Hugging Face's `attn_implementation="flash_attention_2"`
kwarg does not work for Qwen1 models. The Qwen1 `modeling_qwen.py`
expects to be told via config, not kwargs.

**Fix.** Set `cfg.use_flash_attn = "auto"` on the config object before
loading the model:

```python
from transformers import AutoConfig, AutoModelForCausalLM

cfg = AutoConfig.from_pretrained(MODEL_ID, trust_remote_code=True)
cfg.use_flash_attn = "auto"   # Qwen1-specific, NOT HF-generic
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID, config=cfg, trust_remote_code=True, torch_dtype="bfloat16",
)
```

## Training

### CUDA OOM on a fresh MI300X session

**Symptom.** First training step OOMs even though the math says the
model should fit.

**Cause.** Other processes (a previous run that did not cleanly exit,
nvidia-smi monitor, vLLM smoke test) are still holding HBM3.

**Fix.** `rocm-smi --resetgpu` (rare, last resort) or restart the
container. `nvidia-smi` does not work on ROCm; use `rocm-smi` and
`amd-smi` instead.

### TRL ORPOTrainer import fails

**Symptom.** `ImportError: cannot import name 'ORPOTrainer' from 'trl'`.

**Cause.** `trl.experimental.orpo` lives under the experimental
namespace in TRL 1.2.0.

**Fix.** Pin `trl>=1.2.0,<2.0.0` in `requirements.txt` and import via
the experimental path:

```python
from trl.experimental.orpo import ORPOTrainer  # not trl.ORPOTrainer
```

If TRL promotes the trainer in a future release, update the import
and the pin together.

## Evaluation

### Coherence judge returns malformed scores

**Symptom.** `judge_coherence` raises `ValueError("Judge parse rate
… below minimum 90%")` even though the judge appears to be running.

**Cause.** Either the judge is hallucinating prose around the digit
(common with `gpt-5` if the system prompt is truncated by the cache),
or the rubric was edited and dropped the "Return ONLY a single
integer" instruction.

**Fix.** Verify `DEFAULT_RUBRIC` ends with the integer-only directive.
If you trim the rubric, keep that line. As a fallback, run the
`MemoCriticAgent` with `judge_mode="auto"` so it falls back to the
heuristic when the judge backend misbehaves.

### `OPENAI_API_KEY` set, but the run aborts late with 401

**Symptom.** Generation completes, then the judge call dies with
`AuthenticationError`.

**Cause.** The key is invalid but present in `.env`. The basic
preflight only checked presence.

**Fix.** Run `python scripts/mi300x_preflight.py` — it now performs a
real `models.list()` auth probe and refuses to greenlight a run with
an invalid key. Bypass the probe with
`YUHOLENS_PREFLIGHT_SKIP_OPENAI_AUTH=1` only if you know what you are
doing.

## Inference

### Pass-2 memo claims missing accrual or earnings analysis

**Symptom.** The shipped memo skips section 3 (accrual quality) or
section 4 (earnings direction) and reads as a stub.

**Cause.** The composer was run in degraded mode with empty BS / PL /
CF tables. Without the financial-statement JSON, the model has nothing
to reason about for those sections.

**Fix.** Pass `require_tables=True` (the default for both
`_pass2_compose` and `memo_critic`). Use a loader that populates
`raw_tables` with the EDINET-Bench BS/PL/CF JSON instead of the
text-only default loader.

### `[evidence insufficient]` appears more often than expected

**Symptom.** Citation Grounder strips many sentences as ungrounded.

**Cause.** Pass-1 emitted sparse `japanese_span` lists for the
relevant sections — the composer is citing spans that are real in the
source but were not extracted.

**Fix.** Increase `_PASS1_MAX_TOKENS` or relax the per-section JSON
schema so Pass-1 emits more spans. Do not relax the grounder — the
abstention output is a feature.

### GGUF quant runs in llama.cpp but tokenisation looks wrong

**Symptom.** Output English memo contains stray Japanese tokens or
mojibake.

**Cause.** Older llama.cpp builds (`< 2024-09`) shipped a Qwen1
tokeniser that misclassified `<|im_end|>` as a regular token.

**Fix.** Rebuild llama.cpp at HEAD. The conversion script in
`scripts/build_gguf.sh` runs against the user-supplied llama.cpp
checkout; pin to a commit ≥ `f7001cc`.

### vLLM-ROCm refuses to load the Qwen1 base model

**Symptom.** `unsupported model type: 'qwen'`.

**Cause.** vLLM 0.7.x supports Qwen1 but lists Qwen2 in its
quickstart. The user has to opt in.

**Fix.** Pass `--trust-remote-code` and explicitly set
`--model-type qwen` (or set it via the config). Dynamic-NTK works
up to ~16K context.

## Demo

### `python -m yuholens.agents` exits with a langgraph ImportError

**Symptom.** `ModuleNotFoundError: No module named 'langgraph'`.

**Cause.** A fresh clone has not run `pip install -e .` yet, or the
shell is not in the project venv.

**Fix.** `pip install -e .[dev]` from the repo root. The dev extra
adds the test-only deps; the runtime deps include `langgraph`,
`langchain-core`, and `openai` already.

### Live demo crashes mid-walkthrough

**Symptom.** OpenAI rate limit, network blip, or judge timeout during
the demo.

**Fix.** Switch to `--judge-mode heuristic` and re-run. The heuristic
needs no API and produces deterministic ranking. The pre-recorded
output in `data/eval/kg2_memos_bo5_picked.jsonl` (when available) is
the ultimate fallback — `cat` one row and read it.
