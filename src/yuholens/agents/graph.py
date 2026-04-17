"""Four-agent LangGraph pipeline skeleton.

Nodes (in build-spec §11):
    1. ``ingestor``        — PDF/XBRL parse + Japanese section split.
    2. ``pass1_detect``    — red-flag detector, one vLLM call per section.
    3. ``pass2_compose``   — cross-reference-aware English memo composer.
    4. ``ground``          — strip every memo claim that lacks a pass-1 span.

The single vLLM-ROCm process backs all four nodes; agents differ only in
system prompts. Nothing here calls the model yet — scaffolding only.
"""

from __future__ import annotations

from typing import Any, TypedDict


class PipelineState(TypedDict, total=False):
    """Shared LangGraph state across the four agents."""

    yuho_path: str
    edinet_code: str
    fiscal_year: int
    raw_text: str
    sections: dict[str, str]
    raw_tables: dict[str, Any]
    pass1: dict[str, dict[str, Any]]
    pass2_draft: str
    grounded_memo: str


def build_pipeline() -> Any:
    """Compile and return the four-agent LangGraph application.

    Raises:
        ImportError: If ``langgraph`` is not installed. Import is lazy so
            that the module can be introspected without the heavy runtime
            dependency.
    """
    from langgraph.graph import END, StateGraph

    graph: StateGraph = StateGraph(PipelineState)
    graph.add_node("ingestor", _ingestor_stub)
    graph.add_node("pass1_detect", _pass1_stub)
    graph.add_node("pass2_compose", _pass2_stub)
    graph.add_node("ground", _ground_stub)

    graph.set_entry_point("ingestor")
    graph.add_edge("ingestor", "pass1_detect")
    graph.add_edge("pass1_detect", "pass2_compose")
    graph.add_edge("pass2_compose", "ground")
    graph.add_edge("ground", END)
    return graph.compile()


def _ingestor_stub(state: PipelineState) -> PipelineState:
    raise NotImplementedError("Implement during Week 2 Day 18-19")


def _pass1_stub(state: PipelineState) -> PipelineState:
    raise NotImplementedError("Implement during Week 2 Day 18-19")


def _pass2_stub(state: PipelineState) -> PipelineState:
    raise NotImplementedError("Implement during Week 2 Day 18-19")


def _ground_stub(state: PipelineState) -> PipelineState:
    raise NotImplementedError("Implement during Week 2 Day 18-19")


__all__ = ["PipelineState", "build_pipeline"]
