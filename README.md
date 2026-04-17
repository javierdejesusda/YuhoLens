# YuhoLens-Pipeline

Span-cited English investor memos from Japanese 有価証券報告書, produced by a 14B
nekomata-qfin fine-tune on a single AMD Instinct MI300X.

![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)
![License MIT](https://img.shields.io/badge/license-MIT-green.svg)
![License Tongyi Qianwen](https://img.shields.io/badge/weights-Tongyi%20Qianwen-orange.svg)

## Overview

YuhoLens is a Japanese-finance LLM stack built for non-Japanese-speaking portfolio
managers and equity researchers who need to read Japanese annual reports without a
bilingual analyst on call. The pipeline ingests a Yuho (有価証券報告書), runs a
two-pass LangGraph over a fine-tuned 14B Qwen1-family model, and emits an English
investor memo in which every factual claim is grounded in a verbatim Japanese
source span. A typical memo excerpt reads:

> The filer flags that prolonged yen weakness materially compresses operating
> margin in the electronic-components segment (ref: '事業等のリスクとして、急激
> な為替変動は営業利益率に重大な影響を及ぼす可能性がある' p.23).

## Model card

- Local card: [`docs/model-card.md`](docs/model-card.md)
- BF16 reference weights: `yuholens/yuholens-14b` on Hugging Face (planned at
  submission).
- Quantized GGUF release: `yuholens/yuholens-14b-GGUF` (Q4_K_M / Q5_K_M / Q6_K).
- License pair: MIT for wrapper code; Tongyi Qianwen for model weights, inherited
  via `pfnet/nekomata-14b-pfn-qfin` → `rinna/nekomata-14b` → `Qwen/Qwen-14B`.

## Hardware requirement

- **Training.** Single AMD Instinct MI300X (192 GB HBM3) on ROCm 7.0.
  Full-parameter SFT and ORPO of a 14B Qwen1 model at sequence length 8192 do
  not fit on 80 GB class hardware; the MI300X is not optional for the training
  path.
- **Consumer inference.** The Q4_K_M GGUF targets 16 GB consumer hardware
  (RTX 4060 Ti 16 GB) running Pass-1 per-section at context length 4-6K via
  llama.cpp. Full-horizon Pass-2 composition still requires the BF16 checkpoint
  on datacenter ROCm or CUDA.

## Quickstart

- Clone: `git clone https://github.com/javierdejesusda/YuhoLens.git && cd YuhoLens`
- Install (Python 3.12): `pip install -e .`
- Smoke (requires a ROCm container with flash-attn-ROCm pre-installed):
  `PYTHONPATH=src python scripts/smoke_flash_attn.py`
- Train or infer: see the **Train** and **Inference** sub-sections below.

## Train (MI300X)

Training configs live in [`configs/sft.yaml`](configs/sft.yaml) and
[`configs/orpo.yaml`](configs/orpo.yaml). Launch the SFT stage with:

```bash
python -m yuholens.training.sft --config configs/sft.yaml
```

Preference optimization (Stage 2) consumes the same checkpoint:

```bash
python -m yuholens.training.orpo --config configs/orpo.yaml
```

`bitsandbytes` on ROCm is **not** the PyPI wheel. Run
`bash scripts/install_bnb_rocm.sh` to execute the source-build against
`ROCm/bitsandbytes` branch `rocm_enabled` with `-DBNB_ROCM_ARCH="gfx942"`. The
script is idempotent and verifies the resulting `libbitsandbytes_rocm*.so` is
importable before returning.

## Teacher bootstrap

Teacher memos are drafted by the OpenAI gpt-5-mini Batch API. The pipeline is
split into a submit step and a poll-and-filter step so that long-running batches
do not block local iteration:

```bash
python -m yuholens.training.teacher submit \
    --split fraud_detection \
    --out data/teacher/batch_fraud.json

python -m yuholens.training.teacher poll-and-filter \
    --batch-json data/teacher/batch_fraud.json \
    --raw-out data/teacher/batch_fraud_raw.jsonl \
    --filtered-out data/teacher/batch_fraud_filtered.jsonl
```

`OPENAI_API_KEY` must be set in `.env` before either subcommand. The poll step
applies citation-presence and section-coverage gates, dropping rows that fail
before the SFT loader ever sees them.

## Inference (LangGraph)

The serving pipeline is a 4-node LangGraph: **Ingestor** parses the Yuho bundle
and splits long sections to fit the Pass-1 window; a per-section **Pass-1
detector** emits structured JSON observations with `japanese_span` citations;
the **Pass-2 composer** synthesizes those observations into an English memo
with inline `(ref: '<Japanese span>' p.N)` markers; the **Citation-Grounder**
verifies every marker against the union of Pass-1 spans and replaces any
sentence whose citations are all ungrounded with `[evidence insufficient]`,
rather than silently passing it through. Construct the graph via
`yuholens.agents.graph.build_pipeline`.

## Benchmark

Final numbers land post-KG 2 (build-spec 2026-04-29). All values are `TBD`
until then.

| Metric                              | Target | Measured |
|-------------------------------------|--------|----------|
| `citation_presence_rate`            | TBD    | TBD      |
| `section_coverage`                  | TBD    | TBD      |
| `judge_coherence` (Likert 1-5)      | TBD    | TBD      |

## Project structure

```
YuhoLens/
├── src/yuholens/
│   ├── ingestor.py          # Yuho PDF / XBRL parsing + section regex
│   ├── training/            # sft.py, orpo.py, teacher.py
│   ├── agents/              # graph.py, citation_grounder.py
│   ├── prompts/             # pass1.py, pass2.py
│   └── eval/                # metrics.py
├── tests/                   # pytest suite (ingestor, grounder, teacher, e2e)
├── scripts/                 # smoke_flash_attn.py, install_bnb_rocm.sh, ...
├── configs/                 # sft.yaml, orpo.yaml, ds_zero3_fallback.json
└── data/teacher/            # gitignored: teacher batch inputs / outputs
```

## Citation

```bibtex
@misc{yuholens2026,
  author       = {De Jesus, Javier},
  title        = {YuhoLens-14B: A Japanese-Finance Fine-Tune for
                  Span-Grounded Investor Memo Generation},
  year         = {2026},
  howpublished = {Hugging Face model repository},
  url          = {https://huggingface.co/yuholens/yuholens-14b},
  note         = {DOI: TBD}
}
```

## Credits

- **Preferred Networks** — `nekomata-14b-pfn-qfin` continual pre-training on
  Japanese financial text.
- **rinna Co., Ltd.** — base `nekomata-14b` Japanese-adapted checkpoint.
- **Alibaba Cloud / Qwen** — original `Qwen-14B` base weights.
- **Sakana AI** — `EDINET-Bench` annotated Yuho corpus.
- **AMD Developer Program** — MI300X cloud credits.
- **lablab.ai** — AMD Developer Hackathon platform.

## License

MIT covers the wrapper code (LangGraph pipeline, training scripts, evaluation
harness, prompt modules). Model weights are released under the Tongyi Qianwen
license inherited from `Qwen/Qwen-14B` via `rinna/nekomata-14b` and
`pfnet/nekomata-14b-pfn-qfin`. Downstream users must comply with the Tongyi
Qianwen terms in addition to MIT.
