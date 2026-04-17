"""Teacher bootstrap: Claude Sonnet 4.6 generates English memos + preference pairs.

The teacher runs over ``SakanaAI/EDINET-Bench`` train splits and writes
JSONL records for the downstream SFT and ORPO trainers.

Cost-optimised via Anthropic's batch API (50% discount vs real-time) since
bootstrap is not latency-sensitive. A system-prompt cache block carries
shared framing across thousands of Yuho calls to further reduce input-token
spend on cache hits.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

TEACHER_MODEL = "claude-sonnet-4-6"
SYSTEM_PROMPT = """You are a senior English-speaking Japan-equity analyst
drafting a two-page investor memo for a non-Japanese-speaking portfolio
manager. The source is a Japanese 有価証券報告書 (annual securities report).
Produce factually grounded memos with direct Japanese-span citations. Never
speculate beyond the text. If the source lacks information for a section,
write "not disclosed" explicitly.

Output structure:
1. Executive summary (3-5 sentences)
2. Going-concern assessment
3. Accrual quality (DSO change, inventory days, receivables aging)
4. Earnings direction call (up / down / flat) with reasoning
5. Top 3 risks cited from 事業等のリスク
6. Related-party transactions summary (from 関連当事者との取引 if present)
7. Evidence appendix — bulleted citations of Japanese spans with English
   translations

Hard rules:
- Every material claim references a Japanese span via inline parenthetical:
  "(ref: '売上高は前年同期比42%減少' p.X)".
- Numerical values stated in ¥ million unless source is ¥ billion explicitly.
- No speculation beyond the source text.
"""


def build_user_prompt(row: dict[str, Any]) -> str:
    """Assemble the per-row user message sent to the teacher.

    Args:
        row: A row from ``SakanaAI/EDINET-Bench`` with ``meta``, ``bs``,
            ``pl``, ``cf``, ``text``, and optionally ``explanation``.

    Returns:
        A formatted markdown string ready to be sent as the user turn.
    """
    meta = row.get("meta", "{}")
    text = (row.get("text") or "")[:20000]
    explanation = row.get("explanation") or ""
    extra = (
        f"\nAvailable Japanese fraud/risk explanation (LLM-generated):\n{explanation}"
        if explanation
        else ""
    )

    return (
        f"Company metadata (JSON):\n{meta}\n\n"
        f"Balance sheet (JSON):\n{row.get('bs', '{}')}\n\n"
        f"P&L (JSON):\n{row.get('pl', '{}')}\n\n"
        f"Cash flow (JSON):\n{row.get('cf', '{}')}\n\n"
        f"Japanese annual-report text (truncated at ~20K chars):\n<<<\n{text}\n>>>\n"
        f"{extra}\n\n"
        "Produce the two-page English investor memo now."
    )


def iter_split(split: str, limit: int | None = None) -> Any:
    """Yield rows from an EDINET-Bench subset's train split.

    Args:
        split: One of ``fraud_detection``, ``earnings_forecast``,
            ``industry_prediction``.
        limit: Optional row cap, useful for smoke runs.

    Yields:
        Dataset rows as dictionaries.
    """
    from datasets import load_dataset

    ds = load_dataset("SakanaAI/EDINET-Bench", split, split="train")
    for idx, row in enumerate(ds):
        if limit is not None and idx >= limit:
            return
        yield row


def submit_batch(split: str, out_path: Path, limit: int | None) -> None:
    """Build an Anthropic batch request and persist it to ``out_path``.

    Args:
        split: EDINET-Bench subset name.
        out_path: Destination JSONL path.
        limit: Optional row cap.
    """
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    requests: list[Any] = []
    for idx, row in enumerate(iter_split(split, limit)):
        requests.append(
            anthropic.types.messages.batch_create_params.Request(
                custom_id=f"{split}-{idx:05d}",
                params={
                    "model": TEACHER_MODEL,
                    "max_tokens": 2048,
                    "system": [
                        {
                            "type": "text",
                            "text": SYSTEM_PROMPT,
                            "cache_control": {"type": "ephemeral"},
                        }
                    ],
                    "messages": [
                        {"role": "user", "content": build_user_prompt(row)}
                    ],
                },
            )
        )

    batch = client.messages.batches.create(requests=requests)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"batch_id": batch.id, "split": split}) + "\n")


def main() -> None:
    """Entry point: build and submit a batch request for the chosen split."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    submit_batch(args.split, args.out, args.limit)


if __name__ == "__main__":
    main()
