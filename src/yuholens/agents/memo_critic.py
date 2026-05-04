"""Memo-critic LangGraph node — best-of-N composer with judge or heuristic pick.

This module ships the inference-time best-of-N layer that closed the KG-2
gate on 2026-04-25. It replaces the single-shot Pass-2 composer node with a
critic that:

    1. Calls the Pass-2 composer ``len(profiles)`` times, once per
       :class:`yuholens.agents.decoder_profiles.DecoderProfile`. Profiles
       differ by ``(temperature, top_p, repetition_penalty,
       no_repeat_ngram_size, seed)`` and are forwarded to the inference
       backend through the ``generation`` kwarg of
       :meth:`yuholens.agents.graph.InferenceClient.complete`.
    2. Scores every candidate via either the gpt-5-mini coherence judge
       (``judge="judge"``) or a length-plus-citation heuristic
       (``judge="heuristic"``). The default ``judge="auto"`` picks the
       judge when ``OPENAI_API_KEY`` is exported and the heuristic
       otherwise.
    3. Writes the highest-scoring candidate into ``state["pass2_draft"]``
       so the downstream :func:`yuholens.agents.graph._ground` node can
       run unchanged. Diagnostic fields ``state["candidates"]``,
       ``state["candidate_scores"]``, and ``state["picked_profile"]``
       expose the per-candidate breakdown for inspection.

Heuristic scoring intentionally mirrors the kill-gate metrics from
``yuholens.eval.metrics`` so the heuristic can serve as a no-API stand-in
during local smoke tests: citation count, section coverage, and a soft
length window with the v5-tuned 1,400-3,000-token sweet spot.
"""

from __future__ import annotations

import json
import math
import os
import re
from dataclasses import asdict
from typing import Any, Iterable, Literal

from yuholens.agents.decoder_profiles import DEFAULT_PROFILES, DecoderProfile, validate_profiles
from yuholens.eval.metrics import (
    DEFAULT_RUBRIC,
    count_citations,
    section_hits,
)
from yuholens.prompts.pass2 import PASS2_SYSTEM, PASS2_USER_TEMPLATE

JudgeMode = Literal["auto", "judge", "heuristic"]

_PASS2_MAX_TOKENS: int = 3000
_HEURISTIC_LENGTH_TARGET: tuple[int, int] = (1400, 3000)


def _profile_generation(profile: DecoderProfile) -> dict[str, Any]:
    """Return the ``generation`` dict matching ``profile`` for ``complete()``.

    Args:
        profile: Decoder profile to materialise.

    Returns:
        A plain dict ready to forward to
        :meth:`yuholens.agents.graph.InferenceClient.complete` via its
        ``generation`` kwarg. ``seed`` is omitted when ``None`` so backends
        that reject ``None`` do not have to special-case it.
    """
    payload = asdict(profile)
    payload.pop("name", None)
    if payload.get("seed") is None:
        payload.pop("seed", None)
    return payload


def _build_pass2_prompt(
    state: dict[str, Any],
    *,
    require_tables: bool = True,
) -> tuple[str, str]:
    """Render the Pass-2 ``(system, user)`` prompt pair from pipeline state.

    Args:
        state: The shared pipeline state, expected to carry ``pass1`` and
            ``raw_tables``.
        require_tables: When True (default), raise ``ValueError`` if any of
            ``bs``, ``pl``, ``cf`` is missing or empty. This mirrors the
            gate enforced by :func:`yuholens.agents.graph._pass2_compose`
            and is required to keep the best-of-N path from fabricating
            accrual/earnings analysis under missing-table inputs. Pass
            ``False`` only for explicit degraded-mode runs (e.g. text-only
            loaders) that have already opted into the warning.

    Returns:
        ``(system_prompt, user_prompt)`` ready for ``InferenceClient.complete``.

    Raises:
        ValueError: When ``require_tables`` is True and ``state["raw_tables"]``
            is missing any of the BS / PL / CF payloads.
    """
    pass1_blocks = json.dumps(state.get("pass1", {}), ensure_ascii=False, indent=2)
    raw_tables = state.get("raw_tables", {}) or {}
    missing = [key for key in ("bs", "pl", "cf") if not raw_tables.get(key)]
    if missing and require_tables:
        raise ValueError(
            "memo_critic requires BS/PL/CF tables in state['raw_tables'] but "
            f"the following keys are missing or empty: {missing}. Pass "
            "require_tables=False to run in degraded mode."
        )
    bs_json = json.dumps(raw_tables.get("bs", {}), ensure_ascii=False)
    pl_json = json.dumps(raw_tables.get("pl", {}), ensure_ascii=False)
    cf_json = json.dumps(raw_tables.get("cf", {}), ensure_ascii=False)

    user_prompt = PASS2_USER_TEMPLATE.format(
        edinet_code=state.get("edinet_code", ""),
        company_name_jp=state.get("company_name_jp", ""),
        company_name_en=state.get("company_name_en", ""),
        fiscal_year=state.get("fiscal_year", ""),
        pass1_blocks=pass1_blocks,
        bs_json=bs_json,
        pl_json=pl_json,
        cf_json=cf_json,
    )
    return PASS2_SYSTEM, user_prompt


