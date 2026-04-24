"""Rescore an existing KG-2 memos JSONL locally.

Used when `run_kg2.py` finished generation on the droplet but crashed in the
metric stage (e.g. bad OPENAI_API_KEY). Replays citation, section coverage,
and judge coherence against a memos file and prints the same verdict block
as `run_kg2.py`.

Usage:
    python scripts/rescore_kg2.py \
        --memos data/eval/kg2_memos.jsonl \
        --out data/eval/kg2_scores.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--memos", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--judge-model", default="gpt-5-mini")
    parser.add_argument("--judge-parse-min", type=float, default=0.9)
    parser.add_argument("--env", type=Path, default=Path(".env"))
    args = parser.parse_args()

    _load_dotenv(args.env)
    repo_src = Path(__file__).resolve().parents[1] / "src"
    if str(repo_src) not in sys.path:
        sys.path.insert(0, str(repo_src))

    from yuholens.eval.metrics import (
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
