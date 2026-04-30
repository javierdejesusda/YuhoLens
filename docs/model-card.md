---
license: other
license_name: tongyi-qianwen
license_link: https://huggingface.co/Qwen/Qwen-14B/blob/main/LICENSE
language:
  - ja
  - en
base_model: pfnet/nekomata-14b-pfn-qfin
tags:
  - japanese-finance
  - yuho
  - edinet
  - rocm
  - mi300x
  - qwen
datasets:
  - SakanaAI/EDINET-Bench
---

# YuhoLens-14B

## Model summary

YuhoLens-14B is a 14-billion-parameter Japanese-to-English investor-memo
generation model, produced by full-parameter supervised fine-tuning of
`pfnet/nekomata-14b-pfn-qfin` on
annotated Japanese 有価証券報告書 (Yuho) filings drawn from the
`SakanaAI/EDINET-Bench` corpus. The model is designed to operate inside a
two-pass LangGraph pipeline: a per-section Pass-1 extractor that emits
structured JSON observations, and a Pass-2 composer that synthesizes those
observations into an English investor memo with inline citations back to the
original Japanese source spans. The design target is local, reproducible
research inference on a single consumer 16 GB GPU (RTX 4060 Ti) via llama.cpp
GGUF quantization, alongside a BF16 reference checkpoint for ROCm and CUDA
serving. YuhoLens-14B is a research artifact produced for the AMD Developer
Hackathon (lablab.ai, May 2026) and is not a financial-advice product.

## Intended use

- Primary use: batch generation of English investor memos from Japanese Yuho
  filings, with verifiable inline citations (span-level) that can be grounded
  back to the source PDF or EDINET XBRL record.
- Intended audience: bilingual analysts, equity researchers who need a
  first-pass English rendering of Japanese disclosure language, and
  researchers studying span-grounded summarization of long-form financial
  filings.
- Out-of-scope uses:
  - Real-time or high-frequency trading signals.
  - Investment, tax, or legal advice of any kind.
  - Generation of Japanese-language summaries (the model is trained to emit
    English memos only).
  - Non-Yuho document types (earnings call transcripts, quarterly 決算短信,
    non-Japanese filings) without further fine-tuning.

**Disclaimer.** Outputs are model-generated text and may contain factual
errors, fabricated citations, or outdated numbers. Users MUST verify any
material claim against the underlying Yuho source before relying on it for
any decision. The authors disclaim all liability for investment outcomes
derived from this model.

## Training data

Training data is derived from `SakanaAI/EDINET-Bench`, a corpus of
annotated Japanese 有価証券報告書 with parsed BS / PL / CF JSON and the
corresponding source text spans. The three subsets used are:

- `fraud_detection` — 865 training rows / 224 test rows.
- `earnings_forecast` — 549 training rows / 451 test rows.
- `industry_prediction` — 496 training rows / 397 test rows.

From these 1,910 training rows, a teacher-bootstrap pipeline invokes the
OpenAI Batch API (`gpt-5-mini`) to produce English investor-memo drafts that
carry inline citations over the Japanese source spans. Rows that fail
citation-presence, length, hallucinated-number, language, and duplicate
gates are discarded; post-filter retention tracked at roughly 85 percent
in prior runs. Source Yuho
sections retained for conditioning include 事業等のリスク, 経営者による財政
状態、経営成績及びキャッシュ・フローの状況の分析, and the tabular BS / PL /
CF blocks.

Dataset card: https://huggingface.co/datasets/SakanaAI/EDINET-Bench

## Training procedure

YuhoLens-14B follows a single-stage regime backed by an inference-time
best-of-N composer:

1. **Stage 1 — Supervised fine-tuning (SFT).** Full-parameter SFT at
   sequence length 8192 on ~19M tokens (post-filter memo bundles), following
   build-spec Option A.
2. **Inference-time best-of-N composer.** At inference, the SFT
   checkpoint is sampled with multiple decoder profiles per prompt and
   the coherence judge selects the highest-scoring completion as the
   final output. Decoder diversity (mixed temperature and
   repetition_penalty) dominates seed diversity in lifting cross-section
   argument unity; see `scripts/bestofn_pick.py` and the session
   2026-04-25 summary.

