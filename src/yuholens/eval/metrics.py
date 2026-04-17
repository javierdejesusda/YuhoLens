"""Evaluation metrics for YuhoLens memo quality.

Three kill-gate metrics (build-spec §2 KILL GATE 2):

    * Citation presence rate: fraction of memos that cite at least one
      Japanese source span via inline parenthetical.
    * Section coverage: fraction of the four target sections each memo
      mentions (企業の概況, 事業の状況, 経理の状況, 関連当事者取引).
    * Judge coherence: 1-5 Likert via an external LLM judge.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass

CITATION_RE = re.compile(r"\(ref:\s*['\"][^'\"]+['\"]", re.IGNORECASE)

SECTION_MARKERS: dict[str, tuple[str, ...]] = {
    "company_overview": ("企業の概況", "company overview"),
    "business_status": ("事業の状況", "business status"),
    "financial_section": ("経理の状況", "financial section"),
    "related_party": ("関連当事者", "related party", "related-party"),
}


@dataclass(frozen=True)
class EvalRow:
    """Per-memo metric snapshot."""

    citation_count: int
    section_hits: dict[str, bool]


def count_citations(memo: str) -> int:
    """Return the number of inline ``(ref: '…'`` citations in a memo."""
    return len(CITATION_RE.findall(memo))


def section_hits(memo: str) -> dict[str, bool]:
    """Return per-target-section booleans marking which sections are cited."""
    lowered = memo.lower()
    hits: dict[str, bool] = {}
    for key, markers in SECTION_MARKERS.items():
        hits[key] = any(marker.lower() in lowered for marker in markers)
    return hits


def citation_presence_rate(memos: Iterable[str], threshold: int = 1) -> float:
    """Fraction of memos with at least ``threshold`` citations.

    Args:
        memos: Iterable of memo strings.
        threshold: Minimum citation count to count a memo as "cited".

    Returns:
        A float in [0, 1].
    """
    memos = list(memos)
    if not memos:
        return 0.0
    hits = sum(1 for memo in memos if count_citations(memo) >= threshold)
    return hits / len(memos)


def section_coverage(memos: Iterable[str]) -> dict[str, float]:
    """Per-section coverage rates across a batch of memos."""
    memos = list(memos)
    if not memos:
        return {key: 0.0 for key in SECTION_MARKERS}
    totals = {key: 0 for key in SECTION_MARKERS}
    for memo in memos:
        for key, present in section_hits(memo).items():
            if present:
                totals[key] += 1
    return {key: totals[key] / len(memos) for key in totals}


__all__ = [
    "EvalRow",
    "citation_presence_rate",
    "count_citations",
    "section_coverage",
    "section_hits",
]
