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
import hashlib
import json
import os
import re
import time
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


_CITATION_PATTERN = re.compile(r"\(ref:\s*['\"][^'\"]+['\"]")
_YEN_NUMBER_PATTERN = re.compile(r"¥([\d,]+(?:\.\d+)?)")


def poll_batch(
    batch_id: str,
    client: Any | None = None,
    poll_interval_s: float = 30.0,
    max_wait_s: float = 90_000.0,
) -> list[dict[str, Any]]:
    """Block until an Anthropic batch completes, then return structured results.

    Args:
        batch_id: The Anthropic batch ID returned by ``submit_batch``.
        client: Optional pre-built ``anthropic.Anthropic`` client, injected for
            tests. When ``None``, a client is constructed lazily from the
            ``ANTHROPIC_API_KEY`` environment variable.
        poll_interval_s: Seconds between status checks.
        max_wait_s: Hard wait cap in seconds, matching Anthropic's 24h SLA plus
            buffer.

    Returns:
        A list of records of the form ``{"custom_id", "memo", "usage",
        "stop_reason"}``. Failed requests include ``memo=None`` and an
        ``"error"`` field.

    Raises:
        TimeoutError: If ``max_wait_s`` elapses before the batch terminates.
        RuntimeError: If the batch ends with ``processing_status`` in
            ``{"canceled", "expired"}``.
    """
    if client is None:
        import anthropic

        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    elapsed = 0.0
    while True:
        handle = client.messages.batches.retrieve(batch_id)
        status = getattr(handle, "processing_status", None)
        if status == "ended":
            break
        if status in {"canceled", "expired"}:
            raise RuntimeError(f"Batch {batch_id} terminated with status={status!r}")
        if elapsed >= max_wait_s:
            raise TimeoutError(
                f"Batch {batch_id} did not end within {max_wait_s} seconds"
            )
        time.sleep(poll_interval_s)
        elapsed += poll_interval_s

    records: list[dict[str, Any]] = []
    for entry in client.messages.batches.results(batch_id):
        custom_id = getattr(entry, "custom_id", None)
        result = getattr(entry, "result", None)
        result_type = getattr(result, "type", None)

        if result_type == "succeeded":
            message = getattr(result, "message", None)
            content = getattr(message, "content", []) or []
            text = ""
            for block in content:
                if getattr(block, "type", None) == "text":
                    text = getattr(block, "text", "") or ""
                    break
            records.append(
                {
                    "custom_id": custom_id,
                    "memo": text,
                    "usage": getattr(message, "usage", {}) or {},
                    "stop_reason": getattr(message, "stop_reason", None),
                }
            )
        else:
            error = getattr(result, "error", None)
            records.append(
                {
                    "custom_id": custom_id,
                    "memo": None,
                    "usage": {},
                    "stop_reason": None,
                    "error": str(error) if error is not None else result_type or "unknown",
                }
            )
    return records


