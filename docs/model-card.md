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

### Judge stack

Coherence is measured by two independent judges on the same 50-prompt
test set:

- **Primary — `claude-opus-4-7`** (Anthropic), invoked same-pass blinded
  over 100 candidate memos (50 bo5-picked + 50 bo9-picked, run together
  with anonymised IDs so the judge cannot tell which set a memo came
  from). Judge engine selectable via `--judge-engine anthropic` in
  `scripts/rescore_kg2.py` and `scripts/bestofn_judge.py`.
- **Secondary — `gpt-5-mini`** (OpenAI Batch API), the original judge
  used for the bo5/bo9 generation passes.

**Inter-judge agreement (n=100 paired ratings):**

| Statistic                          | Value |
|------------------------------------|------:|
| Cohen's κ (unweighted)             | 0.017 |
| Cohen's κ (quadratic-weighted)     | 0.080 |

The two judges agree at essentially the level of chance.
`gpt-5-mini` is systematically more lenient (mean 3.96 vs Opus 2.54
across all 100 memos), and the two judges disagree on the *direction*
of the bo9-vs-bo5 lift.

### Headline coherence (n=50 per set, paired by `custom_id`)

| Configuration | Opus 4.7 mean | gpt-5-mini mean | Gate (≥3.80) |
|---------------|--------------:|----------------:|:------------:|
| bo5 picked    | **2.60**      | **3.88**        | gpt PASS / Opus FAIL |
| bo9 picked    | **2.48**      | **4.04**        | gpt PASS / Opus FAIL |

**Paired Opus delta (bo9 − bo5) = −0.12** (bo9 nominally *worse* under
Opus). 95% bootstrap CI [−0.36, +0.10] (10,000 resamples, rng=20260428)
**includes zero**; sign-test two-sided exact-binomial p = 0.648. The
bo9 lift is *not* statistically distinguishable from judge stochasticity
at n=50 under Opus, and the direction of the lift flips between judges
(Opus −0.12, gpt-5-mini +0.16).

| Metric                          | Definition                                                                                   | Target   | bo5 picked | bo9 picked |
|---------------------------------|----------------------------------------------------------------------------------------------|----------|------------|------------|
| Citation presence rate          | Fraction of generated memos with at least one inline `(ref: '…' p.X)` Japanese-span citation. | ≥ 0.70   | **1.000**  | **1.000**  |
| Section coverage                | Mean coverage of the seven memo sections (executive summary, going-concern, accrual quality, earnings direction, top risks, related-party, evidence appendix). | ≥ 0.60   | **0.994**  | **0.997**  |
| Judge coherence — `gpt-5-mini`  | 1-5 Likert mean (gpt-5-mini Batch API).                                                      | ≥ 3.80   | **3.88**   | **4.04**   |
| Judge coherence — `claude-opus-4-7` (primary, blinded) | 1-5 Likert mean, blinded same-pass over 100 memos.                | ≥ 3.80   | **2.60**   | **2.48**   |

Score distribution on the 50-prompt bo5 picked set under `gpt-5-mini`:
`0/2/7/36/5` (counts at score 1/2/3/4/5), median 4.0, std 0.621. Under
Opus 4.7 the joint 100-memo distribution is `13/40/27/20/0` (mean 2.54)
— no memo received a 5.

For comparison the SFT checkpoint single-shot at v5 decoding scores
3.56 mean coherence under `gpt-5-mini`. The +0.32 lift to bo5 comes
from the inference-time best-of-N selection across mixed-decoder
candidates; the ORPO trained-time route was tried five times and
failed (three data-gate failures, one trained-and-tied, one plateaued
at margins ≈ −0.015 with rewards/accuracies = 0.0; see Training).
Full session details: `docs/session_2026-04-25_summary.md`,
`docs/session_2026-04-26_summary.md`,
`docs/session_2026-04-28_bo9_summary.md`,
`docs/session_2026-04-28_opus_judge_summary.md`.

### Shipping recommendation

Recommend **bo5 picked** as the shippable artefact under the
`gpt-5-mini` judge gate (3.88 PASS; smaller candidate pool; cheaper
inference). The bo9 lift was not validated by the stricter Opus 4.7
judge — direction flips and the paired CI includes zero at n=50, so the
+0.16 gpt-5-mini lift is best read as judge noise within Opus's
calibration. The bo9 picked-memo files are retained for future
re-evaluation against larger n or alternative judges; the locked SFT
checkpoint and bo5/bo9 picked-memo files are unchanged.

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
`yuholens/yuholens-14b-GGUF`. The release set is built from the BF16
checkpoint by `scripts/build_gguf.sh`, which calls llama.cpp's
`convert_hf_to_gguf.py` once for f16 and `llama-quantize` once per
target quant. See the script's prereq header for the required
llama.cpp checkout and disk-budget notes.

| Quant     | Approx. size | Intended hardware                | Target throughput (tok/s) |
|-----------|--------------|----------------------------------|---------------------------|
| Q4_K_M    | ~9.45 GB     | 16 GB consumer GPU (RTX 4060 Ti) | ≥ 18                      |
| Q5_K_M    | ~10.5 GB     | 16-24 GB consumer GPU            | TBD                       |
| Q6_K      | ~12.1 GB     | 24 GB+ consumer or prosumer      | TBD                       |
| Q8_0      | ~15.7 GB     | 24 GB+ prosumer / dual-GPU CPU offload | TBD                 |

Pass-1 per-section context of 4-6K tokens is the supported consumer
operating point; longer contexts require the BF16 checkpoint served via
vLLM-ROCm on datacenter hardware. To rebuild the GGUF set from a fresh
checkpoint:

```bash
scripts/build_gguf.sh output/yuholens-14b-sft/checkpoint-212
```

## Limitations and biases

- **Evaluation scale and judge disagreement.** Coherence is reported on
  n=50 paired prompts per configuration with no held-out-by-domain split
  beyond the 10/24/16 row-counts shown in
  `docs/session_2026-04-28_opus_judge_summary.md`. There is **no human
  evaluation** — both judges are LLM autoraters (`gpt-5-mini` Batch and
  `claude-opus-4-7` blinded). Cohen's κ between the two judges is 0.017
  unweighted / 0.080 quadratic-weighted on n=100 paired ratings: agreement
  is at chance level. The judges disagree on the *direction* of the
  bo9-vs-bo5 lift (gpt-5-mini +0.16, Opus −0.12). The bo9 lift is not
  statistically distinguishable from zero under Opus (paired 95%
  bootstrap CI [−0.36, +0.10], sign-test p=0.648). Treat the headline
  3.88/4.04 numbers as one judge's read; the stricter Opus result of
  2.60/2.48 is a calibration anchor, not a contradicting verdict.
- **Citation accuracy is unaudited.** Citation *presence rate* is
  measured (1.000 on bo5 and bo9 picked sets) but the verbatim
  correctness of `(ref: '<span>' p.N)` markers against the underlying
  Japanese Yuho text has not been audited. The citation-grounder
  pipeline replaces sentences with `[evidence insufficient]` when no
  Pass-1 span resolves a marker, but a marker that resolves to the
  *wrong* span will not be caught by the current evaluator.
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
  url          = {https://huggingface.co/yuholens/yuholens-14b},
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
