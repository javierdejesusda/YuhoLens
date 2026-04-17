"""Citation-grounder: LangGraph agent #4 (abstention-as-feature verifier).

The grounder is the final node in the YuhoLens four-agent pipeline. It takes
the English memo produced by the Pass-2 composer, parses every inline
``(ref: '<Japanese span>' p.N)`` citation, and verifies each cited span
against the union of ``japanese_span`` fields emitted by the Pass-1 per-section
extractor. Sentences whose citations are *all* ungrounded are replaced with
``[evidence insufficient]``; sentences with at least one grounded citation
are preserved verbatim. The set of orphan spans is returned alongside the
cleaned memo so that downstream evaluators can measure citation fidelity.

This matches the abstention-as-feature design in build-spec section 7.6: a
claim without source support is surfaced as a refusal rather than silently
propagated, keeping the memo faithful to the Japanese Yuho. The accepted
citation syntax mirrors exactly the Pass-2 prompt at
``yuholens.prompts.pass2.PASS2_USER_TEMPLATE`` and its few-shot examples,
so upstream format changes must be reflected here.
"""

from __future__ import annotations

import re
from typing import Any

_CITATION_GROUP_RE = re.compile(r"\(refs?:\s*[^)]+\)")
_SPAN_RE = re.compile(r"(?P<quote>['\"])(?P<span>.+?)(?P=quote)\s+p\.\w+")
_SENTENCE_SPLIT_CAPTURING_RE = re.compile(r"((?<=[.!?])\s+)")
_PARAGRAPH_SPLIT = "\n\n"
_INSUFFICIENT_MARKER = "[evidence insufficient]"
_TERMINATORS = frozenset(".!?")


def _collect_grounded_spans(
    pass1_blocks: dict[str, dict[str, Any]],
) -> set[str]:
    """Build the set of Japanese spans that Pass-1 extracted as citations.

    Args:
        pass1_blocks: Mapping from section key to the JSON-decoded Pass-1
            response for that section. Each value is expected to contain
            ``red_flags`` and ``numerical_claims`` lists, each of whose
            entries carries a ``japanese_span`` string. Missing or malformed
            fields are silently treated as empty.

    Returns:
        The set of every ``japanese_span`` value observed across ``red_flags``
        and ``numerical_claims`` in every block. ``section_summary_ja`` is
        intentionally excluded — grounding matches the upstream Pass-1 span
        contract exactly.
    """
    grounded: set[str] = set()
    for block in pass1_blocks.values():
        if not isinstance(block, dict):
            continue
        for field in ("red_flags", "numerical_claims"):
            entries = block.get(field)
            if not isinstance(entries, list):
                continue
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                span = entry.get("japanese_span")
                if isinstance(span, str) and span:
                    grounded.add(span)
    return grounded


def _extract_cited_spans(text: str) -> list[list[str]]:
    """Extract citation groups from ``text``, each as a list of span strings.

    Args:
        text: A fragment of a Pass-2 memo, e.g. a single sentence.

    Returns:
        One inner list per parenthetical citation group, in the order they
        appear in ``text``. Each inner list contains the Japanese spans
        parsed from that parenthetical (one for singular ``(ref: '...' p.N)``
        and more for ``(refs: '...' p.N; '...' p.M)`` variants).
    """
    groups: list[list[str]] = []
    for group_match in _CITATION_GROUP_RE.finditer(text):
        spans = [m.group("span") for m in _SPAN_RE.finditer(group_match.group(0))]
        if spans:
            groups.append(spans)
    return groups


def _all_cited_spans_in_order(memo: str) -> list[str]:
    """Flatten all cited spans in ``memo`` in first-appearance order.

    Args:
        memo: The full Pass-2 memo text.

    Returns:
        A list of every cited span, in the order they appear in the memo.
        Spans cited in the same parenthetical are ordered left-to-right.
        Duplicates are preserved here; de-duplication happens in
        :func:`verify_memo` for the orphan list.
    """
    ordered: list[str] = []
    for group in _extract_cited_spans(memo):
        ordered.extend(group)
    return ordered


def _process_sentence(sentence: str, grounded: set[str]) -> tuple[str, list[str]]:
    """Decide whether to keep, strip, or ignore a single sentence.

    Args:
        sentence: One sentence chunk produced by splitting a paragraph on
            sentence-terminating punctuation (``.!?``) followed by
            whitespace. The trailing terminator, if any, stays attached.
        grounded: The set of Japanese spans known to be grounded in Pass-1.

    Returns:
        A ``(rendered, orphans_in_sentence)`` pair where ``rendered`` is the
        original sentence when it should be kept and the insufficient-evidence
        marker (plus original terminator) when all citations in the sentence
        are ungrounded. ``orphans_in_sentence`` is the list of ungrounded
        spans that appeared in this sentence, in citation order.
    """
    groups = _extract_cited_spans(sentence)
    if not groups:
        return sentence, []

    orphans: list[str] = []
    any_grounded = False
    for group in groups:
        for span in group:
            if span in grounded:
                any_grounded = True
            else:
                orphans.append(span)

    if any_grounded:
        return sentence, orphans

    stripped = sentence.rstrip()
    terminator = stripped[-1] if stripped and stripped[-1] in _TERMINATORS else ""
    return _INSUFFICIENT_MARKER + terminator, orphans