def heuristic_score(memo: str) -> float:
    """Compute the no-API fallback coherence proxy for ``memo``.

    The score is a weighted sum of three components designed to be
    monotone with judge coherence in the expected direction (citation
    density, section coverage, and a soft penalty for memos outside the
    v5-tuned 1,400-3,000-token band). The recomputed Spearman rank
    correlation against the gpt-5-mini judge across five committed KG-2
    candidate pools (n=250 paired memos) is approximately 0.22; per-pool
    rho ranges from 0.07 to 0.55 and the shipping bo5-picked subset is
    range-restricted to ~0.12 post-selection. The heuristic is intended
    as a degraded-mode fallback for air-gapped runs, not as a substitute
    for the judge.

    Args:
        memo: Candidate memo string.

    Returns:
        A float; higher is better. The scale is unbounded but typically
        lands in ``[0, 12]`` for valid memos.
    """
    if not memo:
        return 0.0
    citation_score = min(count_citations(memo), 8)
    sections = section_hits(memo)
    section_score = sum(1 for present in sections.values() if present)
    word_count = len(memo.split())
    low, high = _HEURISTIC_LENGTH_TARGET
    if word_count < low:
        length_penalty = (low - word_count) / low
    elif word_count > high:
        length_penalty = (word_count - high) / high
    else:
        length_penalty = 0.0
    length_score = max(0.0, 2.0 - 2.0 * length_penalty)
    return float(citation_score) + float(section_score) + length_score


def _judge_one(memo: str, *, client: Any, model: str, rubric: str) -> int | None:
    """Score a single memo via the gpt-5-mini coherence judge.

    Args:
        memo: Memo text to judge.
        client: OpenAI-shaped client; required (the auto-construction lives
            in :func:`judge_scores`).
        model: Judge model identifier.
        rubric: System-prompt rubric.

    Returns:
        A parsed integer in ``[1, 5]`` or ``None`` when the response cannot
        be parsed. Callers downgrade unparsed candidates rather than raising
        because best-of-N is robust to a few missing scores.
    """
    user_prompt = (
        "Judge the coherence of this memo on the rubric above. Return "
        "ONLY a single integer 1..5. No commentary.\n\nMEMO:\n<<<\n"
        f"{memo}\n>>>"
    )
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": rubric},
            {"role": "user", "content": user_prompt},
        ],
    )
    choices = getattr(response, "choices", None) or []
    if not choices:
        return None
    message = getattr(choices[0], "message", None)
    content = getattr(message, "content", None) if message is not None else None
    if not content:
        return None
    match = re.search(r"\b([1-5])\b", content)
    if match is None:
        return None
    return int(match.group(1))


class JudgeUnavailableError(RuntimeError):
    """Raised when the judge backend is unreachable or rejects the credential."""