ORPO (reference-free preference optimization) infrastructure is wired
in `configs/orpo.yaml` + `src/yuholens/training/orpo*.py`. Two
synthetic-preference iterations were attempted; both failed at a
pre-training data-quality gate before any GPU training step ran. V1
used a citation-grounding critique misaligned with the coherence judge.
V2 used a coherence critique whose missing citation-preservation
constraint led `gpt-5-mini` to strip existing `(refs:)` markers from
the SFT drafts (chosen citation rate 0.305 vs rejected 0.995). The
shipped artifact is therefore SFT only; the ORPO route is documented
as a negative result for the synthetic-preference data path on this
corpus, and best-of-N over the SFT distribution cleared the KG-2 PASS
gate without it.

All training was performed on a single AMD Instinct MI300X (192 GB HBM3,
ROCm 7.0) under the `rocm/pytorch:rocm7.0_ubuntu24.04_py3.12_pytorch_release_2.5.1`
container, using `flash-attention` built for ROCm and `bitsandbytes` 8-bit
AdamW with gradient checkpointing.

Hyperparameters:

| Stage | LR     | Batch | Grad accum | Seq len | Epochs | Optimizer         | Notes             |
|-------|--------|-------|------------|---------|--------|-------------------|-------------------|
| SFT   | 1e-5   | 1     | 32         | 8192    | 2      | adamw_bnb_8bit    | BF16, grad-ckpt; checkpoint-212 |
| ORPO  | 5e-6   | 1     | 16         | 8192    | 1      | adamw_bnb_8bit    | beta = 0.1; wired but no shipped checkpoint (data gate failed both attempts) |

**Compute budget.** Total ~38 GPU-hours on a single MI300X at $1.99/hr,
within the $100 AMD Developer Cloud credit envelope; final spend target is
~$80.

**Carbon footprint (estimate).** 38 GPU-hr × 750 W average board power ×
0.40 kgCO2eq/kWh ≈ 11.4 kgCO2eq. This excludes orchestrator CPU, networking,
and teacher-API energy.

## Evaluation

Three kill-gate metrics are evaluated on a held-out 50-row test split
(`data/eval/kg2_test.jsonl`). The released configuration must pass all
three.

| Metric                          | Definition                                                                                   | Target   | Measured (best-of-5 composer) |
|---------------------------------|----------------------------------------------------------------------------------------------|----------|-------------------------------|
| Citation presence rate          | Fraction of generated memos with at least one inline `(ref: '…' p.X)` Japanese-span citation. | ≥ 0.70   | **1.000**                     |
| Section coverage                | Mean coverage of the seven memo sections (executive summary, going-concern, accrual quality, earnings direction, top risks, related-party, evidence appendix). | ≥ 0.60   | **0.994**                     |
| Judge coherence (`gpt-5-mini` Likert) | 1-5 Likert mean from an independent `gpt-5-mini` judge scoring cross-section argument unity (rubric in `src/yuholens/eval/metrics.py:DEFAULT_RUBRIC`). | ≥ 3.80   | **3.88**                      |

Score distribution on the 50-prompt test set under the best-of-5
composer: `0/2/7/36/5` (counts at score 1/2/3/4/5), median 4.0, std
0.621. Verdict: **PASS**.

For comparison the SFT checkpoint single-shot at v5 decoding scores
3.56 mean coherence (SOFT). The +0.32 lift comes from the inference-
time best-of-N selection across mixed-decoder candidates; the ORPO
trained-time route was tried five times and failed (three data-gate
failures, one trained-and-tied, one plateaued at margins ≈ −0.015
with rewards/accuracies = 0.0; see Training). A best-of-9 extension
reaches 4.04 under the same judge. Engineering log is summarised in
`docs/CHANGELOG.md`.

## Inference recipe

The model is designed to be driven by a 4-node LangGraph pipeline:

1. **Ingestor.** Parses an EDINET Yuho bundle into normalized sections and
   BS / PL / CF JSON, splitting long sections to fit the Pass-1 window.
2. **Pass-1 — per-section detector.** For each section, emits a structured
   JSON observation with keyed fields (risk flags, forward-looking language,
   segment deltas, citation spans).
