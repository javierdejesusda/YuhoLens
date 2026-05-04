---
license: other
license_name: tongyi-qianwen
license_link: https://huggingface.co/Qwen/Qwen-14B/blob/main/LICENSE
language:
  - ja
  - en
base_model: javierdejesusda/yuholens-14b
tags:
  - gguf
  - llama-cpp
  - quantized
  - japanese-finance
  - yuho
  - edinet
  - qwen
pipeline_tag: text-generation
---

# YuhoLens-14B GGUF

GGUF-quantized release of [`javierdejesusda/yuholens-14b`](https://huggingface.co/javierdejesusda/yuholens-14b) for offline inference via [`llama.cpp`](https://github.com/ggerganov/llama.cpp). The BF16 source is a full-parameter SFT of [`pfnet/nekomata-14b-pfn-qfin`](https://huggingface.co/pfnet/nekomata-14b-pfn-qfin) (Qwen1, 14B, Japanese-finance CPT) on teacher-bootstrapped English investor memos derived from [`SakanaAI/EDINET-Bench`](https://huggingface.co/datasets/SakanaAI/EDINET-Bench).

## Files

| File | Quant | Size | Bits/weight | Recommended hardware |
|------|-------|-----:|:-----------:|----------------------|
| `yuholens-14b-Q3_K_M.gguf` | Q3_K_M | 7.18 GiB |  4.35 | 8 GB GPU (RTX 4070 Laptop, 3060 Ti) — fits with `--ctx-size 2048` |
| `yuholens-14b-Q4_K_M.gguf` | Q4_K_M | 8.81 GiB | ~5.0 | 12-16 GB GPU (RTX 4060 Ti 16 GB, RTX 3080) |
| `yuholens-14b-Q5_K_M.gguf` | Q5_K_M | 9.94 GiB | ~5.7 | 16 GB GPU |
| `yuholens-14b-Q6_K.gguf`   | Q6_K   | 11.46 GiB | ~6.6 | 16-24 GB GPU |
| `yuholens-14b-Q8_0.gguf`   | Q8_0   | 14.03 GiB | 8.5 | 24 GB GPU or CPU offload |

Sizes are the actual on-disk byte counts; quoted values are GiB (1024³ bytes).

## Smoke test

The Q3_K_M quant has been smoke-tested on an NVIDIA RTX 4070 Laptop (8 GB VRAM, compute 8.9) using `llama-completion` from llama.cpp build `b8966`.

- Prompt: ChatML-wrapped Yuho fixture with the YuhoLens system prompt (see *Prompt format* below).
- Settings: `--n-gpu-layers 99 -c 2048 --temp 0.1 --top-p 0.9 --repeat-penalty 1.15`.
- Throughput: prompt eval **109.05 tok/s**, generation **10.06 tok/s**.
- VRAM occupancy: ~7.0 GB model + ~1.6 GB context + ~0.3 GB compute, fits within the 8.0 GB card.
- Output: coherent English investor memo with section headings (*Executive summary*, *Going-concern assessment*, *Accrual quality*, ...) following the SFT teacher template.

Q4_K_M and larger quants exceed 8 GB VRAM and require either a 12 GB+ GPU or partial CPU offload (`--n-gpu-layers` < 99). Q4_K_M smoke on the same RTX 4070 Laptop with `--n-gpu-layers 30` (30 of 41 layers on GPU, rest on CPU) sustains 7.92 generation tok/s and 152.30 prompt tok/s — usable but I/O-bound by the CPU layers; a native 12-16 GB card runs the same quant fully on GPU.

## Quickstart

```bash
# Q3_K_M, fits 8 GB GPU
llama-completion \
  -m yuholens-14b-Q3_K_M.gguf \
  -f your_prompt.txt \
  --n-gpu-layers 99 \
  -c 2048 \
  --temp 0.1 --top-p 0.9 --repeat-penalty 1.15 \
  -n 512 \
  --no-display-prompt
```

For larger quants on a smaller GPU, drop `--n-gpu-layers` to a value that fits VRAM (e.g. `--n-gpu-layers 30` for Q4_K_M on 8 GB).

## Prompt format

YuhoLens-14B was fine-tuned on Qwen1 ChatML with a fixed system prompt. **Raw Japanese Yuho text without the wrapper produces Japanese continuations** instead of English memos. Wrap inputs as:

```
<|im_start|>system
{SYSTEM_PROMPT}<|im_end|>
<|im_start|>user
Company metadata (JSON):
{...}

Balance sheet (JSON):
{...}

P&L (JSON):
{...}

Cash flow (JSON):
{...}

Japanese annual-report text (truncated at ~20K chars):
<<<
{Japanese Yuho text}
>>>

Produce the two-page English investor memo now.<|im_end|>
<|im_start|>assistant
```

The full system prompt is published in the BF16 model card and in `src/yuholens/training/teacher.py` of the GitHub repo. A pre-formatted smoke fixture is included in the GitHub repo at `data/sample/smoke_prompt_chatml.txt`.

## Build provenance

Source checkpoint: `output/yuholens-14b-sft/checkpoint-212` (28.3 GB BF16 safetensors), tagged at git commit `f903174`.

Built with:

- `llama.cpp` commit `b8966` (`7b8443ac7`), Windows CUDA 12.4 prebuilt binaries.
- Convert script `convert_hf_to_gguf.py` patched locally to fall back to an inline GPT-2 byte-to-unicode mapping when transformers ≥ 5.x removes `bytes_to_unicode`. See the GitHub repo for the patch.
- `llama-quantize` invoked with `--override-kv qwen.attention.layer_norm_rms_epsilon=float:0.000001` because Qwen1 uses RMSNorm internally but its HF config exposes the field as `layer_norm_epsilon`; this override is now baked into `scripts/build_gguf.sh`.

Reproduce locally:

```bash
LLAMACPP_REPO=/path/to/llama.cpp \
LLAMACPP_BIN=/path/to/llama.cpp/build/bin \
  scripts/build_gguf.sh output/yuholens-14b-sft/checkpoint-212 data/eval/gguf
```

## Limitations

- **Output language asymmetry.** The model emits English memos and expects Japanese Yuho input. Japanese output is unsupported by training distribution.
- **Citation accuracy unaudited.** The model produces inline `(ref: '<span>' p.N)` citations, but verbatim-correctness against the underlying Yuho text has not been audited.
- **Quantization quality bands.** Q3_K_M sacrifices some fidelity for the 8 GB VRAM target. Prefer Q4_K_M or higher when memory permits.
- **Domain.** Trained on Yuho 有価証券報告書 only. Earnings transcripts, 決算短信, and non-Japanese filings are out-of-scope.
- **Not financial advice.** Outputs are model-generated and may contain factual errors. Verify every material claim against the source.

## License

Released under the Tongyi Qianwen License inherited from the Qwen1 base via `pfnet/nekomata-14b-pfn-qfin`. See the linked license for terms. Wrapper code in the GitHub repo (LangGraph pipeline, training and evaluation scripts, prompt modules) is MIT.

## Citation

```bibtex
@misc{dejesus2026yuholens,
  author       = {De Jesus, Javier},
  title        = {YuhoLens-14B: A Japanese-Finance Fine-Tune for
                  Span-Grounded Investor Memo Generation},
  year         = {2026},
  howpublished = {Hugging Face model repository},
  url          = {https://huggingface.co/javierdejesusda/yuholens-14b},
  note         = {DOI: TBD}
}
```

## Links

- BF16 reference: https://huggingface.co/javierdejesusda/yuholens-14b
- GitHub: https://github.com/javierdejesusda/YuhoLens
- Base model: https://huggingface.co/pfnet/nekomata-14b-pfn-qfin
- Training data: https://huggingface.co/datasets/SakanaAI/EDINET-Bench
