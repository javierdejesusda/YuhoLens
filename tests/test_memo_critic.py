"""Tests for the best-of-N MemoCriticAgent and decoder-profile catalogue."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from yuholens.agents.decoder_profiles import (
    DEFAULT_PROFILES,
    DecoderProfile,
    validate_profile,
    validate_profiles,
)
from yuholens.agents.memo_critic import (
    JudgeUnavailableError,
    heuristic_score,
    memo_critic,
    pick_best,
)


class _RecordingClient:
    """Inference client that returns scripted memos and records each call.

    Attributes:
        responses: Memo strings returned in order, one per ``complete`` call.
        calls: Captured ``(system, user, max_tokens, generation)`` tuples in
            invocation order.
    """

    def __init__(self, responses: list[str]) -> None:
        self.responses = list(responses)
        self.calls: list[dict[str, Any]] = []
        self._cursor = 0

    def complete(
        self,
        *,
        system: str,
        user: str,
        max_tokens: int = 2048,
        generation: dict[str, Any] | None = None,
    ) -> str:
        self.calls.append(
            {
                "system": system,
                "user": user,
                "max_tokens": max_tokens,
                "generation": generation,
            }
        )
        if self._cursor >= len(self.responses):
            raise IndexError("RecordingClient: scripted responses exhausted")
        memo = self.responses[self._cursor]
        self._cursor += 1
        return memo


def _judge_client(scores: list[str]) -> SimpleNamespace:
    """Build a fake OpenAI client returning canned coherence scores."""
    queue = list(scores)

    def create(*, model: str, messages: list[dict[str, str]]) -> SimpleNamespace:
        if not queue:
            raise AssertionError("judge client: no more scripted scores")
        content = queue.pop(0)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        )

    completions = SimpleNamespace(create=create)
    chat = SimpleNamespace(completions=completions)
    return SimpleNamespace(chat=chat)


def _base_state() -> dict[str, Any]:
    return {
        "edinet_code": "E99999",
        "company_name_jp": "XYZ株式会社",
        "company_name_en": "XYZ Corp",
        "fiscal_year": 2024,
        "pass1": {"事業等のリスク": {"red_flags": [], "numerical_claims": []}},
        "raw_tables": {"bs": {"a": 1}, "pl": {"b": 2}, "cf": {"c": 3}},
    }


def test_default_profiles_are_five_unique_validated_entries() -> None:
    """The shipped catalogue must be exactly five well-formed profiles."""
    assert len(DEFAULT_PROFILES) == 5
    names = [p.name for p in DEFAULT_PROFILES]
    assert len(set(names)) == 5
    validate_profiles(DEFAULT_PROFILES)
    for profile in DEFAULT_PROFILES:
        assert isinstance(profile, DecoderProfile)


def test_validate_profile_rejects_out_of_range_temperature() -> None:
    bad = DecoderProfile(
        name="bad",
        temperature=0.0,
        top_p=0.9,
        repetition_penalty=1.1,
        no_repeat_ngram_size=0,
    )
    with pytest.raises(ValueError, match="temperature"):
        validate_profile(bad)


def test_memo_critic_picks_highest_judge_score() -> None:
    """Five candidates with judge scores [3, 4, 5, 4, 3] must pick index 2."""
    candidates = [
        "memo zero (ref: 'a' p.1)",
        "memo one (ref: 'b' p.1)",
        "memo two (ref: 'c' p.1)",
        "memo three (ref: 'd' p.1)",
        "memo four (ref: 'e' p.1)",
    ]
    inference = _RecordingClient(candidates)
    judge = _judge_client(["3", "4", "5", "4", "3"])

    state = memo_critic(
        _base_state(),
        client=inference,
        judge="judge",
        judge_client=judge,
    )

    assert state["pass2_draft"] == "memo two (ref: 'c' p.1)"
    assert state["picked_index"] == 2
    assert state["picked_profile"] == DEFAULT_PROFILES[2].name
    assert state["candidate_scores"] == [3.0, 4.0, 5.0, 4.0, 3.0]
    assert state["judge_mode"] == "judge"
    # Each candidate ran with a distinct decoder profile.
    seen_generations = [call["generation"] for call in inference.calls]
    assert len(seen_generations) == 5
    assert all("temperature" in gen for gen in seen_generations)


def test_memo_critic_heuristic_fallback_when_no_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``judge='auto'`` falls back to the heuristic when the API key is absent."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    weak = "tiny memo"
    strong = (
        "Executive summary section.\n\n"
        "Going-concern note (ref: 'span1' p.1).\n\n"
        "Accrual quality (ref: 'span2' p.2).\n\n"
        "Earnings direction up (ref: 'span3' p.3).\n\n"
        "Top 3 risks (ref: 'span4' p.4).\n\n"
        "Related-party disclosed (ref: 'span5' p.5).\n\n"
        "Evidence appendix (ref: 'span6' p.6).\n\n"
        + ("padding word " * 600)
    )
    candidates = [weak, strong, weak, weak, weak]
    inference = _RecordingClient(candidates)

    state = memo_critic(
        _base_state(),
        client=inference,
        judge="auto",
    )

    assert state["judge_mode"] == "heuristic"
    assert state["picked_index"] == 1
    assert state["pass2_draft"] == strong
    assert heuristic_score(strong) > heuristic_score(weak)


def test_memo_critic_writes_diagnostic_state_fields() -> None:
    """The critic must populate the contract fields downstream code reads."""
    inference = _RecordingClient(["memo a", "memo b", "memo c", "memo d", "memo e"])
    state = memo_critic(
        _base_state(),
        client=inference,
        judge="heuristic",
    )

    assert "candidates" in state and len(state["candidates"]) == 5
    assert "candidate_scores" in state and len(state["candidate_scores"]) == 5
    assert "candidate_profiles" in state and len(state["candidate_profiles"]) == 5
    assert state["candidate_profiles"] == [p.name for p in DEFAULT_PROFILES]
    assert state["picked_profile"] in state["candidate_profiles"]
    assert "pass2_draft" in state and state["pass2_draft"] in state["candidates"]


def test_pick_best_breaks_ties_to_lower_index() -> None:
    """Equal scores must resolve to the first candidate (lowest index)."""
    profiles = list(DEFAULT_PROFILES[:3])
    idx, memo, score, name = pick_best(
        ["one", "two", "three"], [4.0, 4.0, 4.0], profiles
    )
    assert idx == 0
    assert memo == "one"
    assert score == 4.0
    assert name == profiles[0].name


def test_memo_critic_rejects_missing_tables_by_default() -> None:
    """Strict ``require_tables`` must reject empty BS/PL/CF before generation."""
    state = _base_state()
    state["raw_tables"] = {}
    inference = _RecordingClient(["should-never-be-called"] * 5)

    with pytest.raises(ValueError, match="raw_tables"):
        memo_critic(state, client=inference, judge="heuristic")
    assert inference.calls == []


def test_memo_critic_allows_missing_tables_when_opted_in() -> None:
    """``require_tables=False`` must permit degraded-mode runs."""
    state = _base_state()
    state["raw_tables"] = {}
    inference = _RecordingClient(["a", "b", "c", "d", "e"])

    memo_critic(
        state,
        client=inference,
        judge="heuristic",
        require_tables=False,
    )
    assert len(inference.calls) == 5


def test_memo_critic_falls_back_when_judge_first_call_raises() -> None:
    """An auth/transport failure on the first judge call must not abort the run."""

    def boom(*, model: str, messages: list[dict[str, str]]) -> Any:
        raise RuntimeError("simulated 401 AuthenticationError")

    judge = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=boom))
    )
    inference = _RecordingClient(["a", "b", "c", "d", "e"])

    state = memo_critic(
        _base_state(),
        client=inference,
        judge="judge",
        judge_client=judge,
    )

    assert state["judge_mode"] == "heuristic"
    assert state["judge_fallback_reason"].startswith("judge_unavailable:")
    assert state["pass2_draft"] in {"a", "b", "c", "d", "e"}


def test_memo_critic_falls_back_when_judge_returns_no_finite_scores() -> None:
    """All-unparsed judge replies must trigger the heuristic fallback."""
    judge = _judge_client(["", "", "", "", ""])
    inference = _RecordingClient(["a", "b", "c", "d", "e"])

    state = memo_critic(
        _base_state(),
        client=inference,
        judge="judge",
        judge_client=judge,
    )

    assert state["judge_mode"] == "heuristic"
    assert state["judge_fallback_reason"] == "judge_returned_no_finite_scores"


def test_judge_scores_raises_when_first_call_fails() -> None:
    """``judge_scores`` must surface a hard failure as JudgeUnavailableError."""
    from yuholens.agents.memo_critic import judge_scores

    def boom(*, model: str, messages: list[dict[str, str]]) -> Any:
        raise RuntimeError("network down")

    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=boom))
    )
    with pytest.raises(JudgeUnavailableError):
        judge_scores(["x"], client=client)
