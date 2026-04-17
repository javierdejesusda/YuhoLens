# YuhoLens-Pipeline

Japanese securities-report (有価証券報告書 / Yuho) analysis pipeline built on
`pfnet/nekomata-14b-pfn-qfin` (Preferred Networks, Qwen1 family, April 2024),
further fine-tuned on AMD Instinct MI300X with SFT + ORPO on the
`SakanaAI/EDINET-Bench` dataset (ICLR 2026) and wrapped in a four-agent
LangGraph pipeline that emits English investor memos grounded in cited
Japanese source spans.

Submitted to the AMD Developer Hackathon on lablab.ai (Track 2 — Fine-Tuning
on AMD GPUs, May 9-10 2026).

## Acknowledged prior art

- `pfnet/nekomata-14b-pfn-qfin` — Preferred Networks' 14B Qwen1-based
  Japanese-finance continued-pretraining model
  ([arXiv 2404.10555](https://arxiv.org/abs/2404.10555)). YuhoLens builds on
  it rather than replacing it; the task-specific layer is Yuho section-aware
  extraction with span-level citations tied to English-memo output.
- `SakanaAI/EDINET-Bench` — ten years of Japanese annual reports across
  fraud-detection, earnings-forecast, and industry-classification tasks
  ([arXiv 2506.08762](https://arxiv.org/abs/2506.08762), ICLR 2026). Licensed
  PDL 1.0, commercial use permitted.

## Pipeline

```
Yuho PDF / XBRL
      │
      ▼
  Ingestor            parse + Japanese section regex
      │
      ▼
  Red-Flag-Detector   pass-1 per-section JSON extractions
      │
      ▼
  Citation-Grounder   verify every claim ties to a source span
      │
      ▼
  Memo-Composer       2-page English investor memo with citations
```

Four LangGraph agents share a single vLLM-ROCm process; two-pass ingestion
carries cross-section dependencies through a concatenation step so that
balance-sheet footnotes, MD&A, related-party disclosures, and segment notes
inform each other in the final memo.

## Hardware

- 1× AMD Instinct MI300X (192 GB HBM3) via AMD Developer Cloud.
- ROCm 7.0, PyTorch-ROCm 2.5.1, vLLM-ROCm, TRL ≥ 1.2.0, bitsandbytes built
  from `ROCm/bitsandbytes` branch `rocm_enabled` with
  `-DBNB_ROCM_ARCH="gfx942"`.
- Full-parameter SFT of a 14B Qwen1 model at sequence length 8192 peaks at
  roughly 112 GB with BF16 weights, BF16 gradients, 8-bit AdamW, and grad
  checkpointing — an H100 80 GB fails on weights + gradients + optimizer
  alone.

## Quickstart

```bash
# 1. Clone and install
git clone https://github.com/javierdejesusda/YuhoLens.git
cd YuhoLens
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Environment smoke (AMD Developer Cloud MI300X)
python scripts/smoke_flash_attn.py        # Flash-attention ROCm import
python scripts/smoke_bnb_adamw.py         # 8-bit AdamW on nekomata, seq 4K
python scripts/smoke_vllm.py              # vLLM-ROCm Qwen1 inference

# 3. Teacher bootstrap (Claude Sonnet 4.6 batch API)
export ANTHROPIC_API_KEY=...
python -m yuholens.training.teacher \
    --split fraud_detection \
    --out data/teacher/fraud.jsonl

# 4. Supervised fine-tuning
python -m yuholens.training.sft --config configs/sft.yaml

# 5. Preference optimisation
python -m yuholens.training.orpo --config configs/orpo.yaml

# 6. GGUF release (llama.cpp)
bash scripts/convert_to_gguf.sh output/yuholens-14b-final
```

## Status

Day 0 scaffolding. Training and release artifacts are produced during the 23-
day execution window (2026-04-16 → 2026-05-09).

## License

MIT for the code in this repository. The fine-tuned model weights inherit the
Tongyi Qianwen license from Qwen/Qwen-14B → rinna/nekomata-14b →
pfnet/nekomata-14b-pfn-qfin and are released under those terms on
HuggingFace.
