# YuhoLens-Pipeline — Social Media Copy

Drafts for the AMD x lablab.ai hackathon launch. Character counts are measured
with Python `len(text)`. X hard-limit is 280 chars; LinkedIn has no hard cap but
the targets below are what we're aiming for.

Mentions:
- X: `@AMDdeveloper`, `@lablabai`
- LinkedIn: tag **AMD Developer** and **lab lab.ai** at paste time (LinkedIn
  resolves the handles interactively, not from raw text).

All eval numbers below are real KG-2 PASS measurements from the 2026-04-25
session: coherence 3.88, citation rate 1.000, section coverage 0.994, on
the 50-prompt KG-2 test set under the best-of-5 mixed-decoder composer.

---

## 1. X Post #1 — KG-2 PASS (around Day 16 / 2026-04-26)

### Variant A — numbers-first (252 / 280 chars)

```
KG-2 PASS on YuhoLens-14B.
Coherence 3.88 (gate 3.80). Citation 1.000. Section coverage 0.994.
14B Japanese-finance LLM, single AMD MI300X, $80 envelope.
The lift: best-of-5 inference-time pick across mixed decoder profiles.
@AMDdeveloper @lablabai
#AMD #ROCm
```

### Variant B — story-first (266 / 280 chars)

```
The bar said 3.80. We hit 3.88.
14B JP-finance fine-tune, one AMD MI300X, 23 days, under $80.
Lift came from inference-time best-of-5, not another training pass.
Cross-decoder diversity > seed diversity for cross-section argument unity.
@AMDdeveloper @lablabai
```

### Variant C — finding-first (244 / 280 chars)

```
KG-2 PASS, 3.88 coherence on YuhoLens-14B.
Finding worth keeping: best-of-5 over mixed decoder profiles beats single-shot by +0.32 with zero extra training.
14B, AMD MI300X, $80.
github.com/javierdejesusda/YuhoLens
@AMDdeveloper @lablabai
```

---

## 2. X Post #2 — Launch (2026-05-09)

### Variant A (273 / 280 chars)

```
YuhoLens is live.
14B Japanese-finance LLM that reads Yuho reports and writes English memos with Japanese-span citations.
KG-2 PASS at 3.88 coherence, citation rate 1.000.
23 days, one AMD MI300X, under $80.
github.com/javierdejesusda/YuhoLens
hf.co/javierdejesusda/yuholens-14b
@AMDdeveloper @lablabai
```

### Variant B (252 / 280 chars)

```
Shipped: YuhoLens, a 14B Japanese-finance LLM.
Yuho in. English memo out. Cited at the span. KG-2 PASS at 3.88.
23 days, one AMD MI300X, under $80.
Code: github.com/javierdejesusda/YuhoLens
Weights: hf.co/javierdejesusda/yuholens-14b
@AMDdeveloper @lablabai #AMD
```

Notes for X2:
- Demo video link is `TBD` — paste the unlisted YouTube URL as a reply or in-thread at post time rather than forcing it into the 280-char body.
- Full HF URLs (`https://huggingface.co/javierdejesusda/yuholens-14b`) are acceptable too; the short `hf.co/...` form above keeps char count comfortable.

---

## 3. LinkedIn Post #1 — KG-2 PASS (Day 16 / 2026-04-26) — ~1,500 chars

