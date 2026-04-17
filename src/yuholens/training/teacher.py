"""Teacher bootstrap: OpenAI gpt-5-mini generates English memos + preference pairs.

The teacher runs over ``SakanaAI/EDINET-Bench`` train splits and writes
JSONL records for the downstream SFT and ORPO trainers.

Cost-optimised via OpenAI's batch API (50% discount vs real-time) since
bootstrap is not latency-sensitive. OpenAI auto-caches shared system-prompt
prefixes of at least 1024 tokens, so the stable analyst framing across
thousands of Yuho calls further reduces input-token spend on cache hits.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Callable

TEACHER_MODEL = "gpt-5-mini"
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
    """Build an OpenAI batch request and persist its identifiers to ``out_path``.

    Writes the per-row chat-completion requests to ``out_path`` with a
    ``.requests.jsonl`` suffix, uploads that file to OpenAI with
    ``purpose="batch"``, creates the batch job, and finally writes the
    returned ``batch_id`` (plus the uploaded ``input_file_id`` and split
    name) as a single JSON line to ``out_path`` for the poller to consume.

    Args:
        split: EDINET-Bench subset name.
        out_path: Destination JSON file receiving the ``batch_id`` record.
            Its sibling ``.requests.jsonl`` path is used as the uploaded
            request file and is kept on disk for debugging.
        limit: Optional row cap.
    """
    import openai

    client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    requests_path = out_path.with_suffix(".requests.jsonl")

    with requests_path.open("w", encoding="utf-8") as fh:
        for idx, row in enumerate(iter_split(split, limit)):
            req = {
                "custom_id": f"{split}-{idx:05d}",
                "method": "POST",
                "url": "/v1/chat/completions",
                "body": {
                    "model": TEACHER_MODEL,
                    "max_completion_tokens": 2048,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": build_user_prompt(row)},
                    ],
                },
            }
            fh.write(json.dumps(req, ensure_ascii=False) + "\n")

    with requests_path.open("rb") as upload_fh:
        file_obj = client.files.create(file=upload_fh, purpose="batch")
    batch = client.batches.create(
        input_file_id=file_obj.id,
        endpoint="/v1/chat/completions",
        completion_window="24h",
    )
    out_path.write_text(
        json.dumps(
            {"batch_id": batch.id, "input_file_id": file_obj.id, "split": split}
        )
        + "\n"
    )


_CITATION_PATTERN = re.compile(r"\(ref:\s*['\"][^'\"]+['\"]")
_YEN_NUMBER_PATTERN = re.compile(r"¥([\d,]+(?:\.\d+)?)")


def _retry(call: Callable[[], Any], attempts: int = 5) -> Any:
    """Invoke a zero-arg callable with bounded exponential backoff.

    Retries on ``openai.APIError`` / ``openai.APIConnectionError`` when
    available, plus ``Exception`` as a final safety net so transient errors
    from test doubles or unexpected wrappers still recover. Sleeps 1, 2, 4,
    8, 16 seconds between attempts. Re-raises the last exception if every
    attempt fails.

    Args:
        call: Zero-argument callable whose return value is forwarded.
        attempts: Maximum consecutive attempts before re-raising.

    Returns:
        The value returned by ``call`` on its first successful invocation.

    Raises:
        Exception: Whatever ``call`` last raised, once ``attempts`` is
            exhausted.
    """
    retry_exc: tuple[type[BaseException], ...]
    try:
        import openai

        retry_exc = (openai.APIError, openai.APIConnectionError, Exception)
    except Exception:
        retry_exc = (Exception,)

    last_exc: BaseException | None = None
    for attempt in range(attempts):
        try:
            return call()
        except retry_exc as exc:
            last_exc = exc
            if attempt == attempts - 1:
                break
            time.sleep(2 ** attempt)
    assert last_exc is not None
    raise last_exc


def poll_batch(
    batch_id: str,
    client: Any | None = None,
    poll_interval_s: float = 30.0,
    max_wait_s: float = 90_000.0,
) -> list[dict[str, Any]]:
    """Block until an OpenAI batch completes, then return structured results.

    Transient failures in ``batches.retrieve`` or ``files.content`` are
    retried up to five times with exponential backoff (1/2/4/8/16s) so a
    single flaky API call does not abort a multi-hour wait.

    Args:
        batch_id: The OpenAI batch ID returned by ``submit_batch``.
        client: Optional pre-built ``openai.OpenAI`` client, injected for
            tests. When ``None``, a client is constructed lazily from the
            ``OPENAI_API_KEY`` environment variable.
        poll_interval_s: Seconds between status checks.
        max_wait_s: Hard wait cap in seconds, matching OpenAI's 24h SLA plus
            buffer.

    Returns:
        A list of records of the form ``{"custom_id", "memo", "usage",
        "stop_reason"}``. Failed requests include ``memo=None`` and an
        ``"error"`` field.

    Raises:
        TimeoutError: If ``max_wait_s`` elapses before the batch terminates.
        RuntimeError: If the batch ends with ``status`` in
            ``{"failed", "expired", "canceled"}``.
    """
    if client is None:
        import openai

        client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    start = time.monotonic()
    output_file_id: str | None = None
    while True:
        handle = _retry(lambda: client.batches.retrieve(batch_id))
        status = getattr(handle, "status", None)
        if status == "completed":
            output_file_id = getattr(handle, "output_file_id", None)
            break
        if status in {"failed", "expired", "canceled"}:
            raise RuntimeError(f"Batch {batch_id} terminated with status={status!r}")
        if time.monotonic() - start >= max_wait_s:
            raise TimeoutError(
                f"Batch {batch_id} did not complete within {max_wait_s}s"
            )
        time.sleep(poll_interval_s)

    if output_file_id is None:
        raise RuntimeError(
            f"Batch {batch_id} completed without an output_file_id"
        )

    output = _retry(lambda: client.files.content(output_file_id))
    output_text = getattr(output, "text", "") or ""

    records: list[dict[str, Any]] = []
    for line in output_text.splitlines():
        line = line.strip()
        if not line:
            continue
        entry = json.loads(line)
        custom_id = entry.get("custom_id")
        response = entry.get("response")
        error = entry.get("error")

        if response is not None and error is None:
            body = response.get("body", {}) or {}
            choices = body.get("choices", []) or []
            memo = ""
            finish_reason: str | None = None
            if choices:
                first = choices[0] or {}
                message = first.get("message", {}) or {}
                memo = message.get("content", "") or ""
                finish_reason = first.get("finish_reason")
            usage = body.get("usage", {}) or {}
            records.append(
                {
                    "custom_id": custom_id,
                    "memo": memo,
                    "usage": usage,
                    "stop_reason": finish_reason,
                }
            )
        else:
            if isinstance(error, dict):
                message = error.get("message") or error.get("code") or "unknown"
            else:
                message = str(error) if error is not None else "unknown"
            records.append(
                {
                    "custom_id": custom_id,
                    "memo": None,
                    "usage": {},
                    "stop_reason": None,
                    "error": message,
                }
            )
    return records


def write_results_jsonl(
    results: list[dict[str, Any]],
    path: Path,
    *,
    overwrite: bool = False,
) -> int:
    """Persist ``poll_batch`` results to JSONL, one row per dict.

    The file is written in UTF-8 with no BOM. Parent directories are created
    if missing. Existing files are refused unless ``overwrite=True`` so
    bootstrap runs cannot silently clobber prior outputs.

    Args:
        results: The list returned by :func:`poll_batch`.
        path: Destination path.
        overwrite: When False (default), refuse to clobber an existing file.

    Returns:
        The count of rows written.

    Raises:
        FileExistsError: When ``path`` already exists and ``overwrite`` is
            False.
    """
    if path.exists() and not overwrite:
        raise FileExistsError(
            f"{path} already exists; pass overwrite=True to replace"
        )
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
        True if the number of regex matches is at least ``min_citations``.
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


_LANGDETECT_SEEDED = False


def language_gate(memo: str, min_english: float = 0.9) -> bool:
    """Return True iff ``langdetect`` assigns English at least ``min_english`` probability.

    Args:
        memo: The generated memo.
        min_english: Minimum probability assigned to the ``en`` language.

    Returns:
        True iff the ``en`` probability meets the threshold. False on
        ``LangDetectException`` for degenerate inputs.
    """
    global _LANGDETECT_SEEDED
    from langdetect import DetectorFactory, detect_langs
    from langdetect.lang_detect_exception import LangDetectException

    if not _LANGDETECT_SEEDED:
        DetectorFactory.seed = 0
        _LANGDETECT_SEEDED = True

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


_CUSTOM_ID_INDEX_PATTERN = re.compile(r"-(\d+)$")


def poll_and_filter(
    batch_json: Path,
    raw_out: Path,
    filtered_out: Path,
    source_split: str | None = None,
    overwrite: bool = False,
) -> dict[str, int]:
    """Poll a submitted OpenAI batch, persist raw results, and apply quality gates.

    Reads the batch-id JSON produced by :func:`submit_batch`, polls the batch
    to completion via :func:`poll_batch`, writes the raw results to
    ``raw_out``, reconstructs the mapping from ``custom_id`` to the original
    EDINET-Bench source row (needed by the hallucinated-number gate and
    deduplication), applies :func:`filter_memos`, and writes the surviving
    records to ``filtered_out``.

    The ``custom_id`` format emitted by :func:`submit_batch` is
    ``"{split}-{idx:05d}"``, so the trailing integer after the final hyphen is
    parsed as the row index within the original split. ``iter_split`` is
    consumed a single time and only rows whose index appears in the results
    are materialised.

    Args:
        batch_json: Path to the one-line JSON file containing ``batch_id``,
            ``input_file_id``, and ``split``.
        raw_out: Destination JSONL path for the unfiltered poll results.
        filtered_out: Destination JSONL path for the quality-gated subset.
        source_split: Optional override for the split name used to rebuild
            source rows. When omitted, the ``split`` field from the batch JSON
            is used.
        overwrite: Forwarded to :func:`write_results_jsonl` for both output
            files.

    Returns:
        A dict with keys ``polled`` (total poll results), ``raw_written``
        (rows written to ``raw_out``), and ``filtered`` (rows written to
        ``filtered_out``).
    """
    batch_info = json.loads(batch_json.read_text(encoding="utf-8"))
    batch_id = batch_info["batch_id"]
    split = source_split if source_split is not None else batch_info["split"]

    results = poll_batch(batch_id)
    raw_written = write_results_jsonl(results, Path(raw_out), overwrite=overwrite)

    wanted_indices: dict[int, str] = {}
    for record in results:
        custom_id = record.get("custom_id")
        if not isinstance(custom_id, str):
            continue
        match = _CUSTOM_ID_INDEX_PATTERN.search(custom_id)
        if match is None:
            continue
        wanted_indices[int(match.group(1))] = custom_id

    source_rows: dict[str, dict[str, Any]] = {}
    if wanted_indices:
        max_index = max(wanted_indices)
        for idx, row in enumerate(iter_split(split)):
            custom_id = wanted_indices.get(idx)
            if custom_id is not None:
                source_rows[custom_id] = row
            if idx >= max_index:
                break

    filtered = filter_memos(results, source_rows)
    filtered_written = write_results_jsonl(
        filtered, Path(filtered_out), overwrite=overwrite
    )

    polled = len(results)
    retention = (filtered_written / polled * 100.0) if polled else 0.0
    print(
        f"polled={polled} raw={raw_written} filtered={filtered_written} "
        f"retention={retention:.1f}%"
    )

    return {
        "polled": polled,
        "raw_written": raw_written,
        "filtered": filtered_written,
    }


def main() -> None:
    """Entry point: dispatch to the ``submit`` or ``poll-and-filter`` subcommand."""
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="cmd", required=True)

    submit_parser = subparsers.add_parser(
        "submit", help="Build and submit an OpenAI batch for a split."
    )
    submit_parser.add_argument("--split", required=True)
    submit_parser.add_argument("--out", type=Path, required=True)
    submit_parser.add_argument("--limit", type=int, default=None)

    poll_parser = subparsers.add_parser(
        "poll-and-filter",
        help="Poll a submitted batch and apply quality-gate filters.",
    )
    poll_parser.add_argument("--batch-json", type=Path, required=True)
    poll_parser.add_argument("--raw-out", type=Path, required=True)
    poll_parser.add_argument("--filtered-out", type=Path, required=True)
    poll_parser.add_argument("--source-split", default=None)
    poll_parser.add_argument("--overwrite", action="store_true")

    args = parser.parse_args()

    if args.cmd == "submit":
        submit_batch(args.split, args.out, args.limit)
    elif args.cmd == "poll-and-filter":
        poll_and_filter(
            args.batch_json,
            args.raw_out,
            args.filtered_out,
            source_split=args.source_split,
            overwrite=args.overwrite,
        )


if __name__ == "__main__":
    main()
