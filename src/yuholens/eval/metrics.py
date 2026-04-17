"""Evaluation metrics for YuhoLens memo quality.

Three kill-gate metrics (build-spec §2 KILL GATE 2):

    * Citation presence rate: fraction of memos that cite at least one
      Japanese source span via inline parenthetical.
    * Section coverage: fraction of the four target sections each memo
      mentions (企業の概況, 事業の状況, 経理の状況, 関連当事者取引).
    * Judge coherence: 1-5 Likert via an external LLM judge.
"""

from __future__ import annotations

import os
import re
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

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


DEFAULT_RUBRIC = """You are an expert judge scoring the structural coherence of a two-page
English investor memo produced by a financial-analysis model. The memo
summarises a Japanese 有価証券報告書 (annual securities report) for a
non-Japanese-speaking portfolio manager. Your single task is to assign one
integer Likert score from 1 to 5 measuring how coherent the memo's argument
is as a whole.

Return ONLY a single integer from 1 to 5. Do not write any other characters,
words, punctuation, or explanation. Any response other than a bare integer
in the range 1..5 is considered malformed and will be discarded.

Memo structure under evaluation
-------------------------------
Every memo is expected to follow this seven-section structure:

    1. Executive summary (3 to 5 sentences distilling the investment thesis).
    2. Going-concern assessment (liquidity, covenant headroom, auditor
       remarks, any ability-to-continue flags).
    3. Accrual quality (DSO change, inventory days, receivables aging,
       unusual accrual patterns versus cash flow from operations).
    4. Earnings direction call (up, down, or flat next period, with
       explicit reasoning tied to revenue, margin, and mix drivers).
    5. Top 3 risks cited from 事業等のリスク (ranked, with short rationale).
    6. Related-party transactions summary (from 関連当事者との取引 if
       present; "not disclosed" is acceptable when absent from the source).
    7. Evidence appendix (bulleted Japanese span citations with English
       glosses, grounding every material claim in the body above).

What "coherence" means in this rubric
-------------------------------------
Coherence is the structural quality of the argument. Judge the memo on
whether the seven sections form a single, internally consistent narrative
that a portfolio manager could act on. Concretely, coherent memos:

    - Flow logically from summary through evidence, with each section
      strengthening rather than contradicting prior claims.
    - Carry consistent directional claims across sections: e.g., the
      earnings direction call in section 4 is reinforced, not contradicted,
      by the accrual-quality discussion in section 3 and the risk ranking
      in section 5.
    - Build an evidence ladder: the executive summary previews conclusions,
      body sections support them with reasoning, and the evidence appendix
      grounds them in specific Japanese spans tied back to body claims.
    - Use consistent terminology for the same concept across sections
      (e.g., "operating margin" is not silently renamed to "EBIT margin"
      halfway through).
    - Resolve rather than ignore tensions in the source (e.g., if revenue
      grew but cash flow from operations fell, a coherent memo notes this
      and reconciles it; an incoherent memo asserts both "strong growth"
      and "healthy cash generation" without acknowledging the gap).
    - Keep the risks in section 5 and the going-concern discussion in
      section 2 consistent: a memo that flags catastrophic liquidity risk
      in section 2 but ranks currency translation as the top risk in
      section 5 is internally inconsistent.

What coherence is NOT
---------------------
Do not let the following dimensions influence your score, because they are
evaluated by other metrics in this pipeline:

    - Citation count or citation formatting. A memo with few or malformed
      citations can still be structurally coherent; a memo with perfect
      citations can still be incoherent.
    - Factual correctness. Do not penalise or reward the memo based on
      whether the Japanese-source evidence is actually accurate; assume the
      cited spans exist as written.
    - Length, word count, or prose polish. A terse but logically tight memo
      may still score 5; a long and florid but meandering memo may score 2.
    - English grammar quality, unless it is so broken that the argument
      becomes unparseable (in which case that lands around score 1 or 2).
    - Whether section 6 says "not disclosed"; absence of related-party
      transactions is a valid outcome and not an incoherence.

Score definitions
-----------------

Score 1 - Incoherent
    The memo fails as a structured argument. Sections contradict each
    other openly (e.g., executive summary calls a strong buy while the
    risk section warns of imminent insolvency without reconciliation), or
    the memo is a bag of disconnected observations with no visible thread.
    Failure modes: missing or collapsed sections, randomly ordered ideas,
    claims that appear once and are never supported or revisited, the
    earnings-direction call in section 4 flatly contradicted by the
    accrual discussion in section 3 without comment. A reader cannot act
    on this memo because the narrative arc does not exist.

Score 2 - Mostly incoherent
    The memo has partial structure but the argument leaks. Multiple
    sections are present, but at least one of the following is true: the
    executive summary is not supported by the body, the evidence appendix
    cites spans unrelated to the body claims, two sections quietly
    contradict each other without resolution (e.g., section 3 flags rising
    DSO while section 4 predicts accelerating earnings with no
    reconciliation), or terminology drifts enough to confuse the reader.
    Example failure mode: section 5 ranks three risks that do not appear
    in any other section, breaking the evidence ladder.

Score 3 - Mixed coherence
    The memo holds together at the section level, but the cross-section
    narrative is uneven. The seven sections are present and each reads
    sensibly on its own. However, transitions are weak, at least one
    directional claim in the summary is only loosely supported by the body,
    or one section is clearly weaker than the rest (e.g., the going-concern
    assessment rehashes boilerplate instead of engaging with the source).
    A reader could extract the thesis but would have to reconcile some
    tensions themselves. Most teacher-generated memos at hackathon quality
    land here by default.

Score 4 - Coherent
    The memo reads as one argument. All seven sections are present,
    directionally consistent, and build on each other. The executive
    summary previews the body, the body develops the summary's claims, and
    the evidence appendix grounds them. Terminology is consistent across
    sections. Tensions in the source (e.g., flat revenue but margin
    expansion) are acknowledged and reconciled rather than hidden. Minor
    seams remain - for instance, the risk ranking in section 5 could be
    tied more tightly to the going-concern discussion - but they do not
    disrupt the thesis. A portfolio manager could act on this memo after
    a single read.

Score 5 - Highly coherent
    Exceptional structural coherence. The memo reads as if every sentence
    was chosen in light of every other sentence. Each section is load-
    bearing: removing or reordering a section would materially damage the
    argument. Directional claims in the summary, body, and evidence
    appendix are mutually reinforcing. Tensions in the source are named,
    investigated, and resolved. Terminology is precise and stable. The
    evidence ladder is complete: every material claim in the summary has a
    supporting paragraph in the body and a cited span in the appendix.
    This score is reserved for memos that a senior analyst would forward
    to a PM without edits.

Scoring procedure
-----------------
Read the memo once end-to-end. Then ask yourself: does the executive
summary's thesis survive the body? Are directional calls consistent across
sections 3, 4, and 5? Does the evidence appendix ground the body rather
than introduce new claims? Is terminology stable? Are tensions in the
source resolved rather than hidden? Map your overall impression onto the
five score definitions above, prefer the score whose failure-mode list
best matches what you saw, and return that integer.

Reminder: citation count and factual correctness are scored by other
metrics in this pipeline. Your job is to score only the argument's
structural coherence. Return ONLY a single integer from 1 to 5. No prose,
no bullets, no commentary, no trailing punctuation. Just the digit.
"""


