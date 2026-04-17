"""Four-agent LangGraph pipeline for YuhoLens.

Nodes (in build-spec §11):
    1. ``ingestor``        — PDF/XBRL parse + Japanese section split.
    2. ``pass1_detect``    — red-flag detector, one vLLM call per section.
    3. ``pass2_compose``   — cross-reference-aware English memo composer.
    4. ``ground``          — strip every memo claim that lacks a pass-1 span.

All four nodes share a single vLLM-ROCm backing process; they differ only in
system prompts. The ``InferenceClient`` protocol abstracts the HTTP call so
tests can inject a deterministic fake without touching the network.
"""

from __future__ import annotations

import json
from functools import partial
from pathlib import Path
from typing import Any, Callable, Protocol, TypedDict

from yuholens.agents.citation_grounder import verify_memo
from yuholens.ingestor import SectionSpan, split_yuho
from yuholens.prompts.pass1 import PASS1_SYSTEM, PASS1_USER_TEMPLATE
from yuholens.prompts.pass2 import PASS2_SYSTEM, PASS2_USER_TEMPLATE

_PASS1_SECTION_CHAR_CAP: int = 11500
_PASS1_MAX_TOKENS: int = 1500
_PASS2_MAX_TOKENS: int = 3000
_DEFAULT_BASE_URL: str = "http://localhost:8000/v1"
_DEFAULT_MODEL: str = "yuholens/yuholens-14b"
_DEFAULT_API_KEY: str = "EMPTY"


class InferenceClient(Protocol):
    """Minimal structural interface every inference backend must satisfy."""

    def complete(self, *, system: str, user: str, max_tokens: int = 2048) -> str:
        """Run a single chat completion and return the raw string response.

        Args:
            system: The system-role prompt.
            user: The user-role prompt.
            max_tokens: Upper bound on generated tokens. Default 2048.

        Returns:
            The assistant message content as a plain string.
        """


class VLLMClient:
    """OpenAI-compatible client targeting a local vLLM-ROCm endpoint.

    vLLM-ROCm exposes an OpenAI-compatible HTTP API, so the production client
    is a thin wrapper around ``openai.OpenAI`` pointed at ``base_url``. The
    ``openai`` import is deferred to first call so that the module imports
    cheaply in environments where the SDK is absent (e.g. CI).

    Attributes:
        base_url: The vLLM HTTP endpoint, defaulting to localhost port 8000.
        model: The served model identifier.
        api_key: A placeholder token; vLLM ignores authentication.
    """

    def __init__(
        self,
        *,
        base_url: str = _DEFAULT_BASE_URL,
        model: str = _DEFAULT_MODEL,
        api_key: str = _DEFAULT_API_KEY,
    ) -> None:
        self.base_url = base_url
        self.model = model
        self.api_key = api_key

    def complete(self, *, system: str, user: str, max_tokens: int = 2048) -> str:
        """Dispatch a single chat completion through the OpenAI SDK.

        Args:
            system: The system-role prompt.
            user: The user-role prompt.
            max_tokens: Upper bound on generated tokens.

        Returns:
            The assistant message content; an empty string when the server
            returns no content payload.
        """
        from openai import OpenAI

        client = OpenAI(base_url=self.base_url, api_key=self.api_key)
        response = client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_completion_tokens=max_tokens,
        )
        content = response.choices[0].message.content
        return content or ""


DEFAULT_CLIENT_FACTORY: Callable[[], InferenceClient] = VLLMClient


class PipelineState(TypedDict, total=False):
    """Shared LangGraph state across the four agents."""

    yuho_path: str
    edinet_code: str
    fiscal_year: int
    company_name_jp: str
    company_name_en: str
    raw_text: str
    sections: dict[str, SectionSpan]
    raw_tables: dict[str, Any]
    pass1: dict[str, dict[str, Any]]
    pass2_draft: str
    grounded_memo: str
    orphan_spans: list[str]


Loader = Callable[[str], tuple[str, dict[str, Any]]]


def _default_loader(path: str) -> tuple[str, dict[str, Any]]:
    """Load a Yuho row from disk as plain UTF-8 text with no tables.

    PDF/XBRL extraction is out of scope at this stage — EDINET-Bench rows are
    shipped with pre-extracted text. Live PDF ingestion is a Phase-G concern.

    Args:
        path: Absolute or relative path to the Yuho text file.

    Returns:
        A ``(raw_text, raw_tables)`` tuple. ``raw_tables`` is the empty dict
        when no table payload is bundled with the text file.
    """
    raw_text = Path(path).read_text(encoding="utf-8")
    return raw_text, {}


def _ingestor(
    state: PipelineState,
    *,
    loader: Loader | None = None,
) -> PipelineState:
    """Load the source Yuho and split it into labelled Japanese sections.

    Args:
        state: Current pipeline state; ``yuho_path`` must be set.
        loader: Optional callable overriding the default disk loader. Signature
            is ``(path: str) -> (raw_text: str, raw_tables: dict[str, Any])``.
            Tests inject a fake loader to keep filesystem access out of the
            unit tests.

    Returns:
        The updated state with ``raw_text``, ``raw_tables``, and ``sections``
        populated.

    Raises:
        KeyError: If ``state`` does not contain ``yuho_path``.
    """
    active_loader = loader or _default_loader
    path = state["yuho_path"]
    raw_text, raw_tables = active_loader(path)
    sections = split_yuho(raw_text)

    state["raw_text"] = raw_text
    state["raw_tables"] = raw_tables
    state["sections"] = sections
    return state


