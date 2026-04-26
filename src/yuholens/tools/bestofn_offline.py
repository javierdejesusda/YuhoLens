"""Console-script wrapper for ``scripts/run_bestofn_offline.py``."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load() -> object:
    repo_root = Path(__file__).resolve().parents[3]
    script = repo_root / "scripts" / "run_bestofn_offline.py"
    spec = importlib.util.spec_from_file_location("yuholens_bestofn_offline", script)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to locate {script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main(argv: list[str] | None = None) -> int:
    """Forward to ``scripts/run_bestofn_offline.py:main``."""
    if argv is not None:
        sys.argv = ["yuholens-bestofn-offline", *argv]
    module = _load()
    return module.main()  # type: ignore[attr-defined]


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
