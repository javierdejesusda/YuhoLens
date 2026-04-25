"""KG 2 evaluation runner — loads the SFT checkpoint directly via
transformers, generates memos on the held-out test set, and scores them on
the three KG-2 gates.

Kill-gates (design §7):
    - citation presence rate >= 0.7
    - mean judge coherence >= 3.8 (1..5 Likert via external judge)
    - mean section coverage >= 0.6 (averaged over the four target sections)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from yuholens.eval.metrics import (
    citation_presence_rate,
    judge_coherence,
    section_coverage,
)


def build_chatml_prompt(messages):
    parts = []
    for m in messages:
        parts.append(f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>")
    parts.append("<|im_start|>assistant\n")
    return "\n".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-path", type=Path, required=True)
    parser.add_argument("--test-rows", type=Path, required=True)
    parser.add_argument("--max-rows", type=int, default=0)
    parser.add_argument("--max-new-tokens", type=int, default=4096)
    parser.add_argument("--temperature", type=float, default=0.1)
    parser.add_argument("--top-p", type=float, default=0.9)
    parser.add_argument(
        "--repetition-penalty",
        type=float,
        default=1.15,
        help=(
            "HuggingFace generate() repetition_penalty; >1.0 discourages "
            "repeats. Defaults to 1.15 after KG-2 v5 showed this value plus "
            "temperature=0.1 produces the highest coherence mean (3.56) of "
            "the decoding sweep. Set to 1.0 to disable."
        ),
    )
    parser.add_argument(
        "--no-repeat-ngram-size",
        type=int,
        default=0,
        help=(
            "HuggingFace generate() no_repeat_ngram_size; blocks exact "
            "n-gram repeats. Defaults to 0 (disabled) after KG-2 v3 showed "
            "a value of 4 catastrophically fragments middle sections by "
            "blocking legitimate financial-terminology reuse. "
            "repetition_penalty alone handles tail collapse without the "
            "structural damage."
        ),
    )
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--judge-model", default="gpt-5-mini")
    parser.add_argument("--judge-parse-min", type=float, default=0.9)
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help=(
            "Optional integer seed forwarded to torch + transformers so "
            "repeat invocations with the same seed reproduce; required when "
            "running best-of-N sampling so each candidate set is "
            "independently reproducible."
        ),
    )
    parser.add_argument(
        "--skip-judge",
        action="store_true",
        help=(
            "Skip the judge / verdict stage; useful when generating "
            "candidate memos for downstream best-of-N picking where the "
            "judge runs separately on the merged set."
        ),
    )
    args = parser.parse_args()

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    if args.seed is not None:
        torch.manual_seed(args.seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(args.seed)
        try:
            from transformers import set_seed as _set_seed
            _set_seed(args.seed)
        except ImportError:
            pass

    t0 = time.time()
    print(f"[kg2] loading model from {args.model_path}", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(
        args.model_path, trust_remote_code=True
    )
    tokenizer.truncation_side = "left"
    model = AutoModelForCausalLM.from_pretrained(
        args.model_path,
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
        device_map="cuda",
    )
    model.eval()
    from yuholens.compat.qwen1_cache_compat import install as _install_cache_compat

    _install_cache_compat(model)
    print(
        f"[kg2] model ready in {time.time()-t0:.1f}s "
        f"(cache-compat installed, repetition_penalty={args.repetition_penalty}, "
        f"no_repeat_ngram_size={args.no_repeat_ngram_size})",
        flush=True,
    )

    with args.test_rows.open("r", encoding="utf-8") as fh:
        rows = [json.loads(l) for l in fh]
    if args.max_rows:
        rows = rows[: args.max_rows]

    im_end_id = tokenizer.convert_tokens_to_ids("<|im_end|>")
    eos_ids = [tokenizer.eos_token_id]
    if im_end_id is not None and im_end_id >= 0:
        eos_ids.append(im_end_id)

    memos = []
    for idx, row in enumerate(rows):
        prompt_text = build_chatml_prompt(row["messages"][:-1])
        inputs = tokenizer(
            prompt_text,
            return_tensors="pt",
            truncation=True,
            max_length=8192 - args.max_new_tokens,
        ).to(model.device)
        t_gen = time.time()
        with torch.inference_mode():
            out = model.generate(
                **inputs,
                max_new_tokens=args.max_new_tokens,
                do_sample=True,
                temperature=args.temperature,
                top_p=args.top_p,
                repetition_penalty=args.repetition_penalty,
                no_repeat_ngram_size=args.no_repeat_ngram_size,
                pad_token_id=tokenizer.eos_token_id,
                eos_token_id=eos_ids,
            )
        new_tokens = out[0][inputs["input_ids"].shape[1]:]
        memo = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
        memos.append(memo)
        print(
            f"[kg2] row {idx+1}/{len(rows)} tokens={new_tokens.numel()} "
            f"dt={time.time()-t_gen:.1f}s",
            flush=True,
        )
        if args.out is not None:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            with args.out.open("a", encoding="utf-8") as fout:
                fout.write(
                    json.dumps(
                        {"custom_id": row.get("custom_id"), "memo": memo},
                        ensure_ascii=False,
                    )
                    + "\n"
                )

    if not memos:
        print("no memos generated", file=sys.stderr)
        return 2

    if args.skip_judge:
        print(
            f"[kg2] skipped judge stage; wrote {len(memos)} memos",
            flush=True,
        )
        return 0

    citation = citation_presence_rate(memos)
    section = section_coverage(memos)
    section_mean = sum(section.values()) / max(len(section), 1)

    if not os.environ.get("OPENAI_API_KEY"):
        print("OPENAI_API_KEY missing; skipping coherence judge.", file=sys.stderr)
        coherence = float("nan")
    else:
        coherence = judge_coherence(
            memos,
            model=args.judge_model,
            min_parse_rate=args.judge_parse_min,
        )

    coherence_display = f"{coherence:.2f}" if coherence == coherence else "nan"
    print(
        f"citation={citation:.3f} coherence={coherence_display} "
        f"section_coverage={section_mean:.3f}",
        flush=True,
    )
    print(
        "section_detail="
        + json.dumps({k: round(v, 3) for k, v in section.items()}, ensure_ascii=False),
        flush=True,
    )

    coherence_pass = coherence == coherence and coherence >= 3.8
    gates = {
        "citation": citation >= 0.7,
        "coherence": coherence_pass,
        "section": section_mean >= 0.6,
    }
    hard_pass = all(gates.values())
    soft = (0.6 <= citation < 0.7) or (
        coherence == coherence and 3.2 <= coherence < 3.8
    )
    verdict = "PASS" if hard_pass else ("SOFT" if soft else "HARD")
    print(f"gates={json.dumps(gates)} verdict={verdict}", flush=True)
    return 0 if hard_pass else 1


if __name__ == "__main__":
    sys.exit(main())
