"""Phase C augmentation: re-run the 3 EDINET-Bench splits with alt prompt.

The v1 pass produced 1,603 filtered SFT pairs, under the KG 1 ≥2,700
threshold. This orchestrator runs a second teacher pass over the same
sources with ``SYSTEM_PROMPT_ALT`` (short-biased red-flag memo) and a
``_v2`` ``custom_id`` prefix so the manifests do not collide with v1.

Each v2 split is submitted serially to respect the org's 5M enqueued
token cap, with auto-split on ``token_limit_exceeded``. Filtering uses
``dedup=False`` so v2 memos survive alongside their v1 siblings. The
final ``data/teacher/sft.jsonl`` merges every v1 ``*_filtered.jsonl``
that already exists with every v2 ``*_filtered.jsonl`` this run produces.

Progress lines print to stdout with a ``[augment]`` prefix so a Monitor
watch can surface state transitions as events.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

import openai

from yuholens.training.teacher import (
    SYSTEM_PROMPT_ALT,
    poll_and_filter,
    submit_batch,
)

DATA_DIR = Path("data/teacher")
POLL_INTERVAL_S = 60.0
MAX_WAIT_S = 90_000.0

V1_FILTERED_STEMS: list[str] = [
    "batch_industry",
    "batch_fraud_part0",
    "batch_fraud_part1",
    "batch_earnings",
]

V2_SPLITS: list[tuple[str, str, str]] = [
    ("industry_prediction", "batch_industry_v2", "industry_prediction_v2"),
    ("fraud_detection", "batch_fraud_v2", "fraud_detection_v2"),
    ("earnings_forecast", "batch_earnings_v2", "earnings_forecast_v2"),
]


def log(msg: str) -> None:
    """Emit a timestamped progress line to stdout."""
    sys.stdout.write(f"[augment] {time.strftime('%H:%M:%S')} {msg}\n")
    sys.stdout.flush()


def client_() -> Any:
    """Return a fresh OpenAI client bound to OPENAI_API_KEY."""
    return openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def wait_for(batch_id: str, label: str) -> tuple[str, Any]:
    """Poll a batch until terminal.

    Returns:
        (status, batch_handle).
    """
    c = client_()
    start = time.monotonic()
    last_completed = -1
    while True:
        b = c.batches.retrieve(batch_id)
        status = b.status
        rc = b.request_counts
        completed = getattr(rc, "completed", 0)
        total = getattr(rc, "total", 0)
        failed = getattr(rc, "failed", 0)
        if completed != last_completed or status not in {"in_progress", "validating"}:
            log(f"{label} status={status} {completed}/{total} failed={failed}")
            last_completed = completed
        if status in {"completed", "failed", "expired", "canceled"}:
            return status, b
        if time.monotonic() - start >= MAX_WAIT_S:
            raise TimeoutError(f"{label} did not terminate in {MAX_WAIT_S}s")
        time.sleep(POLL_INTERVAL_S)


def is_token_limit_error(batch_handle: Any) -> bool:
    """Detect the enqueued-token-cap rejection on a failed batch handle."""
    errors = getattr(batch_handle, "errors", None)
    if errors is None:
        return False
    for err in getattr(errors, "data", None) or []:
        code = getattr(err, "code", None) or ""
        msg = (getattr(err, "message", None) or "").lower()
        if code == "token_limit_exceeded" or "enqueued token limit" in msg:
            return True
    return False


def filter_existing(stem: str) -> dict[str, int]:
    """Poll + filter a completed batch with dedup disabled."""
    result = poll_and_filter(
        DATA_DIR / f"{stem}.json",
        DATA_DIR / f"{stem}_raw.jsonl",
        DATA_DIR / f"{stem}_filtered.jsonl",
        overwrite=True,
        dedup=False,
    )
    log(
        f"filtered {stem} polled={result['polled']} "
        f"raw={result['raw_written']} filtered={result['filtered']}"
    )
    return result


def split_requests(stem: str, pieces: int) -> list[str]:
    """Slice a stem's requests+manifest into ``pieces`` parts, upload each."""
    src_json = DATA_DIR / f"{stem}.json"
    src_requests = DATA_DIR / f"{stem}.requests.jsonl"
    src_manifest = DATA_DIR / f"{stem}.source_rows.jsonl"
    info = json.loads(src_json.read_text(encoding="utf-8"))
    split_name = info["split"]

    request_lines = src_requests.read_text(encoding="utf-8").splitlines()
    manifest_lines = src_manifest.read_text(encoding="utf-8").splitlines()
    if len(request_lines) != len(manifest_lines):
        raise RuntimeError(
            f"row mismatch: requests={len(request_lines)} "
            f"manifest={len(manifest_lines)}"
        )

    chunk = (len(request_lines) + pieces - 1) // pieces
    stems: list[str] = []
    c = client_()
    for k in range(pieces):
        start = k * chunk
        end = min(start + chunk, len(request_lines))
        if start >= end:
            break
        part_stem = f"{stem}_part{k}"
        part_requests = DATA_DIR / f"{part_stem}.requests.jsonl"
        part_manifest = DATA_DIR / f"{part_stem}.source_rows.jsonl"
        part_json = DATA_DIR / f"{part_stem}.json"

        part_requests.write_text(
            "\n".join(request_lines[start:end]) + "\n", encoding="utf-8"
        )
        part_manifest.write_text(
            "\n".join(manifest_lines[start:end]) + "\n", encoding="utf-8"
        )

        with part_requests.open("rb") as fh:
            up = c.files.create(file=fh, purpose="batch")
        part_json.write_text(
            json.dumps(
                {"batch_id": None, "input_file_id": up.id, "split": split_name}
            )
            + "\n",
            encoding="utf-8",
        )
        log(f"split {part_stem} rows={end - start} file_id={up.id}")
        stems.append(part_stem)
    return stems


