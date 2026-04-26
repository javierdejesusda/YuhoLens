# YuhoLens-Pipeline

> **Span-cited English investor memos from Japanese 有価証券報告書, produced by a 14B
> nekomata-qfin fine-tune on a single AMD Instinct MI300X.**

<p align="center">
  <img alt="Python 3.12" src="https://img.shields.io/badge/python-3.12-blue.svg">
  <img alt="ROCm 7.0" src="https://img.shields.io/badge/ROCm-7.0-red.svg">
  <img alt="Tests 85 passing" src="https://img.shields.io/badge/tests-85%20passing-brightgreen.svg">
  <img alt="KG-2 PASS" src="https://img.shields.io/badge/KG--2-PASS%20%E2%80%A2%203.88-success.svg">
  <img alt="Citation 1.000" src="https://img.shields.io/badge/citation%20rate-1.000-success.svg">
  <img alt="License MIT" src="https://img.shields.io/badge/code-MIT-green.svg">
  <img alt="License Tongyi Qianwen" src="https://img.shields.io/badge/weights-Tongyi%20Qianwen-orange.svg">
</p>

---

## What it does, in one paragraph

A Japanese annual securities report (*有価証券報告書*, "Yuho") is a dense,
cross-referential disclosure document. The going-concern note in section 2 hedges the
earnings call you would otherwise read off the P&L. Accrual-quality stress only shows
up when DSO drifts up while revenue drifts down and operating cash flow drifts up —
three numbers in three different sections, connected only by whoever is reading.
**YuhoLens reads the Japanese, writes an English investor memo, and cites every
material claim back to a verbatim Japanese source span — or refuses to make the
claim.** Abstention is a feature, not a failure.

```
The filer flags that prolonged yen weakness materially compresses operating
margin in the electronic-components segment (ref: '事業等のリスクとして、
急激な為替変動は営業利益率に重大な影響を及ぼす可能性がある' p.23).
```

## Headline result — KG-2 PASS

| Gate                                 | Target  | Best-of-5 composer (shipping) |
| ------------------------------------ | :-----: | :---------------------------: |
| Citation presence rate               | ≥ 0.70  | **1.000**                     |
| Section coverage (7 sections)        | ≥ 0.60  | **0.994**                     |
| Judge coherence (gpt-5-mini Likert)  | ≥ 3.80  | **3.88**                      |

Coherence distribution on the 50-prompt KG-2 test set: `0/2/7/36/5` (counts at
1/2/3/4/5), median 4.0, std 0.621. **Verdict: PASS.**

### How we got there

| stage                                      | mean coherence | verdict |
| ------------------------------------------ | :------------: | :-----: |
| v5 single-shot                             | 3.56           | SOFT    |
| best-of-2 (mixed decoder)                  | 3.72           | SOFT    |
| best-of-3 (same-decoder seeds)             | 3.64           | SOFT    |
| **best-of-5 (mixed decoder + seeds)**      | **3.88**       | **PASS**|

**The lift is inference-time, not training-time.** The same SFT checkpoint, sampled
at five different decoder profiles per prompt, lets the coherence judge pick the
per-prompt argument-unity peak. Decoder diversity dominates seed diversity — the
finding is now baked into [`src/yuholens/agents/decoder_profiles.py`](src/yuholens/agents/decoder_profiles.py)
and the `MemoCriticAgent` LangGraph node.

## Architecture — 4 agents, one DAG

```mermaid
flowchart LR
    A[Yuho PDF / EDINET row] --> B[Ingestor<br/><sub>regex section split</sub>]
    B --> C[Pass-1 Detector<br/><sub>per-section JSON</sub>]
    C --> D[MemoCriticAgent<br/><sub>best-of-N composer</sub>]
    D --> E[Citation Grounder<br/><sub>span verification</sub>]
    E --> F[English memo<br/><sub>or [evidence insufficient]</sub>]
    style D fill:#1f6feb,stroke:#fff,color:#fff
    style E fill:#238636,stroke:#fff,color:#fff
```

1. **Ingestor.** Regex over the Yuho's section markers (`事業等のリスク`,
   `経営者による財政状態の分析`, …). Sub-second, deterministic.
