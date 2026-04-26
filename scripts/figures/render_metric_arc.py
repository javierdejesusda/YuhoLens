"""Render the KG-2 coherence metric arc as a PNG figure.

The four data points are committed to the project narrative across
``docs/blog_post.md``, ``docs/model-card.md``, ``docs/demo_script.md``,
and ``README.md``: v5 single-shot 3.56 → best-of-2 3.72 →
best-of-3 same-seed 3.64 → best-of-5 mixed 3.88 PASS.

Output goes to ``docs/figures/metric_arc.png`` by default. The file is
not committed automatically; the operator regenerates it on demand
because matplotlib's PNG output is not byte-stable across versions.

Usage:
    pip install matplotlib  # or: pip install -e .[release]
    python scripts/figures/render_metric_arc.py
"""

from __future__ import annotations

import argparse
from pathlib import Path

STAGES: tuple[tuple[str, float, str], ...] = (
    ("v5\nsingle-shot", 3.56, "SOFT"),
    ("best-of-2\nv4+v5 mixed", 3.72, "SOFT"),
    ("best-of-3\nsame-decoder seeds", 3.64, "SOFT"),
    ("best-of-5\nmixed + seeds", 3.88, "PASS"),
)
GATE: float = 3.80


def render(out_path: Path, *, dpi: int) -> None:
    """Render the metric-arc figure to ``out_path``.

    Args:
        out_path: PNG output path.
        dpi: Output resolution.

    Raises:
        ImportError: When matplotlib is not installed; the operator should
            ``pip install -e .[release]`` to pull it in.
    """
    import matplotlib.pyplot as plt

    labels = [stage[0] for stage in STAGES]
    values = [stage[1] for stage in STAGES]
    verdicts = [stage[2] for stage in STAGES]

    fig, ax = plt.subplots(figsize=(10, 5.5))
    ax.plot(
        range(len(STAGES)),
        values,
        marker="o",
        markersize=10,
        linewidth=2.0,
        color="#1f6feb",
    )
    for index, (value, verdict) in enumerate(zip(values, verdicts)):
        colour = "#238636" if verdict == "PASS" else "#9a6700"
        ax.annotate(
            f"{value:.2f}\n{verdict}",
            xy=(index, value),
            xytext=(0, 14),
            textcoords="offset points",
            ha="center",
            color=colour,
            fontsize=11,
            fontweight="bold",
        )
    ax.axhline(GATE, color="#cf222e", linestyle="--", linewidth=1.2)
    ax.text(
        len(STAGES) - 1,
        GATE,
        f"  PASS gate {GATE:.2f}",
        color="#cf222e",
        fontsize=10,
        va="center",
        ha="left",
    )

    ax.set_xticks(range(len(STAGES)))
    ax.set_xticklabels(labels, fontsize=10)
    ax.set_ylabel("Mean KG-2 coherence (gpt-5-mini Likert 1-5)", fontsize=11)
    ax.set_ylim(3.3, 4.05)
    ax.set_title(
        "YuhoLens-14B — KG-2 coherence arc\nbest-of-N inference-time picker closes the gate",
        fontsize=13,
        fontweight="bold",
        pad=14,
    )
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="y", linestyle=":", alpha=0.5)

    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=dpi, bbox_inches="tight")
    plt.close(fig)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("docs/figures/metric_arc.png"),
    )
    parser.add_argument("--dpi", type=int, default=144)
    args = parser.parse_args()

    render(args.out, dpi=args.dpi)
    print(f"[figures] wrote {args.out} (dpi={args.dpi})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
