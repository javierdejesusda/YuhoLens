"""Offline best-of-N picker over cached memo JSONL sets.

This script is the no-API counterpart to ``scripts/bestofn_judge.py``. It
loads N candidate memo sets and picks the highest-scoring memo per
``custom_id`` using only the laptop-local heuristic from
:func:`yuholens.agents.memo_critic.heuristic_score` — no OpenAI calls,
no GPU, no network. The intended use cases are:

    * Reproducing the best-of-N pick distribution on a flight or any
      offline laptop without burning batch credits.
    * Comparing the heuristic pick distribution against the cached judge
      pick distribution to validate the heuristic-vs-judge agreement
      claim made in ``docs/blog_post.md`` and ``docs/model-card.md``.
    * Smoke-testing the picker contract during development before
      shipping a fresh judge pass.

Output schema mirrors ``scripts/bestofn_pick.py`` so the picked artefacts
drop into the same downstream rescore tooling. The script also emits a
pick-share summary and the heuristic mean per source set.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import Counter
from pathlib import Path
from typing import Any


def _ensure_yuholens_on_path() -> None:
    """Insert ``src/`` into ``sys.path`` so the script runs without ``-m``."""
    repo_src = Path(__file__).resolve().parents[1] / "src"
    if str(repo_src) not in sys.path:
        sys.path.insert(0, str(repo_src))


_ensure_yuholens_on_path()

from yuholens.agents.memo_critic import heuristic_score  # noqa: E402


def _load_memos(path: Path) -> dict[str, str]:
    """Load a candidate memo JSONL file as a ``custom_id -> memo`` map.

    Args:
        path: Path to a candidate memo JSONL with ``{"custom_id", "memo"}``
            rows.

    Returns:
        Mapping keyed by ``custom_id``. Rows missing either field are
        skipped silently because best-of-N is robust to partial sets.
    """
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--memos",
        type=Path,
        nargs="+",
        required=True,
        help="Candidate memos JSONL files, in priority order (ties go to first).",
    )
    parser.add_argument("--picked-memos", type=Path, required=True)
    parser.add_argument("--picked-scores", type=Path, required=True)
    parser.add_argument(
        "--labels",
        type=str,
        nargs="+",
        default=None,
        help="Human-readable labels per input set; defaults to file stems.",
    )
    args = parser.parse_args()

    labels = args.labels or [p.stem for p in args.memos]
    if len(labels) != len(args.memos):
        raise SystemExit("--labels length must match --memos")

    memo_sets: list[dict[str, str]] = [_load_memos(path) for path in args.memos]
    if not any(memo_sets):
        raise SystemExit("no memos loaded from any --memos input")

    cids: list[str] = sorted(set().union(*[set(m.keys()) for m in memo_sets]))
    picked_memos: list[dict[str, Any]] = []
    picked_scores: list[dict[str, Any]] = []
    pick_counter: Counter[str] = Counter()
    per_source_scores: dict[str, list[float]] = {label: [] for label in labels}
    skipped = 0

    for cid in cids:
        best_idx: int | None = None
        best_score = float("-inf")
        for idx, memo_set in enumerate(memo_sets):
            memo = memo_set.get(cid)
            if memo is None:
                continue
            score = heuristic_score(memo)
            per_source_scores[labels[idx]].append(score)
            if score > best_score:
                best_idx = idx
                best_score = score
        if best_idx is None:
            skipped += 1
            continue
        picked_memos.append(
            {"custom_id": cid, "memo": memo_sets[best_idx][cid]}
        )
        picked_scores.append(
            {
                "custom_id": cid,
                "heuristic_score": round(best_score, 4),
                "source": labels[best_idx],
            }
        )
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

    print(
        f"[bestofn-offline] picked {len(picked_memos)} memos "
        f"(skipped {skipped})"
    )
    for label, count in sorted(pick_counter.items()):
        share = count / max(len(picked_memos), 1)
        scores = per_source_scores[label]
        if scores:
            mean = statistics.fmean(scores)
            print(
                f"  pick_share[{label}]: {count}/{len(picked_memos)} "
                f"({share:.1%})  source_mean_heuristic={mean:.3f}"
            )
        else:
            print(f"  pick_share[{label}]: {count}/{len(picked_memos)} ({share:.1%})")
    if picked_scores:
        all_picks = [r["heuristic_score"] for r in picked_scores]
        print(
            f"[bestofn-offline] picked_mean_heuristic="
            f"{statistics.fmean(all_picks):.3f} "
            f"median={statistics.median(all_picks):.3f} "
            f"n={len(all_picks)}"
        )
    print(f"[bestofn-offline] wrote picked memos -> {args.picked_memos}")
    print(f"[bestofn-offline] wrote picked scores -> {args.picked_scores}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