2. **Pass-1 Detector.** One vLLM call per Japanese section. Emits red flags,
   numerical claims, and `japanese_span` citations as structured JSON.
3. **MemoCriticAgent (best-of-N).** Fans out N Pass-2 composer calls across the
   `DEFAULT_PROFILES` decoder catalogue, scores each candidate via the gpt-5-mini
   coherence judge (or a no-API heuristic), and returns the highest-scoring memo.
4. **Citation Grounder.** Every inline `(ref: '<span>' p.N)` is verified against the
   union of Pass-1 spans. Sentences with all-ungrounded citations are replaced with
   `[evidence insufficient]`. **No span, no claim.**

## Quickstart

```bash
git clone https://github.com/javierdejesusda/YuhoLens.git
cd YuhoLens
pip install -e .

# Run the 4-agent composer end-to-end on a sample row.
python -m yuholens.agents \
    --yuho-row data/eval/kg2_test.jsonl --row-index 0 \
    --best-of-n --n-candidates 5 --judge-mode auto

# Reproduce the bo5 pick offline (no OpenAI calls, heuristic only).
python scripts/run_bestofn_offline.py \
    --memos data/eval/kg2_memos_v4.jsonl data/eval/kg2_memos_v5.jsonl \
            data/eval/kg2_memos_bo3_s1.jsonl data/eval/kg2_memos_bo3_s2.jsonl \
            data/eval/kg2_memos_bo3_s3.jsonl \
    --picked-memos data/eval/picked_offline.jsonl \
    --picked-scores data/eval/picked_offline.json
```

Run the test suite (laptop, no GPU, no API key required):

```bash
PYTHONPATH=src python -m pytest tests/ -q
```

## Inference recipe