def _process_paragraph(paragraph: str, grounded: set[str]) -> tuple[str, list[str]]:
    r"""Apply sentence-level grounding to a single paragraph.

    The paragraph is split into sentence chunks at terminator-plus-whitespace
    boundaries using a *capturing* regex so the original whitespace (spaces,
    newlines, tab runs between sentences) is preserved verbatim when the
    chunks are re-joined. This is required to keep markdown list structure
    intact — Pass-2 memos carry bullet lists in the executive summary and
    evidence appendix, and those list items are separated by single newlines
    that would be collapsed to spaces by a naive split-then-join.

    Args:
        paragraph: A single paragraph of the memo (text between ``\n\n``
            paragraph breaks).
        grounded: The set of grounded Japanese spans.

    Returns:
        A ``(rendered_paragraph, orphans)`` pair. Sentence chunks are
        re-joined with their original whitespace; orphans are returned in
        citation order and may contain duplicates — caller is responsible
        for de-duplication.
    """
    parts = _SENTENCE_SPLIT_CAPTURING_RE.split(paragraph)
    rendered: list[str] = []
    orphans: list[str] = []
    for index, part in enumerate(parts):
        if index % 2 == 1:
            rendered.append(part)
            continue
        processed, sentence_orphans = _process_sentence(part, grounded)
        rendered.append(processed)
        orphans.extend(sentence_orphans)
    return "".join(rendered), orphans


def verify_memo(
    memo: str,
    pass1_blocks: dict[str, dict[str, Any]],
) -> tuple[str, list[str]]:
    r"""Verify every citation in ``memo`` against Pass-1 spans and clean it.

    Each parenthetical ``(ref: '<span>' p.N)`` or
    ``(refs: '<span>' p.N; '<span>' p.M)`` in the memo contributes one or
    more cited spans. A cited span is grounded iff it equals (exact string
    match) the ``japanese_span`` field of any entry in ``red_flags`` or
    ``numerical_claims`` across any Pass-1 block. For each sentence:

    * If it has no citations, it is kept unchanged.
    * If at least one citation in the sentence is grounded, the sentence is
      kept unchanged.
    * If every citation in the sentence is ungrounded, the sentence is
      replaced with ``[evidence insufficient]`` (preserving the trailing
      sentence terminator ``.``, ``!``, or ``?``).

    Paragraph breaks (``\n\n``) are preserved; sentences within a paragraph
    are re-joined with a single space.

    Args:
        memo: The Pass-2 composer output, with inline citations in the
            format produced by ``yuholens.prompts.pass2.PASS2_USER_TEMPLATE``.
        pass1_blocks: Mapping from section key to the JSON-decoded Pass-1
            response for that section.

    Returns:
        A ``(grounded_memo, orphan_spans)`` tuple. ``grounded_memo`` is the
        cleaned memo with ungrounded-only sentences replaced by the
        insufficient-evidence marker. ``orphan_spans`` is the list of
        ungrounded cited spans, de-duplicated while preserving first-seen
        order within the memo.
    """
    grounded = _collect_grounded_spans(pass1_blocks)

    paragraphs = memo.split(_PARAGRAPH_SPLIT)
    rendered_paragraphs: list[str] = []
    raw_orphans: list[str] = []
    for paragraph in paragraphs:
        rendered, orphans = _process_paragraph(paragraph, grounded)
        rendered_paragraphs.append(rendered)
        raw_orphans.extend(orphans)

    seen: set[str] = set()
    deduped_orphans: list[str] = []
    for span in raw_orphans:
        if span in seen:
            continue
        seen.add(span)
        deduped_orphans.append(span)

    return _PARAGRAPH_SPLIT.join(rendered_paragraphs), deduped_orphans


def coverage_ratio(memo: str, pass1_blocks: dict[str, dict[str, Any]]) -> float:
    """Fraction of cited spans in ``memo`` that are grounded in ``pass1_blocks``.

    Every occurrence of a cited span contributes to the denominator, including
    duplicates and multi-span parentheticals. A memo with no citations at all
    trivially scores ``1.0``.

    Args:
        memo: The Pass-2 composer output.
        pass1_blocks: Mapping from section key to the JSON-decoded Pass-1
            response for that section.

    Returns:
        ``grounded_span_count / total_cited_span_count`` as a float in
        ``[0.0, 1.0]``, or ``1.0`` when the memo contains no citations.
    """
    grounded = _collect_grounded_spans(pass1_blocks)
    cited = _all_cited_spans_in_order(memo)
    if not cited:
        return 1.0
    hits = sum(1 for span in cited if span in grounded)
    return hits / len(cited)


__all__ = ["coverage_ratio", "verify_memo"]