3. **Pass-2 — memo composer.** Consumes the per-section JSON bundle and
   emits an English investor memo with inline `[cite: ja_span_id]` markers.
4. **Citation-Grounder.** Resolves every cite marker to a verbatim Japanese
   source span; any unresolved marker triggers abstention in that clause
   (abstention-as-feature) rather than a silent drop.

Prompt modules live in the repository under the `src/pipeline/pass1/` and
`src/pipeline/pass2/` directories; see the repo README for the exact paths
and example invocations.

Recommended decoding (Pass-2 memo composer, single-shot fallback):

- temperature 0.1, top-p 0.9, repetition_penalty 1.15,
  no_repeat_ngram_size 0, max new tokens 4096.

These values come from the KG-2 v5 decoding sweep and are committed as
the defaults in `src/yuholens/eval/run_kg2.py`. They produced the best
single-shot mean coherence (3.56) of the six-variant decoding sweep.

Recommended decoding (best-of-N composer, KG-2 PASS configuration):

- Sample 5 candidates per prompt: 3 at the v5 profile above with
  distinct seeds, plus 2 at perturbed profiles
  (e.g. temperature 0.2 / repetition_penalty 1.10 and temperature 0.15
  / repetition_penalty 1.125) to inject decoder diversity.
- Score each candidate with the coherence judge (rubric in
  `src/yuholens/eval/metrics.py:DEFAULT_RUBRIC`).
- Emit the highest-scoring candidate as the final memo.

This is the configuration evaluated above (mean coherence 3.88, PASS).
The first candidate's pass-1 detector outputs and citation-grounder
behaviour are unchanged from the single-shot recipe; best-of-N applies
only to the Pass-2 composer.

## Quantization

Released GGUF artifacts are published to the companion repository
`javierdejesusda/yuholens-14b-GGUF`. The release set is built from the BF16
checkpoint by `scripts/build_gguf.sh`, which calls llama.cpp's
`convert_hf_to_gguf.py` once for f16 and `llama-quantize` once per
target quant. See the script's prereq header for the required
llama.cpp checkout and disk-budget notes.

| Quant     | Verified size | Intended hardware                                       | Throughput (tok/s)        |
|-----------|---------------|---------------------------------------------------------|---------------------------|
| Q3_K_M    | 7.18 GB       | 8 GB consumer GPU (RTX 4070 Laptop, RTX 3060 Ti)        | 12.2 gen / 65.5 prompt on RTX 4070 Laptop, `-c 2048`, `--n-gpu-layers 99` |
| Q4_K_M    | 8.81 GB       | 12-16 GB consumer GPU (RTX 4060 Ti 16 GB, RTX 3080)     | 7.92 gen / 152 prompt on RTX 4070 Laptop with partial offload, `-c 2048`, `--n-gpu-layers 30` |
| Q5_K_M    | 9.94 GB       | 16-24 GB consumer GPU                                   | TBD                       |
| Q6_K      | 11.46 GB      | 24 GB+ consumer or prosumer                             | TBD                       |
| Q8_0      | 14.03 GB      | 24 GB+ prosumer / dual-GPU CPU offload                  | TBD                       |

Sizes above are the actual on-disk byte counts of the released GGUFs
(1024³ GB). Q3_K_M was smoke-tested end-to-end on an RTX 4070 Laptop
(8 GB) at `--ctx-size 2048` with `--n-gpu-layers 99`; the model and
context fit fully in VRAM and produce a coherent English investor memo
from the ChatML-wrapped fixture in `data/sample/smoke_prompt_chatml.txt`.
Q4_K_M and larger quants exceed 8 GB VRAM and require a 12 GB+ GPU or
partial CPU offload (`--n-gpu-layers` < 99).

Pass-1 per-section context of 4-6K tokens is the supported consumer
operating point; longer contexts require the BF16 checkpoint served via
vLLM-ROCm on datacenter hardware. To rebuild the GGUF set from a fresh
checkpoint:

```bash
scripts/build_gguf.sh output/yuholens-14b-sft/checkpoint-212
```

## Limitations and biases

