"""Pick the higher-coherence memo per custom_id from N candidate memo sets.

Validates the best-of-N hypothesis using already-judged memos. Inputs are
``--memos`` JSONL files (rows ``{custom_id, memo}``) and matching
``--scores`` per-memo JSON files (rows ``{custom_id, coherence}``) emitted
by ``scripts/rescore_kg2.py --per-memo-out``. The script aligns by
``custom_id`` across all candidate sets, picks the candidate with the
highest cached judge score per ``custom_id`` (ties broken by file order),
and writes:

    --picked-memos:  JSONL of the winning memos (same schema as inputs)
    --picked-scores: JSON with picked-score per custom_id (same schema as
                     the per-memo score files)

Then it prints a pick-distribution summary (how often each input set won)
and the upper-bound mean of cached picked scores. Note: the cached scores
were produced in independent judge runs, so judge-noise inflates the mean
slightly versus running a fresh same-pass judgment on both candidates.
After this pick step you should rescore the picked memos with
``scripts/rescore_kg2.py`` for an unbiased mean.
"""

from __future__ import annotations

import argparse
import json
import statistics
from collections import Counter
from pathlib import Path
from typing import Any


def _load_memos(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            cid = row.get("custom_id")
            memo = row.get("memo")
            if isinstance(cid, str) and isinstance(memo, str):
                out[cid] = memo
    return out


def _load_scores(path: Path) -> dict[str, int | None]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, int | None] = {}
    for row in rows:
        cid = row.get("custom_id")
        score = row.get("coherence")
        if isinstance(cid, str):
            out[cid] = score if isinstance(score, int) else None
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--memos",
        type=Path,
        required=True,
        nargs="+",
        help="Candidate memos JSONL files, in priority order (ties go to first).",
    )
    parser.add_argument(
        "--scores",
        type=Path,
        required=True,
        nargs="+",
        help=(
            "Per-memo score JSON files matching --memos in order; produced by "
            "rescore_kg2.py --per-memo-out."
        ),
    )
    parser.add_argument("--picked-memos", type=Path, required=True)
    parser.add_argument("--picked-scores", type=Path, required=True)
    parser.add_argument(
        "--labels",
        type=str,
        nargs="+",
        default=None,
        help="Optional human-readable labels per input set; defaults to file stems.",
    )
    args = parser.parse_args()

    if len(args.memos) != len(args.scores):
        raise SystemExit("--memos and --scores must have the same length")
    if args.labels is None:
        labels = [p.stem for p in args.memos]
    else:
        if len(args.labels) != len(args.memos):
            raise SystemExit("--labels length must match --memos")
        labels = args.labels

    memo_sets: list[dict[str, str]] = [_load_memos(p) for p in args.memos]
    score_sets: list[dict[str, int | None]] = [_load_scores(p) for p in args.scores]

    cids: list[str] = sorted(set().union(*[set(m.keys()) for m in memo_sets]))
    picked_memos: list[dict[str, Any]] = []
    picked_scores: list[dict[str, Any]] = []
    pick_counter: Counter[str] = Counter()
    skipped = 0

    for cid in cids:
        best_idx: int | None = None
        best_score: int = -1
        for idx, score_set in enumerate(score_sets):
            if cid not in memo_sets[idx]:
                continue
            score = score_set.get(cid)
            if not isinstance(score, int):
                continue
            if score > best_score:
                best_score = score
                best_idx = idx
        if best_idx is None:
            skipped += 1
            continue
        picked_memos.append(
            {"custom_id": cid, "memo": memo_sets[best_idx][cid]}
        )
        picked_scores.append({"custom_id": cid, "coherence": best_score})
        pick_counter[labels[best_idx]] += 1

    args.picked_memos.parent.mkdir(parents=True, exist_ok=True)
    with args.picked_memos.open("w", encoding="utf-8") as fh:
        for record in picked_memos:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    args.picked_scores.parent.mkdir(parents=True, exist_ok=True)
    args.picked_scores.write_text(
        json.dumps(picked_scores, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    scores_only = [r["coherence"] for r in picked_scores]
    print(f"[bestofn] picked {len(picked_memos)} memos (skipped {skipped})")
    for label, count in sorted(pick_counter.items()):
        share = count / max(len(picked_memos), 1)
        print(f"  pick_share[{label}]: {count}/{len(picked_memos)} ({share:.1%})")
    if scores_only:
        mean = sum(scores_only) / len(scores_only)
        median = statistics.median(scores_only)
        print(
            f"[bestofn] cached upper-bound mean={mean:.3f} median={median} "
            f"n={len(scores_only)}",
        )
        bucket = Counter(scores_only)
        for k in (1, 2, 3, 4, 5):
            print(f"  score {k}: {bucket.get(k, 0)}")
    print(f"[bestofn] wrote picked memos -> {args.picked_memos}")
    print(f"[bestofn] wrote picked scores -> {args.picked_scores}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