def submit_part(part_stem: str) -> Any:
    """Submit a previously-uploaded split part. Returns the batch handle."""
    part_json = DATA_DIR / f"{part_stem}.json"
    info = json.loads(part_json.read_text(encoding="utf-8"))
    c = client_()
    batch = c.batches.create(
        input_file_id=info["input_file_id"],
        endpoint="/v1/chat/completions",
        completion_window="24h",
    )
    info["batch_id"] = batch.id
    part_json.write_text(json.dumps(info) + "\n", encoding="utf-8")
    log(f"{part_stem} submitted batch_id={batch.id}")
    return batch


def run_split(split_name: str, stem: str, custom_id_prefix: str) -> list[str]:
    """Submit one split with alt prompt; on token-limit failure, halve and retry.

    Returns:
        List of stems whose ``{stem}_filtered.jsonl`` was written.
    """
    log(f"submit_batch {stem} split={split_name} prefix={custom_id_prefix}")
    submit_batch(
        split_name,
        DATA_DIR / f"{stem}.json",
        limit=None,
        system_prompt=SYSTEM_PROMPT_ALT,
        custom_id_prefix=custom_id_prefix,
    )
    info = json.loads((DATA_DIR / f"{stem}.json").read_text(encoding="utf-8"))
    status, handle = wait_for(info["batch_id"], stem)

    if status == "completed":
        filter_existing(stem)
        return [stem]

    if status == "failed" and is_token_limit_error(handle):
        log(f"{stem} failed with token_limit_exceeded; splitting in halves")
        parts = split_requests(stem, pieces=2)
        finished: list[str] = []
        pending: list[str] = list(parts)
        while pending:
            still_blocked: list[str] = []
            for part_stem in pending:
                submit_part(part_stem)
                part_info = json.loads(
                    (DATA_DIR / f"{part_stem}.json").read_text(encoding="utf-8")
                )
                part_status, part_handle = wait_for(part_info["batch_id"], part_stem)
                if part_status == "completed":
                    filter_existing(part_stem)
                    finished.append(part_stem)
                elif part_status == "failed" and is_token_limit_error(part_handle):
                    log(f"{part_stem} still over cap; will retry after 120s")
                    still_blocked.append(part_stem)
                else:
                    raise RuntimeError(
                        f"{part_stem} terminated with status={part_status}"
                    )
            if still_blocked == pending:
                log("waiting 120s for quota to clear before retry")
                time.sleep(120.0)
            pending = still_blocked
        return finished

    raise RuntimeError(f"{stem} terminated with status={status}")


def concatenate(stems: list[str], out_path: Path) -> int:
    """Concatenate filtered JSONLs into one SFT file."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with out_path.open("w", encoding="utf-8") as sink:
        for stem in stems:
            src = DATA_DIR / f"{stem}_filtered.jsonl"
            if not src.exists():
                log(f"missing {src}, skipping")
                continue
            with src.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.rstrip("\n")
                    if line:
                        sink.write(line + "\n")
                        count += 1
    return count


def main() -> None:
    """Run v2 industry → fraud → earnings; concatenate v1+v2; KG 1 summary."""
    v2_stems: list[str] = []
    for split_name, stem, prefix in V2_SPLITS:
        v2_stems.extend(run_split(split_name, stem, prefix))

    sft_path = DATA_DIR / "sft.jsonl"
    all_stems = V1_FILTERED_STEMS + v2_stems
    total = concatenate(all_stems, sft_path)
    log(f"wrote {sft_path} rows={total}")
    log(f"KG1 threshold=2700 actual={total} pass={total >= 2700}")


if __name__ == "__main__":
    main()
