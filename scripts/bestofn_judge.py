"""Fresh-judge per-memo coherence scoring across N candidate memo sets.

Runs the KG-2 coherence judge over every memo across every candidate JSONL
in a single session so the resulting per-memo scores are comparable
within and across sets without judge-stochasticity inflation. Output is
one ``data/eval/<label>_per_memo_scores_<tag>.json`` per input set, in
the same schema as ``rescore_kg2.py --per-memo-out``, ready to feed into
``bestofn_pick.py``.

Use this between best-of-N candidate generation and the picker so the
picker operates on judgments from a single judge run rather than mixing
cached scores from independent runs.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        line = re.sub(r"^export\s+", "", line)
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


def _retry(call, attempts: int = 5) -> Any:
    last_exc: BaseException | None = None
    for attempt in range(attempts):
        try:
            return call()
        except Exception as exc:
            last_exc = exc
            if attempt == attempts - 1:
                break
            time.sleep(2 ** attempt)
    assert last_exc is not None
    raise last_exc


def _judge_memos(
    memos: list[str],
    custom_ids: list[str],
    rubric: str,
    model: str,
    client: Any,
    label: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    parsed = 0
    for idx, (memo, cid) in enumerate(zip(memos, custom_ids), start=1):
        user_prompt = (
            "Judge the coherence of this memo on the rubric above. Return "
            "ONLY a single integer 1..5. No commentary.\n\nMEMO:\n<<<\n"
            f"{memo}\n>>>"
        )

        def _call(prompt: str = user_prompt) -> Any:
            return client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": rubric},
                    {"role": "user", "content": prompt},
                ],
            )

        response = _retry(_call)
        score: int | None = None
        choices = getattr(response, "choices", None) or []
        if choices:
            message = getattr(choices[0], "message", None)
            content = (
                getattr(message, "content", None) if message is not None else None
            )
            if content:
                match = re.search(r"\b([1-5])\b", content)
                if match is not None:
                    score = int(match.group(1))
                    parsed += 1
        rows.append({"custom_id": cid, "coherence": score})
        if idx % 10 == 0 or idx == len(memos):
            print(
                f"[bestofn-judge:{label}] {idx}/{len(memos)} parsed={parsed}",
                flush=True,
            )
    return rows


def _summarise(label: str, rows: list[dict[str, Any]]) -> None:
    scores = [r["coherence"] for r in rows if r["coherence"] is not None]
    counter = Counter(scores)
    print(f"[bestofn-judge:{label}] distribution n={len(rows)} parsed={len(scores)}")
    for k in (1, 2, 3, 4, 5):
        print(f"  score {k}: {counter.get(k, 0)}")
    if scores:
        mean = sum(scores) / len(scores)
        median = statistics.median(scores)
        std = statistics.pstdev(scores) if len(scores) > 1 else 0.0
        print(
            f"[bestofn-judge:{label}] mean={mean:.3f} median={median} std={std:.3f}",
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--memos", type=Path, nargs="+", required=True,
        help="One or more candidate memos JSONL files.",
    )
    parser.add_argument(
        "--scores-out", type=Path, nargs="+", required=True,
        help="One per-memo score JSON path per --memos input, same order.",
    )
    parser.add_argument(
        "--labels", type=str, nargs="+", default=None,
        help="Optional human-readable labels per input set; defaults to file stems.",
    )
    parser.add_argument("--judge-model", default="gpt-5-mini")
    parser.add_argument("--env", type=Path, default=Path(".env"))
    args = parser.parse_args()

    if len(args.memos) != len(args.scores_out):
        raise SystemExit("--memos and --scores-out must have equal length")
    labels = args.labels or [p.stem for p in args.memos]
    if len(labels) != len(args.memos):
        raise SystemExit("--labels length must match --memos")

    _load_dotenv(args.env)
    repo_src = Path(__file__).resolve().parents[1] / "src"
    if str(repo_src) not in sys.path:
        sys.path.insert(0, str(repo_src))

    from yuholens.eval.metrics import DEFAULT_RUBRIC

    if not os.environ.get("OPENAI_API_KEY"):
        print("OPENAI_API_KEY missing", file=sys.stderr)
        return 2

    import openai
    client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    for memos_path, scores_path, label in zip(args.memos, args.scores_out, labels):
        memos: list[str] = []
        cids: list[str] = []
        with memos_path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                memos.append(row.get("memo", ""))
                cids.append(row.get("custom_id", ""))
        print(f"[bestofn-judge:{label}] loaded {len(memos)} memos", flush=True)
        rows = _judge_memos(
            memos=memos,
            custom_ids=cids,
            rubric=DEFAULT_RUBRIC,
            model=args.judge_model,
            client=client,
            label=label,
        )
        scores_path.parent.mkdir(parents=True, exist_ok=True)
        scores_path.write_text(
            json.dumps(rows, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"[bestofn-judge:{label}] wrote {scores_path}", flush=True)
        _summarise(label, rows)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
