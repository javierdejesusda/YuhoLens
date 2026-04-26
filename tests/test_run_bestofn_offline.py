"""Tests for the offline heuristic-only best-of-N picker script."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "run_bestofn_offline.py"


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "run_bestofn_offline_under_test", SCRIPT_PATH
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_jsonl(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def test_offline_picker_picks_higher_heuristic_score(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Across two candidate sets, the higher-scoring memo per cid must win."""
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
    set_a = tmp_path / "a.jsonl"
    set_b = tmp_path / "b.jsonl"
    _write_jsonl(set_a, [{"custom_id": "row-1", "memo": weak}])
    _write_jsonl(set_b, [{"custom_id": "row-1", "memo": strong}])

    picked_memos = tmp_path / "picked.jsonl"
    picked_scores = tmp_path / "picked.json"

    module = _load_module()
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "run_bestofn_offline.py",
            "--memos",
            str(set_a),
            str(set_b),
            "--picked-memos",
            str(picked_memos),
            "--picked-scores",
            str(picked_scores),
            "--labels",
            "a",
            "b",
        ],
    )
    rc = module.main()
    assert rc == 0

    rows = [json.loads(line) for line in picked_memos.read_text(encoding="utf-8").splitlines() if line]
    assert len(rows) == 1
    assert rows[0]["custom_id"] == "row-1"
    assert rows[0]["memo"] == strong

    scores = json.loads(picked_scores.read_text(encoding="utf-8"))
    assert scores[0]["source"] == "b"
    assert scores[0]["heuristic_score"] > 0


def test_offline_picker_skips_missing_custom_ids(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A custom_id missing from every set should be reported as skipped."""
    set_a = tmp_path / "a.jsonl"
    _write_jsonl(set_a, [{"custom_id": "row-1", "memo": "memo a"}])

    picked_memos = tmp_path / "picked.jsonl"
    picked_scores = tmp_path / "picked.json"

    module = _load_module()
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "run_bestofn_offline.py",
            "--memos",
            str(set_a),
            "--picked-memos",
            str(picked_memos),
            "--picked-scores",
            str(picked_scores),
        ],
    )
    rc = module.main()
    assert rc == 0
    assert picked_memos.exists()
    assert picked_scores.exists()
