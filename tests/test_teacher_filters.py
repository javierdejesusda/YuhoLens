"""Tests for teacher batch polling, JSONL writing, and quality-gate filters."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from yuholens.training.teacher import (
    citation_gate,
    dedup_hash,
    filter_memos,
    hallucinated_number_gate,
    language_gate,
    length_gate,
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
        {"custom_id": "a-0", "memo": "Memo A", "usage": {"in": 10}, "stop_reason": "end_turn"},
        {"custom_id": "a-1", "memo": "Memo B", "usage": {"in": 12}, "stop_reason": "end_turn"},
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
        {"custom_id": "a-0", "memo": good_memo, "usage": {}, "stop_reason": "end_turn"},
        {"custom_id": "a-1", "memo": dup_memo, "usage": {}, "stop_reason": "end_turn"},
        {"custom_id": "a-2", "memo": bad_citation_memo, "usage": {}, "stop_reason": "end_turn"},
        {"custom_id": "a-3", "memo": too_short_memo, "usage": {}, "stop_reason": "end_turn"},
        {"custom_id": "a-4", "memo": hallucinated_memo, "usage": {}, "stop_reason": "end_turn"},
    ]

    survivors = filter_memos(results, source_rows)
    assert len(survivors) == 1
    assert survivors[0]["custom_id"] == "a-0"
    assert "dedup_key" in survivors[0]


class _FakeResult:
    def __init__(self, type_: str, text: str | None = None, error: str | None = None) -> None:
        self.type = type_
        if type_ == "succeeded":
            self.message = _FakeMessage(text or "")
        self._error = error

    @property
    def error(self) -> str | None:
        return self._error


class _FakeMessage:
    def __init__(self, text: str) -> None:
        self.content = [_FakeContentBlock(text)]
        self.usage = {"input_tokens": 10, "output_tokens": 20}
        self.stop_reason = "end_turn"


class _FakeContentBlock:
    def __init__(self, text: str) -> None:
        self.type = "text"
        self.text = text


class _FakeEntry:
    def __init__(self, custom_id: str, result: _FakeResult) -> None:
        self.custom_id = custom_id
        self.result = result


class _FakeBatchHandle:
    def __init__(self, status: str = "ended") -> None:
        self.processing_status = status


class _FakeBatches:
    def __init__(self, entries: list[_FakeEntry]) -> None:
        self._entries = entries
        self.retrieve_calls = 0

    def retrieve(self, batch_id: str) -> _FakeBatchHandle:
        self.retrieve_calls += 1
        return _FakeBatchHandle(status="ended")

    def results(self, batch_id: str) -> Any:
        for entry in self._entries:
            yield entry


class _FakeMessagesNamespace:
    def __init__(self, batches: _FakeBatches) -> None:
        self.batches = batches


class _FakeClient:
    def __init__(self, entries: list[_FakeEntry]) -> None:
        self.messages = _FakeMessagesNamespace(_FakeBatches(entries))


def test_poll_batch_returns_ended_results() -> None:
    entries = [
        _FakeEntry("a-0", _FakeResult("succeeded", text="Memo one")),
        _FakeEntry("a-1", _FakeResult("succeeded", text="Memo two")),
        _FakeEntry("a-2", _FakeResult("errored", error="invalid_request")),
    ]
    client = _FakeClient(entries)
    records = poll_batch("batch-xyz", client=client, poll_interval_s=0.0, max_wait_s=5.0)
    assert len(records) == 3
    by_id = {r["custom_id"]: r for r in records}
    assert by_id["a-0"]["memo"] == "Memo one"
    assert by_id["a-1"]["memo"] == "Memo two"
    assert by_id["a-2"]["memo"] is None
    assert by_id["a-2"]["error"] == "invalid_request"


def test_poll_batch_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    class _NeverEndingBatches:
        def retrieve(self, batch_id: str) -> _FakeBatchHandle:
            return _FakeBatchHandle(status="in_progress")

        def results(self, batch_id: str) -> Any:
            return iter([])

    class _Client:
        def __init__(self) -> None:
            self.messages = _FakeMessagesNamespace(_NeverEndingBatches())

    with pytest.raises(TimeoutError):
        poll_batch("batch-xyz", client=_Client(), poll_interval_s=0.01, max_wait_s=0.02)
