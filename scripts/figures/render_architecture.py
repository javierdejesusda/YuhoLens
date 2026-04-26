"""Render the 4-agent LangGraph architecture as a static PNG.

The README uses a mermaid block which renders inside GitHub but not on
PyPI / HuggingFace / arXiv. This script emits an equivalent static
diagram via matplotlib so the model card and the demo deck can embed
the same visual on platforms without mermaid support.

Output goes to ``docs/figures/architecture.png`` by default. The PNG
is committed alongside the source so editors and HuggingFace consumers
do not need matplotlib installed.

Usage:
    pip install matplotlib  # or: pip install -e .[release]
    python scripts/figures/render_architecture.py
"""

from __future__ import annotations

import argparse
from pathlib import Path

NODES: tuple[tuple[str, str, str], ...] = (
    ("Ingestor", "regex section split\nJP -> labelled spans", "#1f6feb"),
    ("Pass-1 Detector", "per-section vLLM call\nstructured JSON", "#1f6feb"),
    ("MemoCriticAgent", "best-of-N composer\njudge or heuristic pick", "#cf222e"),
    ("Citation Grounder", "verify every span\nor [evidence insufficient]", "#238636"),
)


def render(out_path: Path, *, dpi: int) -> None:
    """Render the architecture figure to ``out_path``.

    Args:
        out_path: PNG output path.
        dpi: Output resolution.

    Raises:
        ImportError: When matplotlib is not installed.
    """
    import matplotlib.pyplot as plt
    from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

    fig, ax = plt.subplots(figsize=(13, 4.5))
    ax.set_xlim(0, 14)
    ax.set_ylim(0, 5)
    ax.axis("off")

    box_width = 2.6
    box_height = 2.2
    gap = 0.6
    start_x = 0.7

    for index, (title, subtitle, colour) in enumerate(NODES):
        x = start_x + index * (box_width + gap)
        y = 1.4
        box = FancyBboxPatch(
            (x, y),
            box_width,
            box_height,
            boxstyle="round,pad=0.08",
            linewidth=2.0,
            edgecolor=colour,
            facecolor="white",
        )
        ax.add_patch(box)
        ax.text(
            x + box_width / 2,
            y + box_height - 0.55,
            title,
            ha="center",
            va="center",
            fontsize=12,
            fontweight="bold",
            color=colour,
        )
        ax.text(
            x + box_width / 2,
            y + box_height / 2 - 0.2,
            subtitle,
            ha="center",
            va="center",
            fontsize=9.5,
            color="#1f2328",
        )

    for index in range(len(NODES) - 1):
        x_left = start_x + index * (box_width + gap) + box_width
        x_right = start_x + (index + 1) * (box_width + gap)
        y_mid = 1.4 + box_height / 2
        arrow = FancyArrowPatch(
            (x_left, y_mid),
            (x_right, y_mid),
            arrowstyle="->",
            mutation_scale=18,
            linewidth=1.5,
            color="#57606a",
        )
        ax.add_patch(arrow)

    ax.text(
        7.0,
        4.5,
        "YuhoLens-14B  -  4-agent LangGraph composer",
        ha="center",
        va="center",
        fontsize=14,
        fontweight="bold",
        color="#1f2328",
    )
    ax.text(
        7.0,
        0.6,
        "Pure orchestration on top of one fine-tuned 14B model. "
        "Abstention is a first-class output, not a failure mode.",
        ha="center",
        va="center",
        fontsize=10,
        style="italic",
        color="#57606a",
    )

    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=dpi, bbox_inches="tight")
    plt.close(fig)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("docs/figures/architecture.png"),
    )
    parser.add_argument("--dpi", type=int, default=144)
    args = parser.parse_args()

    render(args.out, dpi=args.dpi)
    print(f"[figures] wrote {args.out} (dpi={args.dpi})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
