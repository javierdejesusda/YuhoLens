"""Allow ``python -m yuholens.agents`` to invoke the operator CLI."""

from __future__ import annotations

import sys

from yuholens.agents.cli import main

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