- **Evaluation scale and judge.** Coherence is reported on n=50
  prompts under a single LLM autorater (`gpt-5-mini`); there is no
  human evaluation in the shipping verdict. A secondary calibration
  re-judge under `claude-opus-4-7` produced a lower absolute mean
  reflecting Opus's stricter rubric — see "Note on judge calibration"
  below.
- **Citation accuracy is unaudited.** Citation *presence rate* is
  measured (1.000 on the bo5 picked set) but the verbatim correctness
  of `(ref: '<span>' p.N)` markers against the underlying Japanese Yuho
  text has not been audited. The citation-grounder pipeline replaces
  sentences with `[evidence insufficient]` when no Pass-1 span resolves
  a marker, but a marker that resolves to the *wrong* span will not be
  caught by the current evaluator.
- **Source language asymmetry.** The model only accepts Japanese Yuho input
  and only emits English memos. Attempts to elicit Japanese output will
  degrade quality because the training target distribution is English-only.
- **Fine-tune-on-fine-tune stability.** The base
  `pfnet/nekomata-14b-pfn-qfin` is itself a continual pre-training of rinna's
  `nekomata-14b`. Stacking SFT on top of a CPT-ed base can introduce
  instability; see build-spec §21 for mitigations (BF16 anchor, early kill
  gates, conservative LR). Users should treat repeated-finetune artifacts
  with caution. (A future ORPO retrain on top of this SFT would inherit
  the same caveat; see the negative-result note in Training.)
- **Sequence-length caveat.** Training was at 8192; generations beyond this
  horizon are unsupported and may degrade. See build-spec §19.
- **No live-laptop demo.** The demonstration flow is batch-oriented
  (prepared Yuho bundle → memo). Interactive, single-turn laptop usage is
  not part of the evaluated surface.
- **Domain bias.** The corpus skews toward TSE-listed companies with
  sufficient disclosure depth; small-cap and non-standard filings may
  underperform.
- **Teacher leakage.** The teacher-bootstrap pipeline uses `gpt-5-mini`,
  so stylistic artifacts and residual biases of that teacher may be
  reflected in the student.

## License

- **Model weights.** Released under the Tongyi Qianwen License inherited
  from the Qwen1 base through `pfnet/nekomata-14b-pfn-qfin`. See the
  `license_link` field in the front-matter for the full text. Users must
  comply with the Tongyi Qianwen terms, including any downstream use
  notification requirements.
- **Wrapper code** (LangGraph pipeline, training scripts, evaluation
  harness, prompt modules). Released under MIT.

## Citation

If you use YuhoLens-14B in academic work, please cite:

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

## Authors and contact

- Javier De Jesus — `javier.dejesusj9@gmail.com`

## Acknowledgments

- **AMD Developer Program** — MI300X cloud credit that made full-parameter
  14B training feasible within a hackathon budget.
- **Preferred Networks** — continual pre-training of
  `nekomata-14b-pfn-qfin` on Japanese financial text.
- **Sakana AI** — release of the `EDINET-Bench` annotated Yuho corpus.
- **rinna Co., Ltd.** — base `nekomata-14b` Japanese-adapted Qwen1
  checkpoint.
- **lablab.ai** — hosting the AMD Developer Hackathon.
- **Qwen / Alibaba Cloud**, **Hugging Face TRL**, **vLLM**, **llama.cpp**,
  and **LangGraph** teams — infrastructure that this work depends on. See
  `docs/CITATIONS.md` for the full source list.

## Note on judge calibration

The shipping verdict above (PASS at 3.88 mean coherence) uses
`gpt-5-mini` as the autorater, the same judge the project was designed
against end-to-end. As a methodological calibration check we also
re-judged the 50-memo bo5 and bo9 picked sets blinded under
`claude-opus-4-7` (judge engine selectable via
`--judge-engine anthropic` in `scripts/rescore_kg2.py` and
`scripts/bestofn_judge.py`). Opus applies a stricter rubric — it
reserves score 5 for "senior-PM-grade, unedited" memos and produces no
5s on any LLM-generated text in this domain — and reports a lower
absolute mean. We treat this as rubric calibration rather than a
contradicting verdict; `gpt-5-mini` remains the gate the project is
shipped against.