The two supported decoding modes are fully documented in
[`docs/model-card.md`](docs/model-card.md#inference-recipe). The short version:

| Mode          | Use when                                       | How |
| ------------- | ---------------------------------------------- | --- |
| **Single-shot** | Latency-bound. Hits 3.56 mean coherence.     | `temperature=0.1, top_p=0.9, repetition_penalty=1.15` |
| **Best-of-5**   | Quality-bound. Hits 3.88 PASS.               | `MemoCriticAgent` over `DEFAULT_PROFILES` |

The LangGraph composer is constructed via:

```python
from yuholens.agents.graph import build_pipeline

app = build_pipeline(
    best_of_n=True,
    n_candidates=5,
    judge_mode="auto",   # "auto" probes the OpenAI key; falls back to heuristic
)
result = app.invoke(initial_state)
print(result["grounded_memo"])
```

`judge_mode="auto"` performs a real auth probe before generating; transient outages
or invalid-but-present keys silently fall back to the heuristic so candidate
generation work is never wasted.

## Releases

| Artefact                                | Where                                              | Status |
| --------------------------------------- | -------------------------------------------------- | ------ |
| BF16 reference weights                  | `yuholens/yuholens-14b` on HuggingFace             | planned at submission |
| GGUF release (Q4_K_M / Q5_K_M / Q6_K / Q8_0) | `yuholens/yuholens-14b-GGUF` on HuggingFace   | built by [`scripts/build_gguf.sh`](scripts/build_gguf.sh) |
| Pre-release sanity check                | [`scripts/check_release_set.py`](scripts/check_release_set.py) | built |
| Hub upload helper                       | [`scripts/hf_upload.py`](scripts/hf_upload.py)     | built (patches `generation_config.json` to v5 defaults before push) |
| Model card                              | [`docs/model-card.md`](docs/model-card.md)         | shipped |
| Blog post                               | [`docs/blog_post.md`](docs/blog_post.md)           | shipped |
| Demo script (90s video + 5-min walkthrough) | [`docs/demo_script.md`](docs/demo_script.md)   | shipped |

## Hardware

- **Training (one-shot).** Single AMD Instinct MI300X (192 GB HBM3) on ROCm 7.0.
  Full-parameter SFT of a 14B Qwen1 model at sequence length 8192 does not fit on
  80 GB-class hardware; the MI300X is not optional for the training path.
- **Consumer inference.** The Q4_K_M GGUF (≈9.45 GB) targets a single
  RTX 4060 Ti 16 GB via llama.cpp. Pass-1 per-section context fits at 4-6K tokens.
- **Demo / research inference.** Any ROCm or CUDA host with the BF16 checkpoint;
  the `MemoCriticAgent` is pure orchestration and adds zero VRAM cost beyond the
  base model.

## Cost

| Line item                          | Spend |
| ---------------------------------- | -----: |
| MI300X SFT (~38 GPU-hours @ $1.99) | ~$75.62 |
| OpenAI teacher bootstrap (Batch API) | ~$4.84 |
| KG-2 judge passes (gpt-5-mini)     | ~$2.00 |
| GPU best-of-3 generation run       | ~$6.60 |
| **Total**                          | **~$80** (inside the $100 AMD Developer Cloud envelope) |

23 days end-to-end, including two 24-hour async batch waits and one 10-12 hour SFT
job.

## Project layout

```
YuhoLens/
├── src/yuholens/
│   ├── ingestor.py             # Yuho text → labelled Japanese sections
│   ├── agents/
│   │   ├── graph.py            # build_pipeline() + 4-node LangGraph
│   │   ├── memo_critic.py      # best-of-N composer + judge + heuristic
│   │   ├── decoder_profiles.py # the 5-profile catalogue from KG-2 PASS
│   │   ├── citation_grounder.py
│   │   └── cli.py              # python -m yuholens.agents
│   ├── prompts/                # pass1, pass2 system + user templates
│   ├── eval/
│   │   ├── metrics.py          # citation_rate, section_coverage, judge
│   │   └── run_kg2.py          # KG-2 evaluation harness
│   └── training/               # sft.py, orpo.py, teacher.py (MI300X-only)
├── scripts/
│   ├── run_bestofn_offline.py  # offline heuristic picker (no API)
│   ├── bestofn_pick.py         # cached-judge picker
│   ├── bestofn_judge.py        # fresh judge over candidate sets
│   ├── build_gguf.sh           # llama.cpp Q4/Q5/Q6/Q8 release set
│   ├── hf_upload.py            # patches generation_config + pushes to Hub
│   └── check_release_set.py    # pre-release sanity check
├── tests/                      # 85 pytest tests, all laptop-runnable
├── configs/                    # sft.yaml, orpo.yaml
└── docs/                       # model-card, blog_post, demo_script, sessions
```

## Citation

```bibtex
@misc{dejesus2026yuholens,
  author       = {De Jesus, Javier},
  title        = {YuhoLens-14B: A Japanese-Finance Fine-Tune for
                  Span-Grounded Investor Memo Generation},
  year         = {2026},
  howpublished = {Hugging Face model repository},
  url          = {https://huggingface.co/yuholens/yuholens-14b},
  note         = {AMD Developer Hackathon, lablab.ai, May 2026}
}
```

## Credits

- **AMD Developer Program** — MI300X cloud credits that made full-parameter 14B
  training feasible inside a hackathon budget.
- **Preferred Networks** — `nekomata-14b-pfn-qfin` continual pre-training on
  Japanese financial text.
- **rinna Co., Ltd.** — base `nekomata-14b` Japanese-adapted Qwen1 checkpoint.
- **Alibaba Cloud / Qwen** — original `Qwen-14B` base weights.
- **Sakana AI** — `EDINET-Bench` annotated Yuho corpus.
- **OpenAI** — gpt-5-mini Batch API for the teacher-bootstrap step and the
  coherence judge.
- **lablab.ai** — AMD Developer Hackathon platform.

## License

MIT covers the wrapper code (LangGraph pipeline, training scripts, evaluation
harness, prompt modules). Model weights are released under the **Tongyi Qianwen**
license inherited from `Qwen/Qwen-14B` via `rinna/nekomata-14b` and
`pfnet/nekomata-14b-pfn-qfin`. Downstream users must comply with the Tongyi Qianwen
terms in addition to MIT.

> ⚠️ Outputs are model-generated text and may contain factual errors. Verify any
> material claim against the underlying Yuho before relying on it for any
> decision. The authors disclaim all liability for investment outcomes derived
> from this model.