def write_results_jsonl(results: list[dict[str, Any]], path: Path) -> int:
    """Persist ``poll_batch`` results to JSONL, one row per dict.

    The file is written in UTF-8 with no BOM. Parent directories are created
    if missing.

    Args:
        results: The list returned by :func:`poll_batch`.
        path: Destination path.

    Returns:
        The count of rows written.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        count = 0
        for row in results:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
            count += 1
    return count


def dedup_hash(row: dict[str, Any]) -> str:
    """Return a SHA-256 hex digest of the row's source text prefix.

    The first 1024 characters of ``row["text"]`` (after stripping whitespace)
    are hashed. Missing text is treated as an empty string.

    Args:
        row: An EDINET-Bench row (or any dict with a ``text`` key).

    Returns:
        The hex digest as a lowercase string.
    """
    text = (row.get("text") or "")[:1024].strip()
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def citation_gate(memo: str, min_citations: int = 3) -> bool:
    """Return True iff the memo contains enough inline span citations.

    Args:
        memo: The generated English memo.
        min_citations: Minimum required number of ``(ref: '...')`` matches.

    Returns:
        True if the number of distinct regex matches is at least
        ``min_citations``.
    """
    matches = _CITATION_PATTERN.findall(memo)
    return len(matches) >= min_citations


def hallucinated_number_gate(memo: str, row: dict[str, Any]) -> bool:
    """Return True iff every ``¥<number>`` in the memo is grounded in the row.

    Numbers are normalised by stripping commas (decimals preserved). Each
    normalised number must appear as a substring in one of ``text``, ``bs``,
    ``pl``, or ``cf``. Non-string sources are serialised via ``json.dumps``.
    When the memo has no ``¥`` tokens the gate trivially passes.

    Args:
        memo: The generated English memo.
        row: The original EDINET-Bench source row.

    Returns:
        True iff every yen-denominated number is found in the source row.
    """
    numbers = _YEN_NUMBER_PATTERN.findall(memo)
    if not numbers:
        return True

    haystacks: list[str] = []
    text = row.get("text") or ""
    haystacks.append(text.replace(",", ""))
    for key in ("bs", "pl", "cf"):
        value = row.get(key)
        if value is None:
            continue
        rendered = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        haystacks.append(rendered.replace(",", ""))

    for raw_number in numbers:
        normalised = raw_number.replace(",", "")
        if not any(normalised in haystack for haystack in haystacks):
            return False
    return True


def length_gate(memo: str, min_tokens: int = 800, max_tokens: int = 2200) -> bool:
    """Return True iff the memo's word count falls in ``[min_tokens, max_tokens]``.

    Uses ``len(memo.split())`` as a coarse proxy. A real tokenizer is deferred
    because tiktoken adds a heavy dependency for marginal accuracy.

    Args:
        memo: The generated English memo.
        min_tokens: Inclusive lower bound on word count.
        max_tokens: Inclusive upper bound on word count.

    Returns:
        True iff the memo's whitespace-split word count lies within bounds.
    """
    words = len(memo.split())
    return min_tokens <= words <= max_tokens


def language_gate(memo: str, min_english: float = 0.9) -> bool:
    """Return True iff ``langdetect`` assigns English at least ``min_english`` probability.

    Args:
        memo: The generated memo.
        min_english: Minimum probability assigned to the ``en`` language.

    Returns:
        True iff the ``en`` probability meets the threshold. False on
        ``LangDetectException`` for degenerate inputs.
    """
    from langdetect import DetectorFactory, detect_langs
    from langdetect.lang_detect_exception import LangDetectException

    DetectorFactory.seed = 0
    try:
        detections = detect_langs(memo)
    except LangDetectException:
        return False

    for lang in detections:
        if getattr(lang, "lang", None) == "en":
            return float(getattr(lang, "prob", 0.0)) >= min_english
    return False


def filter_memos(
    results: list[dict[str, Any]],
    source_rows: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Apply the five quality gates and deduplication to batch results.

    Each gate short-circuits fast-reject. Results without a matching source
    row are dropped. Duplicates are detected via :func:`dedup_hash` on the
    source row, keeping the first occurrence.

    Args:
        results: Output of :func:`poll_batch`.
        source_rows: Mapping from ``custom_id`` to the original EDINET-Bench
            row used by the hallucinated-number gate and deduplication.

    Returns:
        The subset of results that pass every gate, each augmented with a
        ``dedup_key`` field.
    """
    survivors: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in results:
        memo = row.get("memo")
        if memo is None:
            continue

        custom_id = row.get("custom_id")
        source = source_rows.get(custom_id) if custom_id is not None else None
        if source is None:
            continue

        if not citation_gate(memo):
            continue
        if not length_gate(memo):
            continue
        if not hallucinated_number_gate(memo, source):
            continue
        if not language_gate(memo):
            continue

        key = dedup_hash(source)
        if key in seen:
            continue
        seen.add(key)

        enriched = dict(row)
        enriched["dedup_key"] = key
        survivors.append(enriched)
    return survivors


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