def _section_key_jp(key: str, span: SectionSpan) -> str:
    """Return the label most suitable for use in Pass-1 prompts.

    Args:
        key: The stable section identifier from ``split_yuho``.
        span: The detected span carrying an optional human-readable label.

    Returns:
        ``span.label`` when set and non-empty; otherwise the raw key.
    """
    return span.label if span.label else key


def _pass1_detect(
    state: PipelineState,
    *,
    client: InferenceClient | None = None,
) -> PipelineState:
    """Run the Pass-1 red-flag detector once per detected section.

    The preamble section is skipped because it carries no analyst-actionable
    content; every other section is rendered through
    ``PASS1_USER_TEMPLATE`` and dispatched to the inference client. When the
    model returns invalid JSON, a minimal record with an ``_parse_error`` key
    is stored so downstream nodes can still proceed.

    Args:
        state: Current pipeline state with ``sections`` populated by
            :func:`_ingestor`.
        client: Optional inference client. Defaults to :class:`VLLMClient`
            constructed lazily when ``None``.

    Returns:
        The updated state with ``pass1`` populated. Keys are the Japanese
        section labels (or the raw key when no label is set).
    """
    active_client = client if client is not None else DEFAULT_CLIENT_FACTORY()
    pass1: dict[str, dict[str, Any]] = {}

    company_name_jp = state.get("company_name_jp", "")
    edinet_code = state.get("edinet_code", "")
    fiscal_year = state.get("fiscal_year", "")

    sections = state.get("sections", {})
    for key, span in sections.items():
        if key == "preamble":
            continue
        section_label = _section_key_jp(key, span)
        user_prompt = PASS1_USER_TEMPLATE.format(
            company_name_jp=company_name_jp,
            edinet_code=edinet_code,
            fiscal_year=fiscal_year,
            section_key_jp=section_label,
            section_text=span.text[:_PASS1_SECTION_CHAR_CAP],
        )
        system_prompt = PASS1_SYSTEM.format(section_key_jp=section_label)
        raw = active_client.complete(
            system=system_prompt,
            user=user_prompt,
            max_tokens=_PASS1_MAX_TOKENS,
        )

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            parsed = {
                "section": section_label,
                "red_flags": [],
                "numerical_claims": [],
                "section_summary_ja": "",
                "_parse_error": str(exc),
            }

        pass1[section_label] = parsed

    state["pass1"] = pass1
    return state


def _pass2_compose(
    state: PipelineState,
    *,
    client: InferenceClient | None = None,
) -> PipelineState:
    """Run the Pass-2 composer to draft an English investor memo.

    Args:
        state: Current state with ``pass1`` populated by :func:`_pass1_detect`.
        client: Optional inference client. Defaults to :class:`VLLMClient`
            constructed lazily when ``None``.

    Returns:
        The updated state with ``pass2_draft`` populated with the raw
        composer output.
    """
    active_client = client if client is not None else DEFAULT_CLIENT_FACTORY()
    pass1_blocks = json.dumps(state.get("pass1", {}), ensure_ascii=False, indent=2)

    raw_tables = state.get("raw_tables", {}) or {}
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

    draft = active_client.complete(
        system=PASS2_SYSTEM,
        user=user_prompt,
        max_tokens=_PASS2_MAX_TOKENS,
    )
    state["pass2_draft"] = draft
    return state


def _ground(state: PipelineState) -> PipelineState:
    """Verify every memo citation against the Pass-1 span index.

    Args:
        state: Current state with ``pass2_draft`` and ``pass1`` populated.

    Returns:
        The updated state with ``grounded_memo`` (the cleaned memo) and
        ``orphan_spans`` (ungrounded citations in first-seen order) set.
    """
    memo = state.get("pass2_draft", "")
    pass1_blocks = state.get("pass1", {})
    grounded_memo, orphan_spans = verify_memo(memo, pass1_blocks)
    state["grounded_memo"] = grounded_memo
    state["orphan_spans"] = orphan_spans
    return state


def build_pipeline(
    *,
    client: InferenceClient | None = None,
    loader: Loader | None = None,
) -> Any:
    """Compile and return the four-agent LangGraph application.

    Args:
        client: Optional inference client shared by Pass-1 and Pass-2.
            Production callers pass ``None`` to get a lazily constructed
            :class:`VLLMClient`.
        loader: Optional loader for the ingestor node. Defaults to reading
            UTF-8 text from the filesystem.

    Returns:
        A compiled LangGraph application with entry point ``ingestor``.

    Raises:
        ImportError: If ``langgraph`` is not installed. The import is lazy so
            the module remains introspectable without the heavy runtime
            dependency.
    """
    from langgraph.graph import END, StateGraph

    ingestor_node = partial(_ingestor, loader=loader)
    pass1_node = partial(_pass1_detect, client=client)
    pass2_node = partial(_pass2_compose, client=client)

    graph: StateGraph = StateGraph(PipelineState)
    graph.add_node("ingestor", ingestor_node)
    graph.add_node("pass1_detect", pass1_node)
    graph.add_node("pass2_compose", pass2_node)
    graph.add_node("ground", _ground)

    graph.set_entry_point("ingestor")
    graph.add_edge("ingestor", "pass1_detect")
    graph.add_edge("pass1_detect", "pass2_compose")
    graph.add_edge("pass2_compose", "ground")
    graph.add_edge("ground", END)
    return graph.compile()


__all__ = [
    "DEFAULT_CLIENT_FACTORY",
    "InferenceClient",
    "PipelineState",
    "VLLMClient",
    "build_pipeline",
]
