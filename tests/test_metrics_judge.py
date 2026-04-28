"""Tests for the gpt-5-mini Likert judge_coherence metric."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from yuholens.eval import metrics as metrics_mod
from yuholens.eval.metrics import judge_coherence


def _fake_client(
    contents: list[str],
    exceptions: list[BaseException] | None = None,
) -> SimpleNamespace:
    """Build an OpenAI-shaped fake client that returns scripted assistant content.

    Args:
        contents: Assistant ``message.content`` strings returned in order.
            Once exhausted, the final value is repeated indefinitely.
        exceptions: Optional list of exceptions to raise before the first
            successful response. Each entry consumes one call to
            ``chat.completions.create``.

    Returns:
        A ``SimpleNamespace`` whose ``chat.completions.create`` returns an
        object shaped like an OpenAI chat-completions response, plus a
        ``state`` namespace exposing the call count for assertions.
    """
    errors = list(exceptions or [])
    queue = list(contents)
    state = {"calls": 0, "last_model": None, "last_messages": None}

    def create(*, model: str, messages: list[dict[str, str]]) -> SimpleNamespace:
        state["calls"] += 1
        state["last_model"] = model
        state["last_messages"] = messages
        if errors:
            raise errors.pop(0)
        if not queue:
            raise AssertionError("fake client: no more scripted responses")
        content = queue.pop(0) if len(queue) > 1 else queue[0]
        return SimpleNamespace(
            choices=[
                SimpleNamespace(message=SimpleNamespace(content=content))
            ]
        )

    completions = SimpleNamespace(create=create)
    chat = SimpleNamespace(completions=completions)
    return SimpleNamespace(chat=chat, state=state)


def test_judge_coherence_returns_mean_of_parsed_integers() -> None:
    client = _fake_client(["4", "3", "5"])
    memos = ["memo one", "memo two", "memo three"]

    score = judge_coherence(memos, client=client)

    assert score == pytest.approx(4.0, abs=1e-6)
    assert client.state["calls"] == 3


def test_judge_coherence_skips_unparseable_responses() -> None:
    client = _fake_client(["4", "no number here", "2"])
    memos = ["memo one", "memo two", "memo three"]

    score = judge_coherence(memos, client=client, min_parse_rate=0.5)

    assert score == pytest.approx(3.0, abs=1e-6)
    assert client.state["calls"] == 3


def test_judge_coherence_raises_when_parse_rate_too_low() -> None:
    client = _fake_client(["4", "no number here", "also no number"])
    memos = ["memo one", "memo two", "memo three"]

    with pytest.raises(ValueError, match="parse rate"):
        judge_coherence(memos, client=client, min_parse_rate=0.9)


def test_judge_coherence_returns_zero_on_empty_input() -> None:
    client = _fake_client([])

    score = judge_coherence([], client=client)

    assert score == pytest.approx(0.0, abs=1e-6)
    assert client.state["calls"] == 0


def test_judge_coherence_retries_transient_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(metrics_mod.time, "sleep", lambda _s: None)

    client = _fake_client(
        ["5"], exceptions=[RuntimeError("transient network glitch")]
    )

    score = judge_coherence(["x"], client=client)

    assert score == pytest.approx(5.0, abs=1e-6)
    assert client.state["calls"] == 2


def _fake_anthropic_client(
    contents: list[str],
) -> SimpleNamespace:
    """Build an Anthropic-shaped fake client returning scripted text blocks.

    Args:
        contents: ``response.content[0].text`` strings returned in order.
            Once exhausted, the final value is repeated.

    Returns:
        ``SimpleNamespace`` exposing ``messages.create`` with the same
        keyword shape as ``anthropic.Anthropic.messages.create`` and a
        ``state`` dict for assertions.
    """
    queue = list(contents)
    state: dict[str, Any] = {"calls": 0, "last_model": None, "last_max_tokens": None}

    def create(  # noqa: D103
        *,
        model: str,
        max_tokens: int,
        system: str,
        messages: list[dict[str, str]],
    ) -> SimpleNamespace:
        state["calls"] += 1
        state["last_model"] = model
        state["last_max_tokens"] = max_tokens
        state["last_system"] = system
        state["last_messages"] = messages
        if not queue:
            raise AssertionError("fake anthropic client: no more scripted responses")
        text = queue.pop(0) if len(queue) > 1 else queue[0]
        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text=text)],
            stop_reason="end_turn",
        )

    messages_ns = SimpleNamespace(create=create)
    return SimpleNamespace(messages=messages_ns, state=state)


def test_judge_coherence_dispatches_to_anthropic_engine() -> None:
    """engine='anthropic' calls messages.create and parses the integer reply."""
    client = _fake_anthropic_client(["4", "5", "3"])
    memos = ["alpha memo", "beta memo", "gamma memo"]

    score = judge_coherence(memos, engine="anthropic", client=client)

    assert score == pytest.approx(4.0, abs=1e-6)
    assert client.state["calls"] == 3
    assert client.state["last_model"] == "claude-opus-4-7"


def test_judge_coherence_anthropic_respects_explicit_model() -> None:
    """An explicit model= overrides the claude-opus-4-7 default for anthropic."""
    client = _fake_anthropic_client(["5"])

    judge_coherence(
        ["solo memo"], engine="anthropic", model="claude-sonnet-4-6", client=client
    )

    assert client.state["last_model"] == "claude-sonnet-4-6"


def test_judge_coherence_anthropic_skips_unparseable_replies() -> None:
    """Unparseable Anthropic replies are excluded from the mean (matches openai)."""
    client = _fake_anthropic_client(["4", "no number here", "3"])
    memos = ["a", "b", "c"]

    score = judge_coherence(
        memos,
        engine="anthropic",
        client=client,
        min_parse_rate=0.5,
    )

    assert score == pytest.approx(3.5, abs=1e-6)


def test_judge_coherence_rejects_unknown_engine() -> None:
    """Unknown engine values raise ValueError before any client call."""
    with pytest.raises(ValueError, match="unknown judge engine"):
        judge_coherence(
            ["x"], engine="bedrock", client=object()  # type: ignore[arg-type]
        )
