"""Phase F dry-run: exercise the LangGraph pipeline end-to-end via OpenAI.

The production Pass-1/Pass-2 backend is vLLM-ROCm serving the fine-tuned
``yuholens/yuholens-14b`` model. That server is only live once Phase D
has finished on the MI300X. This script swaps in ``gpt-5-mini`` through
a lightweight :class:`InferenceClient` so the graph's JSON-parsing,
ingestor-section-split, and citation-grounder paths can be validated
before the real checkpoint exists.

The dry-run pulls two rows out of EDINET-Bench's *test* splits (strictly
out-of-distribution vs the SFT training set), feeds them through
``build_pipeline(loader=row_loader)``, and prints the grounded memo,
the orphan-span count, and any JSON parse errors. A clean run proves
that every node wires up correctly: ingestor → Pass-1 → Pass-2 →
Grounder, plus the BS/PL/CF table plumbing.

Use this whenever graph code or prompts change — it's the cheapest
smoke test for pipeline regressions that pytest does not catch.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from yuholens.agents.graph import InferenceClient, build_pipeline


class OpenAIClient:
    """InferenceClient backed by ``gpt-5-mini`` for pipeline smoke tests.

    Attributes:
        model: OpenAI model identifier; defaults to ``gpt-5-mini``.
        reasoning_effort: Passed to the API; ``"minimal"`` keeps reasoning
            tokens near zero so ``max_tokens`` goes to the actual response.
    """

    def __init__(
        self,
        *,
        model: str = "gpt-5-mini",
        reasoning_effort: str = "minimal",
    ) -> None:
        self.model = model
        self.reasoning_effort = reasoning_effort
        import openai

        self._client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    def complete(self, *, system: str, user: str, max_tokens: int = 2048) -> str:
        """Run one chat completion; returns the content string."""
        resp = self._client.chat.completions.create(
            model=self.model,
            max_completion_tokens=max_tokens,
            reasoning_effort=self.reasoning_effort,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return resp.choices[0].message.content or ""


def make_row_loader(rows: dict[str, dict[str, Any]]):
    """Return a ``Loader`` that maps ``state['yuho_path']`` to a materialised row.

    The LangGraph ingestor treats ``yuho_path`` as opaque. For the dry-run we
    map it to a dictionary key that looks up the full EDINET-Bench row,
    extracting ``text`` and parsed BS/PL/CF tables so Pass-2's
    ``require_tables`` gate can be exercised.

    Args:
        rows: Mapping from synthetic path string to the EDINET-Bench row.

    Returns:
        A loader ``(path) -> (text, raw_tables)`` suitable for
        :func:`yuholens.agents.graph.build_pipeline`.
    """

    def _loader(path: str) -> tuple[str, dict[str, Any]]:
        row = rows[path]
        text = row.get("text") or ""
        tables = {}
        for key in ("bs", "pl", "cf"):
            value = row.get(key)
            if value is None:
                continue
            if isinstance(value, str):
                try:
                    tables[key] = json.loads(value)
                except json.JSONDecodeError:
                    tables[key] = value
            else:
                tables[key] = value
        return text, tables

    return _loader


def run_one(app: Any, path: str, label: str) -> None:
    """Invoke the compiled graph and print a short diagnostic."""
    print(f"\n=== {label} ===")
    state: dict[str, Any] = {"yuho_path": path}
    result = app.invoke(state)
    memo = result.get("grounded_memo", "") or ""
    orphans = result.get("orphan_spans", []) or []
    pass1 = result.get("pass1", {}) or {}
    parse_errors = [
        (k, v["_parse_error"]) for k, v in pass1.items() if "_parse_error" in v
    ]
    words = len(memo.split())
    print(f"sections_parsed={len(pass1)} pass1_errors={len(parse_errors)}")
    print(f"grounded_memo_words={words} orphan_spans={len(orphans)}")
    if parse_errors:
        for k, err in parse_errors[:3]:
            print(f"  pass1_err[{k}]: {err[:180]}")
    if orphans:
        for span in orphans[:3]:
            print(f"  orphan: {span[:120]}")
    print("--- memo prefix (500 chars) ---")
    print(memo[:500])


def main() -> None:
    """Pull N test rows per split and exercise the pipeline on each."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--n-per-split",
        type=int,
        default=1,
        help="Rows to draw per EDINET-Bench test split.",
    )
    parser.add_argument(
        "--splits",
        nargs="+",
        default=["industry_prediction", "earnings_forecast", "fraud_detection"],
        help="EDINET-Bench subset names whose test split to sample from.",
    )
    args = parser.parse_args()

    from datasets import load_dataset

    synthetic_rows: dict[str, dict[str, Any]] = {}
    order: list[tuple[str, str]] = []
    for split in args.splits:
        ds = load_dataset("SakanaAI/EDINET-Bench", split, split="test")
        for idx in range(args.n_per_split):
            row = ds[idx]
            path = f"mem://{split}/{idx:04d}"
            synthetic_rows[path] = row
            order.append((path, f"{split}#{idx:04d}"))

    client = OpenAIClient()
    loader = make_row_loader(synthetic_rows)
    app = build_pipeline(
        client=client, loader=loader, pass1_strict=False, require_tables=True
    )

    for path, label in order:
        run_one(app, path, label)


if __name__ == "__main__":
    main()
