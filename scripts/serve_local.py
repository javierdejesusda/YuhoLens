"""Local FastAPI demo server for the YuhoLens 4-agent composer.

This script is the demo-day surface for the live walkthrough described
in ``docs/demo_script.md``. It binds to ``127.0.0.1`` by default and
ships without authentication, so do not expose it to the public
internet. Use a reverse proxy with auth if you need a remote demo.

Endpoints:

    POST /compose
        Request body:
            {
              "yuho_path": "/abs/path/to/yuho.txt",
              "edinet_code": "E12345",
              "fiscal_year": 2024,
              "company_name_jp": "...",
              "company_name_en": "...",
              "raw_tables": {"bs": {...}, "pl": {...}, "cf": {...}},
              "best_of_n": true,
              "n_candidates": 5,
              "judge_mode": "auto"
            }
        Response: the full pipeline state including grounded_memo,
        candidate_scores, picked_profile, and orphan_spans.

    GET  /health
        Returns ``{"status": "ok"}`` when the LangGraph compiles.

Usage:
    pip install fastapi uvicorn  # or: pip install -e .[serve]
    python scripts/serve_local.py --host 127.0.0.1 --port 8765 \
        --best-of-n --judge-mode heuristic

The FastAPI / uvicorn imports are deferred so this file remains
importable in a checkout without the optional ``[serve]`` extras
installed; missing dependencies raise a clear
:class:`SystemExit` with install instructions.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any


def _require_serve_extras() -> tuple[Any, Any]:
    try:
        import fastapi
        import uvicorn
    except ImportError as exc:
        raise SystemExit(
            "scripts/serve_local.py needs fastapi + uvicorn. Install with:\n"
            "    pip install -e .[serve]\n"
            "or:\n"
            "    pip install fastapi uvicorn"
        ) from exc
    return fastapi, uvicorn


def build_app(
    *,
    best_of_n: bool,
    n_candidates: int | None,
    judge_mode: str,
) -> Any:
    """Construct the FastAPI app and bind a single ``/compose`` route.

    Args:
        best_of_n: When True, the composer fans out across the
            DEFAULT_PROFILES decoder catalogue.
        n_candidates: Optional truncation of the catalogue length.
        judge_mode: One of ``"auto"``, ``"judge"``, ``"heuristic"``.

    Returns:
        The configured FastAPI application instance.
    """
    fastapi, _ = _require_serve_extras()
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel, Field

    from yuholens.agents.graph import build_pipeline

    class ComposeRequest(BaseModel):
        yuho_path: str = Field(..., description="Path to the Yuho text file.")
        edinet_code: str = ""
        fiscal_year: int = 2024
        company_name_jp: str = ""
        company_name_en: str = ""
        raw_tables: dict[str, Any] = Field(default_factory=dict)

    app = FastAPI(
        title="YuhoLens local demo",
        version="0.1.0",
        description="Local-only FastAPI front-end for the LangGraph composer.",
    )
    pipeline = build_pipeline(
        best_of_n=best_of_n,
        n_candidates=n_candidates,
        judge_mode=judge_mode,
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/compose")
    def compose(request: ComposeRequest) -> dict[str, Any]:
        try:
            result = pipeline.invoke(request.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return {
            "grounded_memo": result.get("grounded_memo"),
            "orphan_spans": result.get("orphan_spans", []),
            "candidate_scores": result.get("candidate_scores"),
            "candidate_profiles": result.get("candidate_profiles"),
            "picked_profile": result.get("picked_profile"),
            "judge_mode": result.get("judge_mode"),
            "judge_fallback_reason": result.get("judge_fallback_reason"),
        }

    return app


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--best-of-n", action="store_true")
    parser.add_argument("--n-candidates", type=int, default=None)
    parser.add_argument(
        "--judge-mode",
        choices=("auto", "judge", "heuristic"),
        default="auto",
    )
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args(argv)

    if args.host not in ("127.0.0.1", "localhost"):
        print(
            "[serve] WARNING: binding to a non-loopback host. This server "
            "ships without authentication; do not expose it to the public "
            "internet without a reverse proxy.",
            file=sys.stderr,
        )

    _, uvicorn = _require_serve_extras()
    app = build_app(
        best_of_n=args.best_of_n,
        n_candidates=args.n_candidates,
        judge_mode=args.judge_mode,
    )
    uvicorn.run(app, host=args.host, port=args.port, reload=args.reload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
