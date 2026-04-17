"""Tests for teacher batch polling, JSONL writing, and quality-gate filters."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from yuholens.training.teacher import (
    citation_gate,
    dedup_hash,
    filter_memos,
    hallucinated_number_gate,
    language_gate,
    length_gate,
    poll_and_filter,
    poll_batch,
    write_results_jsonl,
)

ENGLISH_MEMO = (
    "The company reported strong revenue growth driven by expanding demand in "
    "its core product segments. Management flagged supply-chain risks and "
    "currency headwinds in the medium-term outlook. Working capital metrics "
    "improved quarter over quarter as receivables aging tightened."
)


def _long_english_memo(word_count: int) -> str:
    base = (
        "The company reported strong revenue growth driven by expanding demand "
        "in core product segments across multiple regions, and management "
        "highlighted supply chain risks alongside currency headwinds for the "
        "medium term outlook while working capital metrics continued to "
        "improve across reporting periods."
    )
    words = base.split()
    out: list[str] = []
    while len(out) < word_count:
        out.extend(words)
    return " ".join(out[:word_count])


def test_citation_gate_passes_with_three_refs() -> None:
    memo = (
        "Revenue rose (ref: '売上高は前年同期比42%減少' p.3). "
        "Margins compressed (ref: \"営業利益率\" p.4). "
        "Debt grew (ref: '有利子負債' p.7)."
    )
    assert citation_gate(memo) is True


def test_citation_gate_rejects_with_two_refs() -> None:
    memo = (
        "Revenue rose (ref: '売上高' p.3). "
        "Margins compressed (ref: \"営業利益率\" p.4)."
    )
    assert citation_gate(memo) is False


def test_hallucinated_number_gate_accepts_grounded() -> None:
    memo = "Revenue was ¥1,234,000 this period."
    row: dict[str, Any] = {
        "text": "当期の売上高は1234000千円でした。",
        "bs": {},
        "pl": {},
        "cf": {},
    }
    assert hallucinated_number_gate(memo, row) is True


def test_hallucinated_number_gate_rejects_invented() -> None:
    memo = "Revenue was ¥9,999,999 this period."
    row: dict[str, Any] = {
        "text": "当期の売上高は1234000千円でした。",
        "bs": {"assets": 100},
        "pl": {"revenue": 200},
        "cf": {"operating": 50},
    }
    assert hallucinated_number_gate(memo, row) is False


def test_hallucinated_number_gate_empty_numbers() -> None:
    memo = "Revenue grew strongly, with no specific figures disclosed."
    row: dict[str, Any] = {"text": "売上高は増加しました。", "bs": "", "pl": "", "cf": ""}
    assert hallucinated_number_gate(memo, row) is True


def test_length_gate_in_range() -> None:
    memo = _long_english_memo(1000)
    assert length_gate(memo) is True


def test_length_gate_too_short() -> None:
    memo = _long_english_memo(500)
    assert length_gate(memo) is False


def test_length_gate_too_long() -> None:
    memo = _long_english_memo(3000)
    assert length_gate(memo) is False


def test_language_gate_accepts_english() -> None:
    assert language_gate(ENGLISH_MEMO) is True


def test_language_gate_rejects_mixed() -> None:
    japanese_heavy = (
        "当社は東京に本社を置く製造業です。売上高は前年同期比で増加しました。"
        "営業利益率は改善し、有利子負債は減少しました。為替変動リスクに留意する"
        "必要があります。関連当事者との取引は注記に記載されています。"
    )
    assert language_gate(japanese_heavy) is False


def test_dedup_hash_stable() -> None:
    row: dict[str, Any] = {"text": "The same long Japanese annual report text."}
    assert dedup_hash(row) == dedup_hash(row)


def test_dedup_hash_differs_on_different_text() -> None:
    row_a: dict[str, Any] = {"text": "Company A annual report text."}
    row_b: dict[str, Any] = {"text": "Company B annual report text."}
    assert dedup_hash(row_a) != dedup_hash(row_b)


def test_write_results_jsonl_roundtrip(tmp_path: Path) -> None:
    results = [
        {"custom_id": "a-0", "memo": "Memo A", "usage": {"in": 10}, "stop_reason": "stop"},
        {"custom_id": "a-1", "memo": "Memo B", "usage": {"in": 12}, "stop_reason": "stop"},
    ]
    out = tmp_path / "sub" / "results.jsonl"
    count = write_results_jsonl(results, out)
    assert count == 2
    lines = out.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    parsed = [json.loads(line) for line in lines]
    assert parsed == results


def test_filter_memos_end_to_end() -> None:
    source_rows = {
        "a-0": {"text": "Report one body text.", "bs": {}, "pl": {}, "cf": {}},
        "a-1": {"text": "Report one body text.", "bs": {}, "pl": {}, "cf": {}},
        "a-2": {"text": "Report three body text.", "bs": {}, "pl": {}, "cf": {}},
        "a-3": {"text": "Report four body text.", "bs": {}, "pl": {}, "cf": {}},
        "a-4": {"text": "Report five body text.", "bs": {}, "pl": {}, "cf": {}},
    }
    good_memo = (
        _long_english_memo(1000)
        + " (ref: 'alpha' p.1) (ref: 'beta' p.2) (ref: 'gamma' p.3)"
    )
    dup_memo = good_memo + " additional words"
    bad_citation_memo = (
        _long_english_memo(1000) + " (ref: 'only' p.1) (ref: 'two' p.2)"
    )
    too_short_memo = (
        _long_english_memo(300)
        + " (ref: 'alpha' p.1) (ref: 'beta' p.2) (ref: 'gamma' p.3)"
    )
    hallucinated_memo = (
        _long_english_memo(1000)
        + " Revenue reached ¥9,999,999. (ref: 'alpha' p.1) "
        "(ref: 'beta' p.2) (ref: 'gamma' p.3)"
    )

    results = [
        {"custom_id": "a-0", "memo": good_memo, "usage": {}, "stop_reason": "stop"},
        {"custom_id": "a-1", "memo": dup_memo, "usage": {}, "stop_reason": "stop"},
        {"custom_id": "a-2", "memo": bad_citation_memo, "usage": {}, "stop_reason": "stop"},
        {"custom_id": "a-3", "memo": too_short_memo, "usage": {}, "stop_reason": "stop"},
        {"custom_id": "a-4", "memo": hallucinated_memo, "usage": {}, "stop_reason": "stop"},
    ]

    survivors = filter_memos(results, source_rows)
    assert len(survivors) == 1
    assert survivors[0]["custom_id"] == "a-0"
    assert "dedup_key" in survivors[0]


def _make_fake_oai_client(
    retrieve_sequence: list[Any],
    output_jsonl_text: str | None = None,
) -> SimpleNamespace:
    """Build a minimal OpenAI client mock from a sequence of retrieve responses.

    Args:
        retrieve_sequence: Items are either ``SimpleNamespace``-like batch
            handles (with ``status`` and optionally ``output_file_id``) or
            ``Exception`` instances, raised in the order given. The final
            item is returned indefinitely after the sequence is exhausted.
        output_jsonl_text: Body returned by ``client.files.content(...).text``.

    Returns:
        A ``SimpleNamespace`` with ``batches.retrieve`` and ``files.content``
        attributes and a ``calls`` counter on ``batches``.
    """
    state = {"retrieve_calls": 0}

    def retrieve(batch_id: str) -> Any:
        idx = min(state["retrieve_calls"], len(retrieve_sequence) - 1)
        result = retrieve_sequence[idx]
        state["retrieve_calls"] += 1
        if isinstance(result, Exception):
            raise result
        return result

    def content(file_id: str) -> SimpleNamespace:
        return SimpleNamespace(text=output_jsonl_text or "")

    batches = SimpleNamespace(retrieve=retrieve, state=state)
    files = SimpleNamespace(content=content)
    return SimpleNamespace(batches=batches, files=files)


def _oai_success_row(custom_id: str, memo: str) -> dict[str, Any]:
    return {
        "id": f"batch_req_{custom_id}",
        "custom_id": custom_id,
        "response": {
            "status_code": 200,
            "request_id": "req-abc",
            "body": {
                "id": f"chatcmpl-{custom_id}",
                "object": "chat.completion",
                "created": 1234,
                "model": "gpt-5-mini",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": memo},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": 1500,
                    "completion_tokens": 800,
                    "total_tokens": 2300,
                },
            },
        },
        "error": None,
    }


def _oai_failed_row(custom_id: str, message: str) -> dict[str, Any]:
    return {
        "id": f"batch_req_{custom_id}",
        "custom_id": custom_id,
        "response": None,
        "error": {"code": "invalid_request", "message": message},
    }


def test_poll_batch_returns_ended_results() -> None:
    output_lines = [
        _oai_success_row("a-0", "Memo one"),
        _oai_success_row("a-1", "Memo two"),
        _oai_failed_row("a-2", "invalid_request"),
    ]
    output_text = "\n".join(json.dumps(row) for row in output_lines) + "\n"
    handle = SimpleNamespace(status="completed", output_file_id="file-xyz")
    client = _make_fake_oai_client([handle], output_jsonl_text=output_text)

    records = poll_batch(
        "batch-xyz", client=client, poll_interval_s=0.0, max_wait_s=5.0
    )

    assert len(records) == 3
    by_id = {r["custom_id"]: r for r in records}
    assert by_id["a-0"]["memo"] == "Memo one"
    assert by_id["a-0"]["stop_reason"] == "stop"
    assert by_id["a-0"]["usage"]["prompt_tokens"] == 1500
    assert by_id["a-1"]["memo"] == "Memo two"
    assert by_id["a-2"]["memo"] is None
    assert by_id["a-2"]["error"] == "invalid_request"


def test_poll_batch_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    handle = SimpleNamespace(status="in_progress", output_file_id=None)
    client = _make_fake_oai_client([handle], output_jsonl_text="")

    fake_time = {"now": 0.0}

    def fake_monotonic() -> float:
        fake_time["now"] += 1.0
        return fake_time["now"]

    monkeypatch.setattr(
        "yuholens.training.teacher.time.monotonic", fake_monotonic
    )
    monkeypatch.setattr("yuholens.training.teacher.time.sleep", lambda _s: None)

    with pytest.raises(TimeoutError):
        poll_batch(
            "batch-xyz", client=client, poll_interval_s=0.01, max_wait_s=0.5
        )


def test_write_results_jsonl_refuses_overwrite(tmp_path: Path) -> None:
    results = [
        {"custom_id": "a-0", "memo": "Memo A", "usage": {}, "stop_reason": "stop"},
    ]
    out = tmp_path / "sub" / "results.jsonl"

    assert write_results_jsonl(results, out) == 1

    with pytest.raises(FileExistsError):
        write_results_jsonl(results, out)

    updated = [
        {"custom_id": "a-1", "memo": "Memo B", "usage": {}, "stop_reason": "stop"},
    ]
    assert write_results_jsonl(updated, out, overwrite=True) == 1
    parsed = [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines()]
    assert parsed == updated


def test_poll_batch_retries_transient_error(monkeypatch: pytest.MonkeyPatch) -> None:
    output_lines = [_oai_success_row("a-0", "Recovered memo")]
    output_text = "\n".join(json.dumps(row) for row in output_lines) + "\n"
    completed = SimpleNamespace(status="completed", output_file_id="file-xyz")
    retrieve_sequence: list[Any] = [
        RuntimeError("transient network glitch"),
        RuntimeError("transient network glitch"),
        completed,
    ]
    client = _make_fake_oai_client(retrieve_sequence, output_jsonl_text=output_text)

    monkeypatch.setattr("yuholens.training.teacher.time.sleep", lambda _s: None)

    records = poll_batch(
        "batch-xyz", client=client, poll_interval_s=0.0, max_wait_s=60.0
    )

    assert len(records) == 1
    assert records[0]["memo"] == "Recovered memo"
    assert client.batches.state["retrieve_calls"] == 3


def test_poll_batch_gives_up_after_max_retries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    retrieve_sequence: list[Any] = [RuntimeError("permanent outage")]
    client = _make_fake_oai_client(retrieve_sequence, output_jsonl_text="")

    monkeypatch.setattr("yuholens.training.teacher.time.sleep", lambda _s: None)

    with pytest.raises(RuntimeError, match="permanent outage"):
        poll_batch(
            "batch-xyz", client=client, poll_interval_s=0.0, max_wait_s=60.0
        )
    assert client.batches.state["retrieve_calls"] == 5


def test_poll_and_filter_end_to_end(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    good_memo = (
        _long_english_memo(1000)
        + " (ref: 'alpha' p.1) (ref: 'beta' p.2) (ref: 'gamma' p.3)"
    )
    second_good_memo = (
        _long_english_memo(1000)
        + " (ref: 'delta' p.1) (ref: 'epsilon' p.2) (ref: 'zeta' p.3)"
    )
    bad_citation_memo = (
        _long_english_memo(1000) + " (ref: 'only' p.1) (ref: 'two' p.2)"
    )
    poll_results = [
        {
            "custom_id": "fraud_detection-00000",
            "memo": good_memo,
            "usage": {},
            "stop_reason": "stop",
        },
        {
            "custom_id": "fraud_detection-00001",
            "memo": second_good_memo,
            "usage": {},
            "stop_reason": "stop",
        },
        {
            "custom_id": "fraud_detection-00002",
            "memo": bad_citation_memo,
            "usage": {},
            "stop_reason": "stop",
        },
    ]

    source_rows_sequence = [
        {"text": "Report zero body text.", "bs": {}, "pl": {}, "cf": {}},
        {"text": "Report one body text differs.", "bs": {}, "pl": {}, "cf": {}},
        {"text": "Report two body text again.", "bs": {}, "pl": {}, "cf": {}},
    ]

    iter_split_calls: list[tuple[str, int | None]] = []

    def fake_iter_split(split: str, limit: int | None = None) -> Any:
        iter_split_calls.append((split, limit))
        for row in source_rows_sequence:
            yield row

    def fake_poll_batch(batch_id: str) -> list[dict[str, Any]]:
        assert batch_id == "batch-abc"
        return poll_results

    monkeypatch.setattr(
        "yuholens.training.teacher.iter_split", fake_iter_split
    )
    monkeypatch.setattr(
        "yuholens.training.teacher.poll_batch", fake_poll_batch
    )

    batch_json = tmp_path / "batch.json"
    batch_json.write_text(
        json.dumps(
            {
                "batch_id": "batch-abc",
                "input_file_id": "file-abc",
                "split": "fraud_detection",
            }
        )
        + "\n",
        encoding="utf-8",
    )
    raw_out = tmp_path / "raw.jsonl"
    filtered_out = tmp_path / "filtered.jsonl"

    summary = poll_and_filter(batch_json, raw_out, filtered_out)

    assert summary == {"polled": 3, "raw_written": 3, "filtered": 2}
    assert raw_out.exists()
    assert filtered_out.exists()
    raw_lines = raw_out.read_text(encoding="utf-8").splitlines()
    filtered_lines = filtered_out.read_text(encoding="utf-8").splitlines()
    assert len(raw_lines) == 3
    assert len(filtered_lines) == 2
    filtered_ids = {json.loads(line)["custom_id"] for line in filtered_lines}
    assert filtered_ids == {
        "fraud_detection-00000",
        "fraud_detection-00001",
    }
    assert iter_split_calls and iter_split_calls[0][0] == "fraud_detection"


def test_poll_and_filter_uses_source_split_override(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    good_memo = (
        _long_english_memo(1000)
        + " (ref: 'alpha' p.1) (ref: 'beta' p.2) (ref: 'gamma' p.3)"
    )
    poll_results = [
        {
            "custom_id": "earnings_forecast-00000",
            "memo": good_memo,
            "usage": {},
            "stop_reason": "stop",
        },
    ]

    iter_split_calls: list[tuple[str, int | None]] = []

    def fake_iter_split(split: str, limit: int | None = None) -> Any:
        iter_split_calls.append((split, limit))
        yield {"text": "Override split row text.", "bs": {}, "pl": {}, "cf": {}}

    def fake_poll_batch(batch_id: str) -> list[dict[str, Any]]:
        return poll_results

    monkeypatch.setattr(
        "yuholens.training.teacher.iter_split", fake_iter_split
    )
    monkeypatch.setattr(
        "yuholens.training.teacher.poll_batch", fake_poll_batch
    )

    batch_json = tmp_path / "batch.json"
    batch_json.write_text(
        json.dumps(
            {
                "batch_id": "batch-xyz",
                "input_file_id": "file-xyz",
                "split": "fraud_detection",
            }
        )
        + "\n",
        encoding="utf-8",
    )
    raw_out = tmp_path / "raw.jsonl"
    filtered_out = tmp_path / "filtered.jsonl"

    summary = poll_and_filter(
        batch_json,
        raw_out,
        filtered_out,
        source_split="earnings_forecast",
    )

    assert summary["polled"] == 1
    assert iter_split_calls, "iter_split was never invoked"
    assert iter_split_calls[0][0] == "earnings_forecast"
    assert all(call[0] != "fraud_detection" for call in iter_split_calls)


def test_poll_and_filter_prefers_source_manifest_over_iter_split(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When a sidecar manifest exists, it is used verbatim and ``iter_split`` is skipped."""
    good_memo = (
        _long_english_memo(1000)
        + " (ref: 'alpha' p.1) (ref: 'beta' p.2) (ref: 'gamma' p.3)"
    )
    poll_results = [
        {
            "custom_id": "fraud_detection-00000",
            "memo": good_memo,
            "usage": {},
            "stop_reason": "stop",
        },
    ]

    iter_split_calls: list[str] = []

    def fake_iter_split(split: str, limit: int | None = None) -> Any:
        iter_split_calls.append(split)
        # Yield a row that would NOT pass the filters so we can prove the
        # manifest path was used instead.
        yield {"text": "poisoned", "bs": {}, "pl": {}, "cf": {}}

    def fake_poll_batch(batch_id: str) -> list[dict[str, Any]]:
        return poll_results

    monkeypatch.setattr("yuholens.training.teacher.iter_split", fake_iter_split)
    monkeypatch.setattr("yuholens.training.teacher.poll_batch", fake_poll_batch)

    batch_json = tmp_path / "batch.json"
    batch_json.write_text(
        json.dumps(
            {
                "batch_id": "batch-snap",
                "input_file_id": "file-snap",
                "split": "fraud_detection",
            }
        )
        + "\n",
        encoding="utf-8",
    )
    manifest_path = tmp_path / "batch.source_rows.jsonl"
    manifest_path.write_text(
        json.dumps(
            {
                "custom_id": "fraud_detection-00000",
                "row": {
                    "text": "Genuine pinned source row.",
                    "bs": {},
                    "pl": {},
                    "cf": {},
                },
            },
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    raw_out = tmp_path / "raw.jsonl"
    filtered_out = tmp_path / "filtered.jsonl"

    summary = poll_and_filter(batch_json, raw_out, filtered_out)

    assert summary == {"polled": 1, "raw_written": 1, "filtered": 1}
    assert iter_split_calls == [], "iter_split must not be called when manifest exists"
    filtered_rows = [
        json.loads(line)
        for line in filtered_out.read_text(encoding="utf-8").splitlines()
    ]
    assert filtered_rows[0]["custom_id"] == "fraud_detection-00000"
