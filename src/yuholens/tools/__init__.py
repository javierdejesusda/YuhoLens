"""Console-script entry points wrapping the standalone scripts/ runners.

Each module exposes a ``main`` callable that the ``[project.scripts]``
table in ``pyproject.toml`` points at. The wrappers locate the
corresponding ``scripts/*.py`` file by repo-relative path and import it
via ``runpy``-style module loading so that there is exactly one source
of truth per tool.

This indirection exists because ``scripts/`` is intentionally outside
the installed package (the files are runnable in a checkout via
``python scripts/foo.py``). Pip-installed users get the same behaviour
through the ``yuholens-foo`` console scripts.
"""
