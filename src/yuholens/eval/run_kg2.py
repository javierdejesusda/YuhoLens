"""KG 2 evaluation runner — serves the SFT checkpoint over an OpenAI-style
endpoint, generates memos on the held-out test set, and scores them on the
three KG-2 gates.

Kill-gates (from design §7):
    - citation presence rate >= 0.7
    - mean judge coherence >= 3.8 (on 1..5 Likert)
    - mean section coverage >= 0.6 (averaged over the four target sections)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from openai import OpenAI

from yuholens.eval.metrics import (
    citation_presence_rate,
    judge_coherence,
    section_coverage,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model-url",
        required=True,
        help="vLLM / OpenAI-compatible base URL, e.g. http://localhost:8000/v1",
    )
    parser.add_argument(
        "--served-model",
        default="yuholens-14b-sft",
        help="Model name the vLLM server advertises.",
    )
    parser.add_argument("--test-rows", type=Path, required=True)
    parser.add_argument(
        "--max-rows",
        type=int,
        default=0,
        help="Cap on test rows (0 = all).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Optional path to write the generated memos as JSONL.",
    )
    parser.add_argument(
        "--judge-model",
        default="gpt-5-mini",
        help="OpenAI model name for coherence judge.",
    )
    parser.add_argument(
        "--judge-parse-min",
        type=float,
        default=0.9,
        help="Minimum judge parse rate; below this, the run fails.",
    )
    parser.add_argument(
        "--max-tokens", type=int, default=2048, help="Generation budget per memo."
    )
    args = parser.parse_args()

    sft_client = OpenAI(base_url=args.model_url, api_key="none")

    memos: list[str] = []
    with args.test_rows.open("r", encoding="utf-8") as fh:
        for n, line in enumerate(fh):
            if args.max_rows and n >= args.max_rows:
                break
            row = json.loads(line)
            prompt_messages = row["messages"][:-1]  # strip the assistant target
            completion = sft_client.chat.completions.create(
                model=args.served_model,
                messages=prompt_messages,
                max_tokens=args.max_tokens,
                temperature=0.2,
            )
            memo = completion.choices[0].message.content or ""
            memos.append(memo)
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

    citation = citation_presence_rate(memos)
    section = section_coverage(memos)
    section_mean = sum(section.values()) / max(len(section), 1)

    if not os.environ.get("OPENAI_API_KEY"):
        print(
            "OPENAI_API_KEY missing; skipping coherence judge.",
            file=sys.stderr,
        )
        coherence = float("nan")
    else:
        coherence = judge_coherence(
            memos,
            model=args.judge_model,
            min_parse_rate=args.judge_parse_min,
        )

    print(
        f"citation={citation:.3f} "
        f"coherence={coherence:.2f} "
        f"section_coverage={section_mean:.3f}"
    )
    print(
        "section_detail="
        + json.dumps({k: round(v, 3) for k, v in section.items()}, ensure_ascii=False)
    )

    gates = {
        "citation": citation >= 0.7,
        "coherence": coherence >= 3.8 if coherence == coherence else False,
        "section": section_mean >= 0.6,
    }
    hard_pass = all(gates.values())
    soft = (
        (0.6 <= citation < 0.7)
        or (3.2 <= coherence < 3.8 if coherence == coherence else False)
    )

    if hard_pass:
        verdict = "PASS"
    elif soft:
        verdict = "SOFT"
    else:
        verdict = "HARD"
    print(f"gates={json.dumps(gates)} verdict={verdict}")
    return 0 if hard_pass else 1


if __name__ == "__main__":
    sys.exit(main())
