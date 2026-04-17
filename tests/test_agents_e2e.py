"""End-to-end tests for the four-agent LangGraph pipeline.

The tests exercise each node in isolation plus the pass2 + ground flow with
a fake inference client so that no network or model state is required. The
ingestor is tested with an injected loader so the filesystem is untouched.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from yuholens.agents.graph import (
    InferenceClient,
    PipelineState,
    _ground,
    _ingestor,
    _pass1_detect,
    _pass2_compose,
    build_pipeline,
)


SAMPLE_YUHO = """\
XYZ株式会社 有価証券報告書

第一部 【企業情報】
第1 【企業の概況】
当社は東京に本社を置く製造業です。

第2 【事業の状況】

事業等のリスク
当社の事業は為替変動リスクにさらされています。

関連当事者との取引
主要株主との取引額は2024年度で1,200百万円でした。
"""


class FakeInferenceClient:
    """Deterministic ``InferenceClient`` that replays a canned response list.

    Attributes:
        responses: The raw string responses returned one-per-call in order.
            Once exhausted, subsequent calls raise ``IndexError`` so tests
            fail loudly if they under-specify the response sequence.
        calls: Ordered log of every ``(system, user)`` pair seen. Used for
            assertion of prompt-template substitution.
    """

    def __init__(self, responses: list[str]) -> None:
        self.responses = list(responses)
        self.calls: list[tuple[str, str]] = []
        self._cursor = 0

    def complete(self, *, system: str, user: str, max_tokens: int = 2048) -> str:
        self.calls.append((system, user))
        if self._cursor >= len(self.responses):
            raise IndexError(
                f"FakeInferenceClient exhausted after {self._cursor} calls; "
                f"no response provided for call {self._cursor + 1}"
            )
        response = self.responses[self._cursor]
        self._cursor += 1
        return response


def _make_loader(text: str, tables: dict[str, Any] | None = None):
    """Return a loader closure that ignores its path and returns ``text``."""

    captured: dict[str, Any] = tables if tables is not None else {}

    def loader(path: str) -> tuple[str, dict[str, Any]]:
        return text, captured

    return loader


def test_build_pipeline_compiles() -> None:
    """``build_pipeline`` returns a compiled graph without invoking nodes."""
    app = build_pipeline()
    assert app is not None
    assert hasattr(app, "invoke")


def test_ingestor_populates_sections() -> None:
    """``_ingestor`` runs ``split_yuho`` and records the resulting sections."""
    state: PipelineState = {"yuho_path": "ignored-by-fake-loader.txt"}
    updated = _ingestor(state, loader=_make_loader(SAMPLE_YUHO))

    assert updated["raw_text"] == SAMPLE_YUHO
    assert updated["raw_tables"] == {}
    sections = updated["sections"]
    for key in ("company_overview", "risk_factors", "related_party"):
        assert key in sections, f"missing section {key}"


def test_pass1_detect_parses_json_response() -> None:
    """Valid JSON from the fake client lands under the Japanese label key."""
    sections_state: PipelineState = {
        "yuho_path": "x.txt",
        "company_name_jp": "XYZ株式会社",
        "company_name_en": "XYZ Corp",
        "edinet_code": "E99999",
        "fiscal_year": 2024,
    }
    _ingestor(sections_state, loader=_make_loader(SAMPLE_YUHO))
    analysed_sections = [k for k in sections_state["sections"] if k != "preamble"]

    responses = [
        json.dumps(
            {
                "section": "事業等のリスク",
                "red_flags": [],
                "numerical_claims": [],
                "section_summary_ja": "テスト",
            },
            ensure_ascii=False,
        )
    ] * len(analysed_sections)
    client = FakeInferenceClient(responses)

    _pass1_detect(sections_state, client=client)

    pass1 = sections_state["pass1"]
    assert len(pass1) == len(analysed_sections)
    for block in pass1.values():
        assert block["section"] == "事業等のリスク"
        assert block["red_flags"] == []
        assert block["numerical_claims"] == []
        assert block["section_summary_ja"] == "テスト"
    # Labels are the human-readable form, not the raw keys.
    assert "Risk Factors" in pass1
    # Prompt templates substituted correctly — system carries the label.
    first_system, first_user = client.calls[0]
    assert "XYZ株式会社" in first_user
    assert "E99999" in first_user
    # System prompt is formatted with the first analysed section's label.
    first_label = next(
        span.label or key
        for key, span in sections_state["sections"].items()
        if key != "preamble"
    )
    assert first_label in first_system


def test_pass1_detect_handles_bad_json_in_degraded_mode() -> None:
    """With ``strict=False`` unparseable output is wrapped in a parse-error record."""
    state: PipelineState = {
        "yuho_path": "x.txt",
        "company_name_jp": "",
        "company_name_en": "",
        "edinet_code": "",
        "fiscal_year": 2024,
    }
    _ingestor(state, loader=_make_loader(SAMPLE_YUHO))
    analysed_count = sum(1 for k in state["sections"] if k != "preamble")

    client = FakeInferenceClient(["not valid json"] * analysed_count)
    _pass1_detect(state, client=client, strict=False, max_retries=0)

    for label, block in state["pass1"].items():
        assert "_parse_error" in block, f"{label} did not record parse error"
        assert block["red_flags"] == []
        assert block["numerical_claims"] == []
        assert block["section_summary_ja"] == ""
        assert block["section"] == label


def test_pass1_detect_raises_when_strict_and_retries_exhausted() -> None:
    """Default ``strict=True`` raises after ``max_retries + 1`` bad JSON replies."""
    state: PipelineState = {
        "yuho_path": "x.txt",
        "company_name_jp": "",
        "company_name_en": "",
        "edinet_code": "",
        "fiscal_year": 2024,
    }
    _ingestor(state, loader=_make_loader(SAMPLE_YUHO))
    analysed_count = sum(1 for k in state["sections"] if k != "preamble")

    # With max_retries=1 we expect 2 calls for the first section before raising.
    client = FakeInferenceClient(["nope"] * analysed_count * 2)

    with pytest.raises(ValueError, match="unparseable JSON"):
        _pass1_detect(state, client=client, max_retries=1)


def test_pass1_detect_retry_recovers_on_second_attempt() -> None:
    """One retry with the JSON-only nudge suffices when the model repairs itself."""
    state: PipelineState = {
        "yuho_path": "x.txt",
        "company_name_jp": "",
        "company_name_en": "",
        "edinet_code": "",
        "fiscal_year": 2024,
    }
    _ingestor(state, loader=_make_loader(SAMPLE_YUHO))
    section_keys = [k for k in state["sections"] if k != "preamble"]

    valid = json.dumps(
        {
            "section": "事業等のリスク",
            "red_flags": [],
            "numerical_claims": [],
            "section_summary_ja": "テスト",
        },
        ensure_ascii=False,
    )
    responses: list[str] = []
    for idx in range(len(section_keys)):
        if idx == 0:
            responses.extend(["still bad", valid])
        else:
            responses.append(valid)
    client = FakeInferenceClient(responses)

    _pass1_detect(state, client=client, max_retries=1)

    assert len(state["pass1"]) == len(section_keys)
    # Only the first section needed a retry; everyone else parsed first try.
    expected_calls = 1 + len(section_keys)
    assert len(client.calls) == expected_calls


_SAMPLE_TABLES: dict[str, Any] = {
    "bs": {"total_assets": 1000, "total_liabilities": 400},
    "pl": {"revenue": 800, "op_income": 80},
    "cf": {"op_cf": 60},
}


def test_pass2_and_ground_flow_end_to_end() -> None:
    """Pass-2 draft plus real grounder: orphan sentence becomes marker."""
    state: PipelineState = {
        "yuho_path": "x.txt",
        "company_name_jp": "XYZ株式会社",
        "company_name_en": "XYZ Corp",
        "edinet_code": "E99999",
        "fiscal_year": 2024,
    }
    _ingestor(state, loader=_make_loader(SAMPLE_YUHO, tables=_SAMPLE_TABLES))

    # Pass-1 fake emits one grounded red-flag span per section.
    grounded_span = "為替変動リスク"
    analysed_sections = [k for k in state["sections"] if k != "preamble"]
    pass1_response = json.dumps(
        {
            "section": "事業等のリスク",
            "red_flags": [
                {
                    "flag_type": "other",
                    "severity": "medium",
                    "japanese_span": grounded_span,
                    "span_char_offset": 0,
                    "reasoning_ja": "テスト",
                }
            ],
            "numerical_claims": [],
            "section_summary_ja": "テスト",
        },
        ensure_ascii=False,
    )
    pass1_client = FakeInferenceClient([pass1_response] * len(analysed_sections))
    _pass1_detect(state, client=pass1_client)

    orphan_span = "幻覚スパン"
    memo = (
        f"The company flagged exposure (ref: '{grounded_span}' p.1). "
        f"Future growth is guaranteed (ref: '{orphan_span}' p.2)."
    )
    pass2_client = FakeInferenceClient([memo])
    _pass2_compose(state, client=pass2_client)

    assert state["pass2_draft"] == memo
    # Pass-2 prompt received the JSON-serialised pass1 blocks.
    _, pass2_user_prompt = pass2_client.calls[0]
    assert grounded_span in pass2_user_prompt

    _ground(state)

    grounded_memo = state["grounded_memo"]
    assert grounded_span in grounded_memo
    assert "[evidence insufficient]" in grounded_memo
    assert orphan_span not in grounded_memo
    assert state["orphan_spans"] == [orphan_span]


def test_pass2_compose_raises_when_tables_missing() -> None:
    """Default ``require_tables=True`` refuses to run with empty BS/PL/CF."""
    state: PipelineState = {
        "yuho_path": "x.txt",
        "company_name_jp": "",
        "company_name_en": "",
        "edinet_code": "",
        "fiscal_year": 2024,
        "raw_tables": {},
        "pass1": {},
    }
    client = FakeInferenceClient(["should-never-be-called"])

    with pytest.raises(ValueError, match="raw_tables"):
        _pass2_compose(state, client=client)


def test_pass2_compose_degraded_mode_accepts_missing_tables() -> None:
    """With ``require_tables=False`` missing tables are substituted with ``{}``."""
    state: PipelineState = {
        "yuho_path": "x.txt",
        "company_name_jp": "",
        "company_name_en": "",
        "edinet_code": "",
        "fiscal_year": 2024,
        "raw_tables": {},
        "pass1": {},
    }
    client = FakeInferenceClient(["draft memo"])
    _pass2_compose(state, client=client, require_tables=False)
    assert state["pass2_draft"] == "draft memo"


def test_build_pipeline_default_loader_auto_relaxes_tables_gate() -> None:
    """Default pipeline must run end-to-end on a text-only Yuho.

    The default loader cannot supply BS/PL/CF tables, so ``build_pipeline``
    with no explicit loader must relax ``require_tables`` automatically. A
    previous regression shipped a strict default that made the factory path
    unconditionally fail in Pass-2.
    """
    grounded_span = "為替変動リスク"

    # Materialise sections first so we know how many Pass-1 calls the fake
    # client must script; hardcoding the count silently rots when the Yuho
    # regex set grows.
    probe_state: PipelineState = {"yuho_path": "ignored.txt"}
    _ingestor(probe_state, loader=_make_loader(SAMPLE_YUHO))
    analysed_section_count = sum(
        1 for k in probe_state["sections"] if k != "preamble"
    )

    pass1_response = json.dumps(
        {
            "section": "事業等のリスク",
            "red_flags": [
                {
                    "flag_type": "other",
                    "severity": "medium",
                    "japanese_span": grounded_span,
                    "span_char_offset": 0,
                    "reasoning_ja": "テスト",
                }
            ],
            "numerical_claims": [],
            "section_summary_ja": "テスト",
        },
        ensure_ascii=False,
    )
    memo = f"Claim supported (ref: '{grounded_span}' p.1)."

    replay = FakeInferenceClient(
        [pass1_response] * analysed_section_count + [memo]
    )
    loader = _make_loader(SAMPLE_YUHO)

    state: PipelineState = {
        "yuho_path": "ignored.txt",
        "company_name_jp": "XYZ",
        "company_name_en": "XYZ Corp",
        "edinet_code": "E00000",
        "fiscal_year": 2024,
    }
    _ingestor(state, loader=loader)
    _pass1_detect(state, client=replay)
    # Emulate the build_pipeline default: require_tables auto-derived to False
    # when no loader is passed.
    _pass2_compose(state, client=replay, require_tables=False)
    _ground(state)

    assert state["grounded_memo"] == memo
    assert state["orphan_spans"] == []


if __name__ == "__main__":  # pragma: no cover - convenience runner
    pytest.main([__file__, "-v"])
