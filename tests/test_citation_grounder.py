"""Tests for the citation-grounder LangGraph agent."""

from __future__ import annotations

import json
from typing import Any

import pytest

from yuholens.agents.citation_grounder import coverage_ratio, verify_memo
from yuholens.prompts.pass1 import PASS1_FEW_SHOT


def _pass1_blocks_from_few_shot() -> dict[str, dict[str, Any]]:
    """Parse the three Pass-1 few-shot expected_output JSON strings.

    Returns:
        A dict keyed by ``section_key_jp`` mapping to the decoded Pass-1
        response. Using the canonical few-shot fixtures keeps tests anchored
        to the real upstream contract rather than fabricated Japanese spans.
    """
    blocks: dict[str, dict[str, Any]] = {}
    for shot in PASS1_FEW_SHOT:
        decoded = json.loads(shot["expected_output"])
        blocks[shot["section_key_jp"]] = decoded
    return blocks


PASS1_BLOCKS = _pass1_blocks_from_few_shot()

# Spans known to exist in the Pass-1 few-shot fixtures.
SPAN_EARNINGS = "来期の営業利益は前期比で減少する見通しであります"
SPAN_CUSTOMER = "主要顧客3社で売上高の約62%を占めており"
SPAN_RELATED_PARTY = "独立した第三者からの相見積は取得しておりません"
SPAN_GOING_CONCERN = "継続企業の前提に関する重要な不確実性が認められます"

ORPHAN_SPAN = "invented span that does not exist"


def test_verify_memo_keeps_all_grounded_sentences() -> None:
    memo = (
        f"Earnings are projected to decline next period (ref: '{SPAN_EARNINGS}' p.3). "
        f"Customer concentration is elevated (ref: '{SPAN_CUSTOMER}' p.4). "
        f"Going-concern uncertainty was disclosed (ref: '{SPAN_GOING_CONCERN}' p.7)."
    )

    grounded_memo, orphans = verify_memo(memo, PASS1_BLOCKS)

    assert grounded_memo == memo
    assert orphans == []


def test_verify_memo_strips_ungrounded_sentence() -> None:
    good_sentence = (
        f"Earnings are projected to decline (ref: '{SPAN_EARNINGS}' p.3)."
    )
    bad_sentence = f"A vague observation was made (ref: '{ORPHAN_SPAN}' p.5)."
    tail_sentence = (
        f"Customer concentration is elevated (ref: '{SPAN_CUSTOMER}' p.4)."
    )
    memo = f"{good_sentence} {bad_sentence} {tail_sentence}"

    grounded_memo, orphans = verify_memo(memo, PASS1_BLOCKS)

    assert good_sentence in grounded_memo
    assert tail_sentence in grounded_memo
    assert bad_sentence not in grounded_memo
    assert "[evidence insufficient]." in grounded_memo
    assert orphans == [ORPHAN_SPAN]


def test_verify_memo_mixed_grounding_in_sentence_keeps_sentence() -> None:
    mixed_sentence = (
        f"Governance weakness combines a grounded citation "
        f"(refs: '{SPAN_RELATED_PARTY}' p.10; '{ORPHAN_SPAN}' p.11)."
    )
    memo = mixed_sentence

    grounded_memo, orphans = verify_memo(memo, PASS1_BLOCKS)

    assert grounded_memo == mixed_sentence
    assert "[evidence insufficient]" not in grounded_memo
    assert orphans == [ORPHAN_SPAN]


def test_verify_memo_preserves_paragraph_breaks() -> None:
    paragraph_one = (
        f"Earnings outlook weakens next period (ref: '{SPAN_EARNINGS}' p.3)."
    )
    paragraph_two = (
        f"An unsupported claim was included (ref: '{ORPHAN_SPAN}' p.9)."
    )
    paragraph_three = (
        f"Customer concentration remains elevated (ref: '{SPAN_CUSTOMER}' p.4)."
    )
    memo = f"{paragraph_one}\n\n{paragraph_two}\n\n{paragraph_three}"

    grounded_memo, orphans = verify_memo(memo, PASS1_BLOCKS)

    parts = grounded_memo.split("\n\n")
    assert len(parts) == 3
    assert parts[0] == paragraph_one
    assert parts[1] == "[evidence insufficient]."
    assert parts[2] == paragraph_three
    assert orphans == [ORPHAN_SPAN]


def test_coverage_ratio_computes_correctly() -> None:
    memo_three_citations = (
        f"Earnings decline next period (ref: '{SPAN_EARNINGS}' p.3). "
        f"Customer concentration is elevated (ref: '{SPAN_CUSTOMER}' p.4). "
        f"An unsupported claim (ref: '{ORPHAN_SPAN}' p.5)."
    )
    assert coverage_ratio(memo_three_citations, PASS1_BLOCKS) == pytest.approx(2 / 3)

    memo_without_citations = "This memo contains no citations at all."
    assert coverage_ratio(memo_without_citations, PASS1_BLOCKS) == 1.0
