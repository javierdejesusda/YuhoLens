"""Console-script wrapper for ``scripts/check_release_set.py``."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load() -> object:
    repo_root = Path(__file__).resolve().parents[3]
    script = repo_root / "scripts" / "check_release_set.py"
    spec = importlib.util.spec_from_file_location("yuholens_check_release", script)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to locate {script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main(argv: list[str] | None = None) -> int:
    """Forward to ``scripts/check_release_set.py:main``.

    Args:
        argv: Optional argument vector forwarded to the wrapped script's
            argparse setup. When ``None``, ``sys.argv[1:]`` is used.

    Returns:
        The wrapped script's exit code.
    """
    module = _load()
    return module.main(argv)  # type: ignore[attr-defined]


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
