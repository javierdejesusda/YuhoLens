"""Generate SFT drafts on the training prompts for Phase E ORPO.

Reads the SFT training file (rows with ``custom_id`` + ``messages``), runs
the SFT checkpoint over each row's user turn (with the original system
turn), and writes one draft per row in the schema consumed by
:mod:`yuholens.training.orpo_data`::

    {"custom_id": ..., "prompt": <user>, "system": <system>, "sft_draft": ...}

Decoding defaults match KG-2 v5 (the shipping decoding profile):
``temperature=0.1, top_p=0.9, repetition_penalty=1.15,
no_repeat_ngram_size=0``. ORPO trains the model to prefer a coherent
rewrite over its own draft, so the drafts must be sampled with the same
decoder we plan to ship. Otherwise the gradient targets a distribution
the user will never see at inference.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path


def build_chatml_prompt(messages: list[dict[str, str]]) -> str:
    """Render the ChatML prefix up to the assistant turn.

    Mirrors :func:`yuholens.eval.run_kg2.build_chatml_prompt` so SFT drafts
    are sampled with the exact prompt format used at KG-2 scoring time.
    """
    parts = []
    for m in messages:
        parts.append(f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>")
    parts.append("<|im_start|>assistant\n")
    return "\n".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-path", type=Path, required=True)
    parser.add_argument("--train-data", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--max-rows", type=int, default=0)
    parser.add_argument("--start-row", type=int, default=0)
    parser.add_argument("--max-new-tokens", type=int, default=4096)
    parser.add_argument("--temperature", type=float, default=0.1)
    parser.add_argument("--top-p", type=float, default=0.9)
    parser.add_argument("--repetition-penalty", type=float, default=1.15)
    parser.add_argument("--no-repeat-ngram-size", type=int, default=0)
    args = parser.parse_args()

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    t0 = time.time()
    print(f"[drafts] loading model from {args.model_path}", flush=True)
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
        f"[drafts] model ready in {time.time()-t0:.1f}s "
        f"(temp={args.temperature} top_p={args.top_p} "
        f"rep_pen={args.repetition_penalty} ngram={args.no_repeat_ngram_size})",
        flush=True,
    )

    with args.train_data.open("r", encoding="utf-8") as fh:
        rows = [json.loads(l) for l in fh if l.strip()]
    if args.start_row:
        rows = rows[args.start_row:]
    if args.max_rows:
        rows = rows[: args.max_rows]

    im_end_id = tokenizer.convert_tokens_to_ids("<|im_end|>")
    eos_ids = [tokenizer.eos_token_id]
    if im_end_id is not None and im_end_id >= 0:
        eos_ids.append(im_end_id)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with args.out.open("a", encoding="utf-8") as fout:
        for idx, row in enumerate(rows):
            custom_id = row.get("custom_id")
            messages = row.get("messages") or []
            if not custom_id or len(messages) < 2:
                continue
            system_msg = next((m for m in messages if m["role"] == "system"), None)
            user_msg = next((m for m in messages if m["role"] == "user"), None)
            if user_msg is None:
                continue
            prefix_messages = [m for m in messages if m["role"] in {"system", "user"}]
            prompt_text = build_chatml_prompt(prefix_messages)
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
            draft = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
            record = {
                "custom_id": custom_id,
                "prompt": user_msg["content"],
                "system": system_msg["content"] if system_msg else "",
                "sft_draft": draft,
            }
            fout.write(json.dumps(record, ensure_ascii=False) + "\n")
            fout.flush()
            written += 1
            print(
                f"[drafts] {idx+1}/{len(rows)} id={custom_id} "
                f"tokens={new_tokens.numel()} dt={time.time()-t_gen:.1f}s",
                flush=True,
            )

    print(f"[drafts] wrote {written} drafts to {args.out}", flush=True)
    return 0 if written else 2


if __name__ == "__main__":
    sys.exit(main())