def _retry_call(call: Callable[[], Any], attempts: int = 5) -> Any:
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


def judge_coherence(
    memos: Iterable[str],
    rubric: str = DEFAULT_RUBRIC,
    model: str = "gpt-5-mini",
    client: Any | None = None,
    min_parse_rate: float = 0.9,
) -> float:
    """Score memo coherence with an LLM judge and return the mean score.

    For each memo, one real-time Chat Completions request is sent with the
    rubric as the system prompt. The assistant's reply is parsed for a
    single integer in ``[1, 5]``. The returned value is the arithmetic mean
    of successfully parsed scores. To protect kill-gate decisions from
    survivorship bias when the judge regresses, the function raises
    ``ValueError`` whenever the parse rate falls below ``min_parse_rate``.

    The rubric is deliberately long (>= 1024 tokens) so OpenAI's automatic
    prefix caching kicks in across the batch, reducing input-token cost on
    cache hits. Each chat-completions call is wrapped in a five-attempt
    exponential-backoff retry (1/2/4/8/16s) mirroring the teacher pipeline.

    Args:
        memos: Iterable of memo strings to judge.
        rubric: System-prompt rubric defining the 1..5 Likert scale.
            Defaults to :data:`DEFAULT_RUBRIC`.
        model: OpenAI chat-completions model name. Defaults to
            ``"gpt-5-mini"``.
        client: Optional pre-built ``openai.OpenAI`` client, injected for
            tests. When ``None``, a client is constructed lazily from the
            ``OPENAI_API_KEY`` environment variable.
        min_parse_rate: Minimum fraction of memos whose judge response must
            parse to a valid Likert score. When the observed parse rate is
            below this threshold, ``ValueError`` is raised so the caller
            cannot silently accept a biased mean. Set to ``0.0`` to disable
            the guard (e.g. for ad-hoc exploration).

    Returns:
        Mean Likert score as a ``float``. Returns ``0.0`` if ``memos`` is
        empty.

    Raises:
        ValueError: When the parse rate over ``memos`` falls below
            ``min_parse_rate``. The error message reports the observed
            parse rate so the caller can triage the judge or prompt.
    """
    memos = list(memos)
    if not memos:
        return 0.0

    if client is None:
        import openai

        client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    scores: list[int] = []
    for memo in memos:
        user_prompt = (
            "Judge the coherence of this memo on the rubric above. Return "
            "ONLY a single integer 1..5. No commentary.\n\nMEMO:\n<<<\n"
            f"{memo}\n>>>"
        )

        def _call(prompt: str = user_prompt) -> Any:
            return client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": rubric},
                    {"role": "user", "content": prompt},
                ],
            )

        response = _retry_call(_call)
        choices = getattr(response, "choices", None) or []
        if not choices:
            continue
        message = getattr(choices[0], "message", None)
        content = getattr(message, "content", None) if message is not None else None
        if not content:
            continue
        match = re.search(r"\b([1-5])\b", content)
        if match is None:
            continue
        scores.append(int(match.group(1)))

    parse_rate = len(scores) / len(memos)
    if parse_rate < min_parse_rate:
        raise ValueError(
            f"Judge parse rate {parse_rate:.1%} below minimum "
            f"{min_parse_rate:.1%} ({len(scores)}/{len(memos)} memos parsed)"
        )
    if not scores:
        return 0.0
    return sum(scores) / len(scores)


__all__ = [
    "DEFAULT_RUBRIC",
    "EvalRow",
    "citation_presence_rate",
    "count_citations",
    "judge_coherence",
    "section_coverage",
    "section_hits",
]