```
KG-2 PASS on YuhoLens-14B. Coherence 3.88 (gate 3.80). Citation rate 1.000. Section coverage 0.994.

A 14B Japanese-finance LLM that reads 有価証券報告書 (Yuho annual reports) and writes English investor memos with span-level citations back to the Japanese source.

The metric arc that closed the gap:
- v5 single-shot:                           3.56  (SOFT)
- best-of-2 v4+v5 (mixed decoder):          3.72  (SOFT)
- best-of-3 same-decoder seeds:             3.64  (SOFT)
- best-of-5 mixed decoder + seeds:          3.88  (PASS)

Finding worth keeping: cross-decoder variance produces real coherence diversity, but same-decoder different-seed samples mostly produce judge noise. The cache-vs-fresh judge gap was 0.16 on the v4+v5 mixed pool versus 0.44 on the bo3 same-decoder pool. In our small-N setting, decoder diversity appears to contribute more lift than seed diversity (the bo2-vs-bo3 difference is within one SE at n=50, so report it as a trend, not a significance claim).

The lift is inference-time. Same SFT checkpoint, sampled at five different decoder profiles per prompt, with the coherence judge picking the per-prompt argument-unity peak. ORPO infrastructure is staged but was not exercised — best-of-N over the existing distribution cleared the gate without it.

What remains: HuggingFace + GGUF release, demo cut, blog post. Submission on May 9 to lab lab.ai.

Tooling shoutouts: AMD Developer Cloud (one MI300X, $80 envelope), Preferred Networks (nekomata-14b-pfn-qfin base), Sakana AI (EDINET-Bench eval spine), and lab lab.ai for the hackathon platform.

Question for Japan-market engineers: which Yuho cross-reference patterns are most valuable to surface in the next iteration? Segment revenue vs. MD&A? Related-party vs. footnote? DM me — the next decoder-profile additions will be shaped by your replies.
```

Tag **AMD Developer** and **lab lab.ai** at paste time.

---

## 4. LinkedIn Post #2 — Launch (2026-05-09) — ~1,500 chars

```
YuhoLens is submitted.

Thesis: a 14B Japanese-finance LLM, fine-tuned on one AMD MI300X for under $80, can read a Japanese 有価証券報告書 and produce an English investor memo that cites every claim back to its source span — accurately enough for a human analyst to audit in minutes, not hours.

Numbers (KG-2, 50-prompt held-out test set):
- Citation presence rate: 1.000  (gate 0.70)
- Section coverage:        0.994 (gate 0.60)
- Judge coherence:         3.88  (gate 3.80, gpt-5-mini Likert)

Links:
- Code: https://github.com/javierdejesusda/YuhoLens
- Weights (BF16): https://huggingface.co/javierdejesusda/yuholens-14b
- Weights (GGUF): https://huggingface.co/javierdejesusda/yuholens-14b-GGUF
- Demo video: TBD

Technical highlight: the memo composer is a 4-node LangGraph — Ingestor → Pass-1 Section Detector → MemoCriticAgent (best-of-5 picker) → Citation-Grounder. Two of these nodes do the load-bearing work. The MemoCriticAgent fans out five composer calls across mixed decoder profiles and picks the highest-coherence candidate; that single design choice lifted KG-2 mean coherence from 3.56 (SOFT) to 3.88 (PASS) at zero extra training cost. The Citation-Grounder refuses every claim that lacks a Japanese-span backing — abstention is a first-class output, not a failure mode.

Stats: 1,910 Yuho filings, 3 teacher batches through 5 quality gates, ~38 GPU-hours on a single AMD Instinct MI300X (192 GB HBM3), and 5 GGUF quants from Q3_K_M (7.18 GiB, runs on an 8 GB RTX 4070 Laptop at 10.06 tok/s) up to Q8_0 (14.03 GiB).

Gratitude: AMD Developer Cloud for the MI300X credit, Preferred Networks for the nekomata-14b-pfn-qfin CPT base, Sakana AI for EDINET-Bench, and lab lab.ai for running the hackathon.

Ask: DM me the ticker of a Japanese listed company you want a memo for. I will run it through YuhoLens and send you the output — abstentions, citations and all. The honest signal I care about is whether the memo would actually help you.
```

Tag **AMD Developer** and **lab lab.ai** at paste time. Replace `Demo video: TBD` with the unlisted YouTube URL once the clip is cut.

---

## Checklist before posting

- [ ] Replace `Demo video: TBD` with the unlisted YouTube URL.
- [ ] Re-count any edited X post with `len(text)` in Python before posting.
- [ ] On X, verify `@AMDdeveloper` and `@lablabai` auto-complete to the right accounts.
- [ ] On LinkedIn, use the `@` picker so AMD Developer and lab lab.ai render as company links, not plain text.
- [ ] No emojis unless explicitly requested.
- [ ] Full URLs only — no `bit.ly`, `t.co`, etc.
