"""Tests for orpo_data: critique batch build + preference-row construction."""

from __future__ import annotations

import json
from pathlib import Path

from yuholens.training.orpo_data import (
    CRITIQUE_SYSTEM,
    _build_preference_rows,
    _critique_user_prompt,
    _index_drafts,
)
from yuholens.training.teacher import SYSTEM_PROMPT


def test_critique_user_prompt_embeds_original_and_draft() -> None:
    row = {
        "prompt": "Write a memo about X.",
        "sft_draft": "Draft memo lacking citations.",
    }
    rendered = _critique_user_prompt(row)
    assert "Write a memo about X." in rendered
    assert "Draft memo lacking citations." in rendered
    assert "improved rewrite" in rendered.lower()


def test_critique_system_enforces_memo_only_output() -> None:
    assert "rewritten memo" in CRITIQUE_SYSTEM.lower()
    assert "no preface" in CRITIQUE_SYSTEM.lower()


def test_critique_system_is_coherence_flavoured() -> None:
    """The critique prompt must steer the rewrite toward the coherence rubric.

    The downstream KG-2 judge scores cross-section argument unity, not
    citation count or factual grounding. If the critique prompt instead
    optimises for citations / grounding, the ORPO gradient signal is
    orthogonal to the metric we are trying to move. Guard that mistake.
    """
    lowered = CRITIQUE_SYSTEM.lower()
    assert "coherent" in lowered or "coherence" in lowered
    assert "evidence ladder" in lowered
    assert "directional" in lowered
    assert "terminology" in lowered
    assert "seven-section" in lowered or "seven section" in lowered
    assert "do not invent" in lowered
    assert "tensions" in lowered


def test_critique_system_requires_citation_preservation() -> None:
    """The critique prompt must explicitly require preserving (refs:) markers.

    The first ORPO V2 batch failed the citation gate (chosen 0.305 vs
    rejected 0.995) because the prompt forbade *inventing* citations but
    never required *preserving* existing ones; gpt-5-mini interpreted
    that as license to drop them. Lock in the preservation rule so a
    future edit cannot silently re-introduce the failure mode.
    """
    import re

    flat = re.sub(r"\s+", " ", CRITIQUE_SYSTEM.lower())
    assert "preserve every" in flat
    assert "(refs:" in CRITIQUE_SYSTEM
    assert "do not delete" in flat
    assert "not disclosed" in flat


def test_index_drafts_roundtrip(tmp_path: Path) -> None:
    drafts = tmp_path / "drafts.jsonl"
    drafts.write_text(
        json.dumps({"custom_id": "d-00000", "prompt": "p0", "sft_draft": "s0"})
        + "\n"
        + json.dumps({"custom_id": "d-00001", "prompt": "p1", "sft_draft": "s1"})
        + "\n",
        encoding="utf-8",
    )
    index = _index_drafts(drafts)
    assert set(index.keys()) == {"d-00000", "d-00001"}
    assert index["d-00001"]["prompt"] == "p1"


def test_build_preference_rows_pairs_rewrite_with_draft() -> None:
    drafts_index = {
        "d-00000": {
            "custom_id": "d-00000",
            "prompt": "user instruction",
            "sft_draft": "weak draft",
        },
    }
    results = [
        {"custom_id": "d-00000", "memo": "stronger rewrite", "usage": {}, "stop_reason": "stop"},
    ]
    records = _build_preference_rows(results, drafts_index, system_prompt_default=SYSTEM_PROMPT)
    assert len(records) == 1
    row = records[0]
    assert row["chosen"] == "stronger rewrite<|im_end|>"
    assert row["rejected"] == "weak draft<|im_end|>"
    assert "user instruction" in row["prompt"]
    assert SYSTEM_PROMPT.strip()[:40] in row["prompt"]
    assert row["prompt"].endswith("<|im_start|>assistant\n")
    assert "<|im_start|>system" in row["prompt"]


def test_build_preference_rows_drops_empty_or_missing() -> None:
    drafts_index = {
        "d-00000": {"custom_id": "d-00000", "prompt": "p", "sft_draft": "s"},
    }
    results = [
        {"custom_id": "d-00000", "memo": "", "usage": {}, "stop_reason": "length"},
        {"custom_id": "d-00000", "memo": None, "usage": {}, "stop_reason": "length"},
        {"custom_id": "d-missing", "memo": "orphan", "usage": {}, "stop_reason": "stop"},
    ]
    records = _build_preference_rows(results, drafts_index, system_prompt_default=SYSTEM_PROMPT)
    assert records == []
