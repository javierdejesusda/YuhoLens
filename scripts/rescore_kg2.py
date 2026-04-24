"""Rescore an existing KG-2 memos JSONL locally.

Used when `run_kg2.py` finished generation on the droplet but crashed in the
metric stage (e.g. bad OPENAI_API_KEY). Replays citation, section coverage,
and judge coherence against a memos file and prints the same verdict block
as `run_kg2.py`.

When ``--per-memo-out`` is supplied, the script bypasses
:func:`yuholens.eval.metrics.judge_coherence` and inlines a per-memo judge
loop so every memo's integer score is persisted alongside its ``custom_id``.
The aggregate mean is still computed from those scores and the verdict is
unchanged. After persisting, a histogram plus weak-tail summary is printed
so the caller can decide whether the coherence distribution is bimodal
(LM-head polish likely to help) or centred (likely to need deeper changes).

Usage:
    python scripts/rescore_kg2.py \
        --memos data/eval/kg2_memos.jsonl \
        --out data/eval/kg2_scores.json

    python scripts/rescore_kg2.py \
        --memos data/eval/kg2_memos_v2.jsonl \
        --out data/eval/kg2_scores_v2.json \
        --per-memo-out data/eval/kg2_per_memo_scores_v2.json
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
    """Call a zero-arg function with bounded exponential backoff.

    Mirrors :func:`yuholens.eval.metrics._retry_call` but is duplicated here
    so the script does not reach into a private symbol.
    """
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


def _judge_per_memo(
    memos: list[str],
    custom_ids: list[str],
    rubric: str,
    model: str,
    min_parse_rate: float,
) -> list[dict[str, Any]]:
    """Judge coherence memo-by-memo and return per-memo rows.

    Uses the same system-prompt rubric as :func:`judge_coherence` so cached
    prefix reuse still kicks in, but returns the full list of parsed scores
    instead of collapsing to a mean. Rows with an unparseable judge reply
    are recorded with ``coherence=None`` so the caller can triage them.

    Args:
        memos: Memo strings, aligned with ``custom_ids``.
        custom_ids: Row identifiers, aligned with ``memos``.
        rubric: Judge system prompt. Usually ``metrics.DEFAULT_RUBRIC``.
        model: Chat-completions model name.
        min_parse_rate: Minimum fraction of memos whose judge response must
            parse. Raises ``ValueError`` when the observed rate is lower.

    Returns:
        List of ``{"custom_id": str, "coherence": int | None}`` dicts, one
        per input memo and in the same order.

    Raises:
        ValueError: When parse rate falls below ``min_parse_rate``.
    """
    import openai

    client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
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
        choices = getattr(response, "choices", None) or []
        score: int | None = None
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
                f"[rescore] judged {idx}/{len(memos)} "
                f"(parsed={parsed})",
                flush=True,
            )

    parse_rate = parsed / len(memos)
    if parse_rate < min_parse_rate:
        raise ValueError(
            f"Judge parse rate {parse_rate:.1%} below minimum "
            f"{min_parse_rate:.1%} ({parsed}/{len(memos)} memos parsed)"
        )
    return rows


def _summarise_distribution(rows: list[dict[str, Any]]) -> None:
    """Print a coherence histogram, central-tendency stats, and weak tail."""
    scores = [row["coherence"] for row in rows if row["coherence"] is not None]
    failures = [row["custom_id"] for row in rows if row["coherence"] is None]
    counter = Counter(scores)
    print(
        f"[rescore] coherence distribution (n={len(rows)}, parsed={len(scores)})",
        flush=True,
    )
    for bucket in (1, 2, 3, 4, 5):
        print(f"  score {bucket}: {counter.get(bucket, 0)}", flush=True)
    if failures:
        print(f"  parse_failures: {len(failures)} -> {failures}", flush=True)
    if scores:
        mean = sum(scores) / len(scores)
        median = statistics.median(scores)
        std = statistics.pstdev(scores) if len(scores) > 1 else 0.0
        print(
            f"[rescore] mean={mean:.3f} median={median} std={std:.3f}",
            flush=True,
        )
        weak_tail = [
            row["custom_id"]
            for row in rows
            if row["coherence"] is not None and row["coherence"] <= 2
        ]
        print(
            f"[rescore] weak tail (<=2): {len(weak_tail)} memos -> {weak_tail}",
            flush=True,
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--memos", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--per-memo-out", type=Path, default=None)
    parser.add_argument("--judge-model", default="gpt-5-mini")
    parser.add_argument("--judge-parse-min", type=float, default=0.9)
    parser.add_argument("--env", type=Path, default=Path(".env"))
    args = parser.parse_args()

    _load_dotenv(args.env)
    repo_src = Path(__file__).resolve().parents[1] / "src"
    if str(repo_src) not in sys.path:
        sys.path.insert(0, str(repo_src))

    from yuholens.eval.metrics import (
        DEFAULT_RUBRIC,
        citation_presence_rate,
        judge_coherence,
        section_coverage,
    )

    memos: list[str] = []
    custom_ids: list[str] = []
    with args.memos.open("r", encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            memos.append(row["memo"])
            custom_ids.append(row.get("custom_id", ""))
    if not memos:
        print("no memos loaded", file=sys.stderr)
        return 2
    print(f"[rescore] loaded {len(memos)} memos from {args.memos}", flush=True)

    citation = citation_presence_rate(memos)
    section = section_coverage(memos)
    section_mean = sum(section.values()) / max(len(section), 1)

    if not os.environ.get("OPENAI_API_KEY"):
        print("OPENAI_API_KEY missing", file=sys.stderr)
        return 2
    print(
        f"[rescore] judging coherence with {args.judge_model}…",
        flush=True,
    )
    per_memo_rows: list[dict[str, Any]] | None = None
    if args.per_memo_out is not None:
        per_memo_rows = _judge_per_memo(
            memos=memos,
            custom_ids=custom_ids,
            rubric=DEFAULT_RUBRIC,
            model=args.judge_model,
            min_parse_rate=args.judge_parse_min,
        )
        parsed_scores = [
            row["coherence"] for row in per_memo_rows if row["coherence"] is not None
        ]
        coherence = sum(parsed_scores) / len(parsed_scores) if parsed_scores else 0.0
        args.per_memo_out.parent.mkdir(parents=True, exist_ok=True)
        args.per_memo_out.write_text(
            json.dumps(per_memo_rows, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"[rescore] wrote {args.per_memo_out}", flush=True)
        _summarise_distribution(per_memo_rows)
    else:
        coherence = judge_coherence(
            memos,
            model=args.judge_model,
            min_parse_rate=args.judge_parse_min,
        )

    print(
        f"citation={citation:.3f} coherence={coherence:.2f} "
        f"section_coverage={section_mean:.3f}",
        flush=True,
    )
    print(
        "section_detail="
        + json.dumps(
            {k: round(v, 3) for k, v in section.items()}, ensure_ascii=False
        ),
        flush=True,
    )

    gates = {
        "citation": citation >= 0.7,
        "coherence": coherence >= 3.8,
        "section": section_mean >= 0.6,
    }
    hard_pass = all(gates.values())
    soft = (0.6 <= citation < 0.7) or (3.2 <= coherence < 3.8)
    verdict = "PASS" if hard_pass else ("SOFT" if soft else "HARD")
    print(f"gates={json.dumps(gates)} verdict={verdict}", flush=True)

    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(
                {
                    "citation": citation,
                    "coherence": coherence,
                    "section_coverage_mean": section_mean,
                    "section_detail": section,
                    "gates": gates,
                    "verdict": verdict,
                    "n_memos": len(memos),
                    "judge_model": args.judge_model,
                    "memos_file": str(args.memos),
                },
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"[rescore] wrote {args.out}", flush=True)
    return 0 if hard_pass else 1


if __name__ == "__main__":
    sys.exit(main())
