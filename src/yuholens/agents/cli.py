"""Operator CLI for the YuhoLens 4-agent LangGraph composer.

This is the demo-day entry point. It loads a Yuho row, runs the full
LangGraph (Ingestor → Pass-1 → Pass-2 / MemoCriticAgent → Citation
Grounder), and prints the final memo plus per-candidate diagnostics
when ``--best-of-n`` is set.

Usage:
    python -m yuholens.agents \
        --yuho-path data/eval/sample_yuho.txt \
        --best-of-n \
        --judge-mode auto

The CLI is deliberately a thin wrapper around
:func:`yuholens.agents.graph.build_pipeline` so it cannot drift away
from the library API: anything the library can do, the CLI exposes via
flags.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from yuholens.agents.graph import build_pipeline


def _read_yuho_row(yuho_row_path: Path, row_index: int) -> dict[str, Any]:
    """Load a Yuho row from a JSONL test file.

    Args:
        yuho_row_path: Path to an EDINET-Bench-style JSONL with one Yuho per row.
        row_index: 0-based row index to load.

    Returns:
        The decoded JSON object for the requested row.

    Raises:
        IndexError: If ``row_index`` is out of range.
    """
    with yuho_row_path.open("r", encoding="utf-8") as fh:
        for cursor, line in enumerate(fh):
            if cursor == row_index:
                return json.loads(line)
    raise IndexError(f"row {row_index} not found in {yuho_row_path}")


def _build_initial_state(args: argparse.Namespace) -> dict[str, Any]:
    """Map CLI args + optional row JSONL into the initial pipeline state.

    Args:
        args: Parsed CLI namespace.

    Returns:
        A pipeline-state dict with the keys the graph expects to find on
        invocation.
    """
    if args.yuho_row is not None:
        row = _read_yuho_row(args.yuho_row, args.row_index)
        state: dict[str, Any] = {
            "yuho_path": str(args.yuho_path) if args.yuho_path else "row.txt",
            "edinet_code": row.get("edinet_code", args.edinet_code or ""),
            "fiscal_year": row.get("fiscal_year", args.fiscal_year or 2024),
            "company_name_jp": row.get("company_name_jp", args.company_name_jp or ""),
            "company_name_en": row.get("company_name_en", args.company_name_en or ""),
        }
        if "raw_tables" in row:
            state["raw_tables"] = row["raw_tables"]
    else:
        if args.yuho_path is None:
            raise SystemExit("--yuho-path is required when --yuho-row is not set")
        state = {
            "yuho_path": str(args.yuho_path),
            "edinet_code": args.edinet_code or "",
            "fiscal_year": args.fiscal_year or 2024,
            "company_name_jp": args.company_name_jp or "",
            "company_name_en": args.company_name_en or "",
        }
    return state


def _print_diagnostics(result: dict[str, Any]) -> None:
    """Print per-candidate diagnostics when best-of-N is active."""
    if "candidate_scores" not in result:
        return
    print("\n[memo-critic] candidate breakdown:")
    profiles = result.get("candidate_profiles", [])
    scores = result.get("candidate_scores", [])
    picked = result.get("picked_index")
    for idx, (name, score) in enumerate(zip(profiles, scores)):
        marker = "  <- picked" if idx == picked else ""
        print(f"  [{idx}] profile={name} score={score:.3f}{marker}")
    if "judge_fallback_reason" in result:
        print(f"[memo-critic] judge fallback: {result['judge_fallback_reason']}")
    print(f"[memo-critic] judge_mode={result.get('judge_mode', 'n/a')}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--yuho-path",
        type=Path,
        default=None,
        help="Path to a plain-text Yuho file (used by the default text loader).",
    )
    parser.add_argument(
        "--yuho-row",
        type=Path,
        default=None,
        help="Optional EDINET-Bench JSONL file; combined with --row-index.",
    )
    parser.add_argument("--row-index", type=int, default=0)
    parser.add_argument("--edinet-code", type=str, default=None)
    parser.add_argument("--fiscal-year", type=int, default=None)
    parser.add_argument("--company-name-jp", type=str, default=None)
    parser.add_argument("--company-name-en", type=str, default=None)
    parser.add_argument(
        "--best-of-n",
        action="store_true",
        help="Enable the MemoCriticAgent best-of-N composer.",
    )
    parser.add_argument(
        "--n-candidates",
        type=int,
        default=None,
        help=(
            "Truncate DEFAULT_PROFILES to this many candidates when "
            "--best-of-n is set."
        ),
    )
    parser.add_argument(
        "--judge-mode",
        choices=("auto", "judge", "heuristic"),
        default="auto",
        help="Coherence scorer; 'auto' probes the OpenAI key.",
    )
    parser.add_argument(
        "--require-tables",
        action="store_true",
        help="Force the BS/PL/CF gate even with the default text loader.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Optional JSON path; writes the full result dict.",
    )
    parser.add_argument(
        "--print-memo",
        action="store_true",
        help="Print the grounded memo to stdout (default if --out is unset).",
    )
    args = parser.parse_args(argv)

    require_tables_kw: bool | None
    require_tables_kw = True if args.require_tables else None

    app = build_pipeline(
        best_of_n=args.best_of_n,
        n_candidates=args.n_candidates,
        judge_mode=args.judge_mode,
        require_tables=require_tables_kw,
    )

    initial_state = _build_initial_state(args)
    result: dict[str, Any] = app.invoke(initial_state)

    _print_diagnostics(result)

    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(result, ensure_ascii=False, indent=2, default=str) + "\n",
            encoding="utf-8",
        )
        print(f"[cli] wrote result -> {args.out}")

    if args.print_memo or args.out is None:
        print("\n=== Grounded memo ===\n")
        print(result.get("grounded_memo", "<no memo>"))
        if result.get("orphan_spans"):
            print("\n[cli] orphan spans (citations without grounded source):")
            for span in result["orphan_spans"]:
                print(f"  - {span}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
