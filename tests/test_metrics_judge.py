"""Tests for the gpt-5-mini Likert judge_coherence metric."""

from __future__ import annotations

from types import SimpleNamespace

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

    score = judge_coherence(memos, client=client)

    assert score == pytest.approx(3.0, abs=1e-6)
    assert client.state["calls"] == 3


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
