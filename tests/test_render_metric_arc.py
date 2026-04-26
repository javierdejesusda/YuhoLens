"""Tests for the metric-arc figure renderer.

The actual matplotlib render path is not exercised in CI because the
package is not in the test deps; instead we verify the data table
that drives the chart is the one shipped across the project's
narrative docs.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "figures" / "render_metric_arc.py"


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "render_metric_arc_under_test", SCRIPT_PATH
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_metric_arc_data_matches_kg2_pass_narrative() -> None:
    """The committed data points must match the docs and the README."""
    module = _load_module()
    stages = module.STAGES
    assert len(stages) == 4

    expected = [
        ("v5\nsingle-shot", 3.56, "SOFT"),
        ("best-of-2\nv4+v5 mixed", 3.72, "SOFT"),
        ("best-of-3\nsame-decoder seeds", 3.64, "SOFT"),
        ("best-of-5\nmixed + seeds", 3.88, "PASS"),
    ]
    assert stages == tuple(expected)
    assert module.GATE == 3.80


def test_metric_arc_pass_gate_is_below_winner() -> None:
    """The PASS-marked stage must clear the gate; SOFT stages must not."""
    module = _load_module()
    for label, value, verdict in module.STAGES:
        if verdict == "PASS":
            assert value >= module.GATE, f"PASS stage {label} below gate"
        else:
            assert value < module.GATE, f"SOFT stage {label} above gate"