def judge_scores(
    memos: Iterable[str],
    *,
    client: Any | None = None,
    model: str = "gpt-5-mini",
    rubric: str = DEFAULT_RUBRIC,
) -> list[float]:
    """Return per-memo coherence scores from the gpt-5-mini judge.

    Unparseable judge replies surface as ``float("nan")`` so the caller can
    distinguish "judge ran but the response was malformed" from a hard
    transport / auth failure. Hard failures raise
    :class:`JudgeUnavailableError` and the caller is responsible for
    falling back to the heuristic.

    Args:
        memos: Iterable of candidate memo strings.
        client: Optional pre-built OpenAI client. When ``None`` a client is
            constructed lazily from ``OPENAI_API_KEY``.
        model: Judge model identifier.
        rubric: System-prompt rubric.

    Returns:
        One float per memo, in input order. Unparseable judgments are
        ``float("nan")`` so they sort below any parsed score under the
        ``pick_best`` rule that prefers finite values.

    Raises:
        JudgeUnavailableError: When the OpenAI client cannot be built (e.g.
            missing API key) or when the first judge call raises an OpenAI
            transport / auth error. Subsequent per-memo errors after the
            first successful call are recorded as NaN scores rather than
            aborting the run.
    """
    materialised = list(memos)
    if not materialised:
        return []

    if client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise JudgeUnavailableError("OPENAI_API_KEY not set")
        try:
            import openai

            client = openai.OpenAI(api_key=api_key)
        except Exception as exc:
            raise JudgeUnavailableError(
                f"failed to construct OpenAI client: {exc}"
            ) from exc

    scores: list[float] = []
    for index, memo in enumerate(materialised):
        try:
            raw = _judge_one(memo, client=client, model=model, rubric=rubric)
        except Exception as exc:
            if index == 0:
                raise JudgeUnavailableError(
                    f"judge backend rejected the first request: {exc}"
                ) from exc
            raw = None
        scores.append(float(raw) if raw is not None else float("nan"))
    return scores


