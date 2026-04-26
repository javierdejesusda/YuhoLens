"""Argparse + state-construction tests for the agents CLI.

The CLI is a thin wrapper around ``build_pipeline``; these tests cover the
parts that *do* live in the CLI: argument parsing, JSONL row loading, and
the initial-state mapping. The pipeline invocation itself is covered by
``test_agents_e2e.py`` and ``test_memo_critic.py``.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from yuholens.agents import cli


def test_read_yuho_row_returns_decoded_jsonl(tmp_path: Path) -> None:
    rows_path = tmp_path / "rows.jsonl"
    rows_path.write_text(
        json.dumps({"edinet_code": "E00000", "fiscal_year": 2024}) + "\n"
        + json.dumps({"edinet_code": "E11111", "fiscal_year": 2025}) + "\n",
        encoding="utf-8",
    )
    row = cli._read_yuho_row(rows_path, 1)
    assert row["edinet_code"] == "E11111"
    assert row["fiscal_year"] == 2025


def test_read_yuho_row_raises_on_out_of_range(tmp_path: Path) -> None:
    rows_path = tmp_path / "rows.jsonl"
    rows_path.write_text(json.dumps({"edinet_code": "E00000"}) + "\n", encoding="utf-8")
    with pytest.raises(IndexError):
        cli._read_yuho_row(rows_path, 5)


def test_build_initial_state_from_row(tmp_path: Path) -> None:
    rows_path = tmp_path / "rows.jsonl"
    rows_path.write_text(
        json.dumps(
            {
                "edinet_code": "E12345",
                "fiscal_year": 2023,
                "company_name_jp": "テスト株式会社",
                "company_name_en": "Test Corp",
                "raw_tables": {"bs": {"a": 1}},
            }
        ) + "\n",
        encoding="utf-8",
    )
    parser = _build_parser()
    args = parser.parse_args(["--yuho-row", str(rows_path), "--row-index", "0"])
    state = cli._build_initial_state(args)
    assert state["edinet_code"] == "E12345"
    assert state["fiscal_year"] == 2023
    assert state["company_name_jp"] == "テスト株式会社"
    assert state["raw_tables"] == {"bs": {"a": 1}}


def test_build_initial_state_requires_yuho_path_when_no_row() -> None:
    parser = _build_parser()
    args = parser.parse_args([])
    with pytest.raises(SystemExit):
        cli._build_initial_state(args)


def _build_parser():
    """Mirror ``cli.main`` argparse setup so unit tests don't run main()."""
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--yuho-path", type=Path, default=None)
    parser.add_argument("--yuho-row", type=Path, default=None)
    parser.add_argument("--row-index", type=int, default=0)
    parser.add_argument("--edinet-code", type=str, default=None)
    parser.add_argument("--fiscal-year", type=int, default=None)
    parser.add_argument("--company-name-jp", type=str, default=None)
    parser.add_argument("--company-name-en", type=str, default=None)
    return parser
