"""Japanese Yuho (有価証券報告書) section splitter.

Japanese securities reports follow a semi-standardised structure mandated by
the FSA Cabinet Office Ordinance on Disclosure of Corporate Affairs. This
module detects top-level part markers (第一部/第二部), top-level section
markers (第1〜第7 with 【】 brackets), and a handful of high-signal sub-
sections (事業等のリスク, MD&A, 継続企業の前提, 関連当事者との取引,
セグメント情報) that the pass-1 red-flag detector consumes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

SectionPattern = tuple[str, str, re.Pattern[str]]


def _compile(patterns: list[tuple[str, str, str]]) -> list[SectionPattern]:
    return [(key, label, re.compile(rx)) for key, label, rx in patterns]


YUHO_SECTIONS: list[SectionPattern] = _compile(
    [
        ("part_1", "Part I (Company Information)", r"第一部\s*【?企業情報】?"),
        ("company_overview", "Company Overview", r"第[1１一]\s*【?企業の概況】?"),
        ("business_status", "Business Status", r"第[2２二]\s*【?事業の状況】?"),
        ("facilities", "Facilities", r"第[3３三]\s*【?設備の状況】?"),
        ("filer_info", "Filer Information", r"第[4４四]\s*【?提出会社の状況】?"),
        ("financial_section", "Financial Section", r"第[5５五]\s*【?経理の状況】?"),
        ("stock_info", "Stock Info", r"第[6６六]\s*【?提出会社の株式事務の概要】?"),
        ("reference_info", "Reference Info", r"第[7７七]\s*【?提出会社の参考情報】?"),
        ("part_2", "Part II (Guarantor)", r"第二部\s*【?提出会社の保証会社等の情報】?"),
        ("risk_factors", "Risk Factors", r"[【\[]?\s*事業等のリスク\s*[】\]]?"),
        (
            "mda",
            "MD&A",
            r"[【\[]?\s*経営者による財政状態、経営成績及びキャッシュ・フローの状況の分析\s*[】\]]?",
        ),
        (
            "mda_short",
            "MD&A (short form)",
            r"[【\[]?\s*(業績等の概要|財政状態及び経営成績の分析)\s*[】\]]?",
        ),
        (
            "priority_issues",
            "Priority Issues",
            r"[【\[]?\s*(対処すべき課題|中長期的な会社の経営戦略)\s*[】\]]?",
        ),
        (
            "related_party",
            "Related-Party Transactions",
            r"[【\[]?\s*関連当事者との取引\s*[】\]]?",
        ),
        ("segment_info", "Segment Information", r"[【\[]?\s*セグメント情報\s*[】\]]?"),
        (
            "going_concern",
            "Going-Concern Note",
            r"[【\[]?\s*継続企業の前提に関する(事項|注記)\s*[】\]]?",
        ),
    ]
)


@dataclass(frozen=True)
class SectionSpan:
    """A single detected section with source-text character offsets.

    Attributes:
        key: Stable identifier used downstream (``company_overview``, etc.).
        label: Human-readable English label, useful for debug logs.
        start: Character offset of the section header in the source string.
        end: Character offset where the following section begins (exclusive).
        text: The raw Japanese body, including the matched header.
    """

    key: str
    label: str
    start: int
    end: int
    text: str


def split_yuho(text: str) -> dict[str, SectionSpan]:
    """Split a raw Yuho text into labelled sections.

    The splitter scans the source for each ``YUHO_SECTIONS`` header and keeps
    only the *first* occurrence of each section key — Yuho bodies frequently
    repeat section headers in the table of contents, which we discard.
    Anything that appears before the earliest match is returned under the
    ``preamble`` key.

    Args:
        text: The raw Japanese Yuho text (UTF-8 ``str``).

    Returns:
        A mapping from section key to ``SectionSpan``, preserving document
        order. Sections whose headers do not appear in ``text`` are absent
        from the mapping.
    """
    matches: list[tuple[int, str, str, str]] = []
    seen: set[str] = set()
    for key, label, pattern in YUHO_SECTIONS:
        for match in pattern.finditer(text):
            if key in seen:
                break
            seen.add(key)
            matches.append((match.start(), key, label, match.group(0)))
            break

    matches.sort(key=lambda m: m[0])
    spans: dict[str, SectionSpan] = {}

    if matches and matches[0][0] > 0:
        spans["preamble"] = SectionSpan(
            key="preamble",
            label="Preamble",
            start=0,
            end=matches[0][0],
            text=text[: matches[0][0]],
        )

    for idx, (start, key, label, _header) in enumerate(matches):
        end = matches[idx + 1][0] if idx + 1 < len(matches) else len(text)
        spans[key] = SectionSpan(
            key=key,
            label=label,
            start=start,
            end=end,
            text=text[start:end],
        )
    return spans


__all__ = ["SectionSpan", "YUHO_SECTIONS", "split_yuho"]
