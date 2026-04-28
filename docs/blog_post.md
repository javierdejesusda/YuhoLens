---
title: "Fine-Tuning a Japanese Financial LLM on AMD MI300X in 23 Days"
subtitle: "Teacher-bootstrapped SFT on nekomata-14b-pfn-qfin, lifted by inference-time best-of-N, distilled to consumer-GGUF, with span-cited English memos"
date: 2026-05-09
author: "Javier De Jesus"
tags: [llm, japanese-finance, rocm, mi300x, qwen, edinet, fine-tuning, orpo, langgraph]
draft: false
---

## The problem

A Japanese 有価証券報告書 (Yuho) is a dense, cross-referential annual disclosure. The parts that matter to an investor almost never live in one section. A going-concern note in 事業等のリスク (business risks) quietly hedges the earnings trajectory you would otherwise read off the P/L. Related-party exposure hides inside segment-footnote tables rather than the headline balance sheet. Accrual-quality stress only reveals itself when days-sales-outstanding drifts up while revenue drifts down and operating cash flow drifts up — three numbers in three different sections, connected only by whoever is reading.

A monolingual English portfolio manager reading a machine-translated Yuho gets a smooth English paragraph with none of those cross-references surfaced. Worse, current English summaries of Japanese filings either hallucinate numbers that sound plausible or collapse everything into generic risk-factor boilerplate. The workflow we actually need is narrower than "translate" and harder than "summarize": take the Japanese filing, produce an English investor memo with inline span-level citations back to the source Japanese, and refuse to make claims that are not grounded in those spans. That is what YuhoLens-Pipeline tries to be.

## Why a fine-tune and not RAG or prompt-engineering

The base model we picked — `pfnet/nekomata-14b-pfn-qfin` — is already a Japanese-finance specialist. Preferred Networks did the expensive continued-pretraining on top of rinna's `nekomata-14b`, so the model already handles Japanese GAAP vocabulary, financial prose, and the register used in 有価証券報告書. What it does not do out of the box is produce a structured English investor memo with inline citations back to Japanese source spans. That is a narrow formatting and discipline problem, not a retrieval or world-knowledge problem. Fine-tuning the memo format and the citation behaviour is the minimum-viable intervention; RAG would add plumbing without fixing the output shape.

## Teacher-bootstrap: OpenAI gpt-5-mini batch API