def _probe_openai_credential() -> bool:
    """Return True when the configured OpenAI key authenticates against the API.

    A fast, low-cost ``GET /v1/models`` request is used as the auth probe;
    this avoids the failure mode where ``OPENAI_API_KEY`` is set but invalid
    so generation succeeds and only the judge call fails after candidate
    work is already burned.

    Returns:
        ``True`` when the key both exists and authenticates; ``False`` when
        either condition fails. Network errors are treated as failures so
        the caller falls back to the heuristic rather than crashing late.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return False
    try:
        import openai

        client = openai.OpenAI(api_key=api_key)
        client.models.list()
    except Exception:
        return False
    return True


def _resolve_judge_mode(mode: JudgeMode) -> Literal["judge", "heuristic"]:
    """Resolve ``"auto"`` to ``"judge"`` or ``"heuristic"`` based on env state.

    For the ``"auto"`` mode a real auth probe is preferred over a bare
    presence check on ``OPENAI_API_KEY`` because invalid-but-present keys
    are the empirically dominant failure mode in this repo's eval logs.
    The probe is skipped for ``"judge"`` (operator opted in explicitly so
    a hard error is acceptable) and ``"heuristic"`` (no API needed).

    Args:
        mode: User-supplied judge mode.

    Returns:
        ``"judge"`` when ``mode == "judge"`` or (``mode == "auto"`` and the
        live credential probe passes); otherwise ``"heuristic"``.
    """
    if mode == "judge":
        return "judge"
    if mode == "heuristic":
        return "heuristic"
    return "judge" if _probe_openai_credential() else "heuristic"


def _has_finite_score(scores: Iterable[float]) -> bool:
    """Return True when ``scores`` contains at least one finite real number."""
    return any(math.isfinite(score) for score in scores)


def pick_best(
    memos: list[str],
    scores: list[float],
    profiles: list[DecoderProfile],
) -> tuple[int, str, float, str]:
    """Pick the highest-scoring candidate; ties go to the lower index.

    NaN scores compare as not-greater under ``>``, so they cannot displace
    a finite incumbent — this keeps unparseable judge replies from winning
    the pick when at least one parseable score exists. The caller is
    responsible for failing closed when *no* finite score is present (see
    :func:`_has_finite_score`); this function will still return a winner
    in that case but the result is meaningless.

    Args:
        memos: Candidate memo strings.
        scores: One score per memo, same length and order as ``memos``.
        profiles: Decoder profiles, same length and order as ``memos``.

    Returns:
        ``(index, memo, score, profile_name)`` for the winning candidate.

    Raises:
        ValueError: If the three lists have mismatched lengths or are empty.
    """
    if not memos or len(memos) != len(scores) or len(memos) != len(profiles):
        raise ValueError(
            "memos, scores, and profiles must be non-empty and equal in length"
        )
    best_idx = 0
    best_score = scores[0]
    for idx in range(1, len(scores)):
        if scores[idx] > best_score:
            best_idx = idx
            best_score = scores[idx]
    return best_idx, memos[best_idx], best_score, profiles[best_idx].name


def memo_critic(
    state: dict[str, Any],
    *,
    client: Any,
    profiles: Iterable[DecoderProfile] | None = None,
    judge: JudgeMode = "auto",
    judge_model: str = "gpt-5-mini",
    judge_client: Any | None = None,
    max_tokens: int = _PASS2_MAX_TOKENS,
    require_tables: bool = True,
) -> dict[str, Any]:
    """Run best-of-N composition and write the winner into ``state``.

    The critic mutates ``state`` in place (matching the convention used by
    the existing graph nodes) and also returns it so it can serve as a
    drop-in LangGraph node target.

    Args:
        state: Shared pipeline state. Must carry ``pass1`` populated by
            :func:`yuholens.agents.graph._pass1_detect`. ``raw_tables`` is
            required by default to mirror the gate enforced by
            :func:`yuholens.agents.graph._pass2_compose`.
        client: Inference client used for the N composer calls.
        profiles: Decoder profiles to fan out across. Defaults to
            :data:`yuholens.agents.decoder_profiles.DEFAULT_PROFILES`.
        judge: Scoring mode. ``"auto"`` (default) probes the OpenAI
            credential and uses the judge only when the probe authenticates.
            ``"judge"`` forces the judge but transparently falls back to
            the heuristic when the judge backend is unreachable
            (auth/transport failure on the first call) so candidate
            generation work is never wasted. ``"heuristic"`` forces the
            no-API fallback.
        judge_model: Judge model identifier when ``judge != "heuristic"``.
        judge_client: Optional pre-built OpenAI client for the judge,
            injected for tests. ``None`` defers construction.
        max_tokens: Upper bound forwarded to ``client.complete`` for each
            candidate.
        require_tables: When True (default) reject empty BS/PL/CF before
            generating any candidate. The strict gate is duplicated from
            ``_pass2_compose`` so the best-of-N path cannot silently
            fabricate accrual / earnings analysis under missing-table
            inputs. Pass ``False`` only when the caller has explicitly
            opted into degraded mode.

    Returns:
        The mutated ``state`` with ``pass2_draft`` set to the winning memo,
        plus ``candidates``, ``candidate_scores``, ``candidate_profiles``,
        ``picked_profile``, ``judge_mode`` (post-fallback) and
        ``judge_fallback_reason`` (when applicable) populated for
        diagnostics.

    Raises:
        ValueError: When ``profiles`` materialises to an empty sequence,
            or when ``require_tables`` is True and ``raw_tables`` is
            incomplete.
    """
    selected_profiles = validate_profiles(profiles or DEFAULT_PROFILES)
    system_prompt, user_prompt = _build_pass2_prompt(
        state, require_tables=require_tables
    )

    candidates: list[str] = []
    for profile in selected_profiles:
        memo = client.complete(
            system=system_prompt,
            user=user_prompt,
            max_tokens=max_tokens,
            generation=_profile_generation(profile),
        )
        candidates.append(memo or "")

    resolved_mode = _resolve_judge_mode(judge)
    fallback_reason: str | None = None

    if resolved_mode == "judge":
        try:
            scores = judge_scores(
                candidates,
                client=judge_client,
                model=judge_model,
            )
        except JudgeUnavailableError as exc:
            fallback_reason = f"judge_unavailable:{exc}"
            scores = [heuristic_score(memo) for memo in candidates]
            resolved_mode = "heuristic"
        else:
            if not _has_finite_score(scores):
                fallback_reason = "judge_returned_no_finite_scores"
                scores = [heuristic_score(memo) for memo in candidates]
                resolved_mode = "heuristic"
    else:
        scores = [heuristic_score(memo) for memo in candidates]

    profile_list = list(selected_profiles)
    best_idx, best_memo, best_score, best_name = pick_best(
        candidates, scores, profile_list
    )

    state["pass2_draft"] = best_memo
    state["candidates"] = candidates
    state["candidate_scores"] = scores
    state["candidate_profiles"] = [p.name for p in profile_list]
    state["picked_profile"] = best_name
    state["picked_index"] = best_idx
    state["judge_mode"] = resolved_mode
    if fallback_reason is not None:
        state["judge_fallback_reason"] = fallback_reason
    return state


__all__ = [
    "JudgeMode",
    "JudgeUnavailableError",
    "heuristic_score",
    "judge_scores",
    "memo_critic",
    "pick_best",
]
