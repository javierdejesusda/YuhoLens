"""Smoke test that the README quickstart actually runs.

The README points new users at one canonical command:

    python -m yuholens.agents \
        --yuho-row data/sample/sample_yuho.jsonl --row-index 0 \
        --best-of-n --n-candidates 5 --judge-mode heuristic

This test invokes that command in a subprocess and asserts a clean
exit. The intent is to catch documentation bit-rot — if the CLI
contract drifts (flag rename, default change, sample fixture moves),
this test fails before the README does.

The pipeline is exercised with the heuristic scorer so no OpenAI key
is required. The fake-inference path is provided by patching the
default client factory at the module level inside the subprocess
through a small launcher fixture; the test does not touch the live
inference backend.
"""

from __future__ import annotations

import os
import subprocess
import sys
import textwrap
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_readme_quickstart_invocation_exits_zero(tmp_path: Path) -> None:
    """The CLI must accept the README command and exit with status 0."""
    sample_path = REPO_ROOT / "data" / "sample" / "sample_yuho.jsonl"
    assert sample_path.exists(), f"missing sample fixture at {sample_path}"

    yuho_text = tmp_path / "yuho.txt"
    yuho_text.write_text(
        "XYZ株式会社 有価証券報告書\n\n"
        "事業等のリスク\n当社は為替変動リスクにさらされています。\n\n"
        "関連当事者との取引\n主要株主との取引額は2024年度で1,200百万円でした。\n",
        encoding="utf-8",
    )

    launcher = tmp_path / "_run_quickstart.py"
    launcher.write_text(
        textwrap.dedent(
            """
            import sys

            from yuholens.agents import graph as graph_module

            class _StubInferenceClient:
                _PASS1_RESPONSE = (
                    '{"section": "test", "red_flags": [], '
                    '"numerical_claims": [], "section_summary_ja": "stub"}'
                )
                _PASS2_RESPONSE = (
                    "Executive summary stub.\\n\\n"
                    "Going-concern stub.\\n\\n"
                    "Accrual quality stub.\\n\\n"
                    "Earnings direction stub.\\n\\n"
                    "Top 3 risks stub.\\n\\n"
                    "Related-party stub.\\n\\n"
                    "Evidence appendix stub.\\n"
                )

                def complete(self, *, system, user, max_tokens=2048, generation=None):
                    if "JSON" in system or "json" in system.lower():
                        return self._PASS1_RESPONSE
                    return self._PASS2_RESPONSE

            graph_module.DEFAULT_CLIENT_FACTORY = _StubInferenceClient

            from yuholens.agents.cli import main

            sys.exit(main(sys.argv[1:]))
            """
        ),
        encoding="utf-8",
    )

    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT / "src")
    env.pop("OPENAI_API_KEY", None)

    proc = subprocess.run(
        [
            sys.executable,
            str(launcher),
            "--yuho-path",
            str(yuho_text),
            "--yuho-row",
            str(sample_path),
            "--row-index",
            "0",
            "--best-of-n",
            "--n-candidates",
            "5",
            "--judge-mode",
            "heuristic",
        ],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )

    assert proc.returncode == 0, (
        f"quickstart exited {proc.returncode}\n"
        f"stdout:\n{proc.stdout}\n"
        f"stderr:\n{proc.stderr}"
    )
    assert "Grounded memo" in proc.stdout