Hand-labelling 2,000 bilingual investor memos was never in the budget. Instead, we bootstrapped the dataset: a bigger generalist teacher (OpenAI's `gpt-5-mini` via the batch API) wrote English memos over the public `SakanaAI/EDINET-Bench` corpus, each memo constrained to include at least three inline citations to Japanese spans copied verbatim from the source. We pulled 865 + 549 + 496 = 1,910 training rows across three split calls. Every generated memo went through five quality gates before it was allowed into SFT: exact-duplicate dedup, inline-citation count, hallucinated-number check (every number in the memo must match a span in the source), length window, and a langdetect pass to reject Japanese that leaked into the English output. Post-filter retention sat at roughly 85 to 90 percent. Batch-API cost for the whole bootstrap: about $4.84 at the published `gpt-5-mini` rates of $0.125/$1.00 per million input/output tokens. The 24-hour async wait is free when you are not latency-sensitive.

## MI300X training: what actually mattered

Training ran on a single AMD Instinct MI300X (192 GB HBM3, ROCm 7.0) on the AMD Developer Cloud. A handful of specifics dominated the real wall-clock.

**(a) Qwen1 flash-attention routing.** `nekomata-14b-pfn-qfin` is a Qwen1 derivative. The Hugging Face `attn_implementation="flash_attention_2"` kwarg does not work here — Qwen1 ships its own `modeling_qwen.py` and expects to be told about flash-attn via config, not via the HF load kwarg. The pattern that actually works on ROCm:

```python
from transformers import AutoConfig, AutoModelForCausalLM

cfg = AutoConfig.from_pretrained(
    "pfnet/nekomata-14b-pfn-qfin",
    trust_remote_code=True,
)
cfg.use_flash_attn = "auto"  # Qwen1-specific, not HF-generic

model = AutoModelForCausalLM.from_pretrained(
    "pfnet/nekomata-14b-pfn-qfin",
    config=cfg,
    trust_remote_code=True,
    torch_dtype="bfloat16",
)
```

**(b) bitsandbytes source-build.** There is no prebuilt ROCm 7.0 wheel for bitsandbytes on `gfx942`. We built from the `ROCm/bitsandbytes:rocm_enabled` branch with `cmake -DCOMPUTE_BACKEND=hip -DBNB_ROCM_ARCH="gfx942"` and used 8-bit AdamW to keep the optimizer state off the critical path.

**(c) Sequence length.** We trained at 8192 rather than pushing to 12K. PFN's CPT was done at seq 2048 — going straight to 12K is a 6x distribution shift on positional encodings, and `nekomata-14b`'s `max_position_embeddings` is 8192 anyway. We use dynamic-NTK at inference for the modest push to 10-12K when a Yuho section demands it, which is safer than training there.

**(d) Throughput and VRAM.** With BF16, grad-checkpointing, and flash-attn on, a single MI300X sustained roughly 900-1,200 tokens/second at seq 8192. SFT across ~1,910 examples finished in about 10 hours. Peak VRAM stayed under 140 GB of the available 192 GB, which left headroom for the reference-free ORPO trainer that was wired in but, as it turned out, never needed to ship.

After SFT we built the ORPO route end-to-end — `(SFT_draft, gpt-5-mini_rewrite)` preference pairs, a coherence-flavoured critique prompt, the reference-free TRL trainer on a single MI300X — and it never produced a checkpoint that was worth releasing. Five iterations, three categorically distinct failure modes. V1 and V2 failed at the pre-training data-quality gate before any GPU step ran: V1's critique steered the rewriter toward citation grounding rather than the cross-section argument unity the KG-2 judge actually scores, and V2 had a missing constraint that let `gpt-5-mini` strip existing `(ref: ...)` markers from the SFT drafts during rewriting (chosen citation rate 0.305 versus rejected 0.995). V2.1 surfaced a third subtler bug — the patched critique referenced the plural `(refs:` form while the canonical evaluator regex matches the singular `(ref:` form, so the V2.1 "PASS" was actually an artefact of measuring with the wrong regex. V2.2 finally cleared the canonical-regex data gate cleanly (chosen 1.000, rejected 0.996) and trained 50 steps — but rewards/accuracies stayed at 0.0 throughout and the smoke at the v5 decoder tied the SFT baseline. V3 widened the budget (4 epochs, lower learning rate, softer beta) and trained 100 steps before plateauing at reward margins ≈ −0.015 with rewards/accuracies still 0.0; the kill switch fired at epoch 2.0. Total ORPO spend: ~$10.50 of GPU plus a few dollars of OpenAI for the critique batches. The lesson: synthetic-preference ORPO works well when the critique constraint set is complete and pointed at the same metric the downstream judge scores; when those two conditions are off, the gradient signal is at best wasted compute and at worst actively harmful, and a cheap pre-train data gate plus a 5-step smoke gate are the difference between catching that in $3 of OpenAI calls and burning $20 of GPU. At this corpus scale (790 preferences) the signal-to-noise floor on reward margins appears asymptotic at ≈ −0.015; further attempts would need substantially more preference data or a different objective (DPO/IPO), not more steps.

## The 4-agent LangGraph pipeline

The shipped agent is four nodes, not the six we originally specified. The Ingestor splits the Yuho into sixteen labelled Japanese sections via regex and emits a structured payload that includes the raw balance-sheet / P&L / cash-flow tables. Pass-1 calls the fine-tuned model once per section with a JSON-schema-constrained prompt: return red flags, section summaries, and Japanese-span citations, nothing else. Pass-2 composes the full English memo from the concatenated Pass-1 JSON plus the raw BS/PL/CF tables carried in the ingestor payload — never re-reading the full Yuho. Citation-Grounder is the last node, and it is the load-bearing one: every inline `(ref: '...')` citation in the English memo must match a `japanese_span` value from the union of Pass-1 outputs. Any sentence whose citations are all ungrounded is replaced with `[evidence insufficient]`. Abstention is a feature, not a failure mode. A memo with three `[evidence insufficient]` lines tells a PM what the filing does not support; a fluent hallucinated paragraph does not.

## What the best-of-N data showed

After SFT clean-up the single-shot KG-2 mean coherence sat at 3.56 — SOFT, 0.24 below the 3.80 PASS gate. We then ran a small inference-time experiment instead of reaching for another training pass. The headline metric arc:

| stage                               | mean coherence | verdict | source                       |
| ----------------------------------- | -------------- | ------- | ---------------------------- |
| v5 single-shot                      | 3.56           | SOFT    | session 1.6                  |
| best-of-2 v4+v5 (mixed decoder)     | 3.72           | SOFT    | session 1.7                  |
| best-of-3 same-decoder seeds        | 3.64           | SOFT    | session 1.7 GPU run          |
| **best-of-5 mixed decoder + seeds** | **3.88**       | PASS    | session 1.7, free over existing memos |

Two stacked observations explain the lift. First, **cross-decoder variance produces real coherence diversity** while same-decoder seed variance mostly produces judge noise: the cache-vs-fresh judge gap was 0.16 on the v4+v5 mixed pool versus 0.44 on the bo3 same-decoder pool, evidence that mixed-decoder picks reflect real per-prompt quality differences and same-decoder picks reflect judge stochasticity. Second, given diverse candidates, the coherence judge consistently identifies which completion has the strongest cross-section evidence ladder, so over 50 prompts the picked-set mean lifts above any single source's mean because the per-prompt peaks come from different sources. Final pick share on the bo5 release: v4 40 percent, v5 30 percent, the three same-decoder seeds 30 percent combined. Decoder diversity dominates seed diversity for cross-section argument unity, and that finding is now baked into `src/yuholens/agents/decoder_profiles.py` and the LangGraph MemoCriticAgent.

ORPO never produced a shipped checkpoint (see the SFT section above for the data-gate story). The inference-time best-of-N picker cleared the KG-2 PASS gate on its own, cheaper and with less risk than another training pass would have bought.

## Consumer GGUF: Q4_K_M on a 4060 Ti

The release target is consumer hackers, not cloud latency. We quantize to four targets via `llama.cpp` — Q4_K_M, Q5_K_M, Q6_K, and Q8_0 — built by `scripts/build_gguf.sh` against a fresh checkpoint. The headline release is the 9.45 GB Q4_K_M, sized for an RTX 4060 Ti 16 GB. The Pass-1 per-section calls fit comfortably at 4-6K context, which is the typical Yuho section length, and Pass-2 stays under 8K with the concatenated Pass-1 JSON as input rather than raw Japanese. Final consumer-class tok/s numbers: TBD on the recording rig.

## Numbers

- Total training tokens: ~19M
- GPU-hours on MI300X: ~38
- Training spend: ~$75.62 at $1.99/hr
- Teacher API spend: ~$4.84
- **Total spend: ~$80, inside the $100 AMD Developer Cloud credit**
- Wall-clock: 23 days, including two 24-hour async batch waits and one 10-12 hour SFT job
- KG-2 PASS: citation 1.000, section coverage 0.994, judge coherence 3.88 (best-of-5 mixed decoder over the SFT checkpoint at `output/yuholens-14b-sft/checkpoint-212`)

## What broke and what we kept

Two honest lessons. The bitsandbytes source-build on ROCm 7.0 `gfx942` consumed the better part of a day — documentation was sparse and the `cmake` invocation above is the one that actually worked. The Qwen1 flash-attn routing gotcha silently downgraded to vanilla attention on the first training run and cost us ~30 percent throughput before we noticed. On the pipeline side: the original spec was six LangGraph nodes. We collapsed to four after moving the BS/PL/CF tables out of the shared graph state and into the Ingestor's payload — graph state is for things the model writes, not for things the parser already owns.

## Close

Code and weights are on GitHub at https://github.com/javierdejesusda/YuhoLens, with the SFT BF16 weights and the Q4_K_M GGUF released on HuggingFace. Submitted to the AMD Developer Hackathon on lablab.ai, May 9, 2026. Thanks to the AMD Developer Program for the MI300X credit, to Preferred Networks and rinna for the base model, to Sakana AI for EDINET-Bench, to OpenAI for the batch API, and to the lablab.ai team for hosting.
