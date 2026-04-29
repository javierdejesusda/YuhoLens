"""Upload the YuhoLens-14B GGUF release set to a HuggingFace repo.

Companion to ``scripts/hf_upload.py``. Pushes the five quantized GGUF
artefacts produced by ``scripts/build_gguf.sh`` to a dedicated
HuggingFace repo (default: ``yuholens/yuholens-14b-GGUF``) along with a
README.md model card. The f16 intermediate is intentionally excluded —
it is a build artefact, not a release artefact.

The script does not authenticate on its own. The operator is expected
to have run ``huggingface-cli login`` (or set ``HF_TOKEN``) before
invoking this script.

Usage:
    python scripts/hf_upload_gguf.py \
        --gguf-dir data/eval/gguf \
        --readme docs/gguf_readme.md \
        --hf-repo yuholens/yuholens-14b-GGUF
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
import tempfile
from pathlib import Path

EXPECTED_QUANTS: tuple[str, ...] = (
    "Q3_K_M",
    "Q4_K_M",
    "Q5_K_M",
    "Q6_K",
    "Q8_0",
)

GGUF_NAME_PATTERN = re.compile(r"^yuholens-14b-(?P<quant>[A-Za-z0-9_]+)\.gguf$")


def discover_gguf_files(gguf_dir: Path) -> dict[str, Path]:
    """Return a {quant: path} map of release-eligible GGUFs in ``gguf_dir``.

    The f16 intermediate (``yuholens-14b-f16.gguf``) is filtered out so
    that re-running an upload after a partial cleanup does not push the
    28 GB intermediate.
    """
    found: dict[str, Path] = {}
    for path in sorted(gguf_dir.glob("yuholens-14b-*.gguf")):
        match = GGUF_NAME_PATTERN.match(path.name)
        if not match:
            continue
        quant = match.group("quant")
        if quant.lower() == "f16":
            continue
        found[quant] = path
    return found


def verify_release_set(found: dict[str, Path]) -> list[str]:
    """Return a list of human-readable problems with the discovered set."""
    problems: list[str] = []
    for quant in EXPECTED_QUANTS:
        if quant not in found:
            problems.append(f"missing {quant}: expected yuholens-14b-{quant}.gguf")
    extras = sorted(set(found) - set(EXPECTED_QUANTS))
    if extras:
        problems.append(f"unexpected quants present: {extras}")
    for quant, path in found.items():
        size = path.stat().st_size
        if size < 1_000_000_000:
            problems.append(
                f"{quant} is suspiciously small at {size} bytes; rebuild?"
            )
    return problems


def stage_release(
    gguf_dir: Path, readme: Path, *, stage_dir: Path
) -> None:
    """Copy release-eligible GGUFs and README into ``stage_dir``."""
    stage_dir.mkdir(parents=True, exist_ok=True)
    found = discover_gguf_files(gguf_dir)
    for quant, path in found.items():
        shutil.copy2(path, stage_dir / path.name)
    shutil.copy2(readme, stage_dir / "README.md")


def upload_to_hub(
    stage_dir: Path,
    hf_repo: str,
    *,
    commit_message: str,
    private: bool,
) -> None:
    """Upload ``stage_dir`` to ``hf_repo`` via the HuggingFace Hub API."""
    from huggingface_hub import HfApi

    api = HfApi()
    api.create_repo(repo_id=hf_repo, exist_ok=True, private=private)
    api.upload_folder(
        folder_path=str(stage_dir),
        repo_id=hf_repo,
        commit_message=commit_message,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--gguf-dir",
        type=Path,
        default=Path("data/eval/gguf"),
        help="Directory containing the built GGUF release set.",
    )
    parser.add_argument(
        "--readme",
        type=Path,
        default=Path("docs/gguf_readme.md"),
        help="Path to the README.md to publish alongside the GGUFs.",
    )
    parser.add_argument(
        "--hf-repo",
        type=str,
        default="yuholens/yuholens-14b-GGUF",
        help="Target HuggingFace repo.",
    )
    parser.add_argument(
        "--private",
        action="store_true",
        help="Create the repo as private if it does not yet exist.",
    )
    parser.add_argument(
        "--commit-message",
        type=str,
        default="release: YuhoLens-14B GGUF set (Q3_K_M..Q8_0)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Verify and stage but do not push to the Hub.",
    )
    args = parser.parse_args()

    if not args.gguf_dir.is_dir():
        print(f"error: --gguf-dir {args.gguf_dir} not found", file=sys.stderr)
        return 2
    if not args.readme.is_file():
        print(f"error: --readme {args.readme} not found", file=sys.stderr)
        return 2

    found = discover_gguf_files(args.gguf_dir)
    problems = verify_release_set(found)
    print("[hf-upload-gguf] discovered:")
    for quant in sorted(found):
        size_mb = found[quant].stat().st_size / 1024**2
        print(f"  {quant:<8s} {size_mb:8.0f} MB  {found[quant].name}")
    if problems:
        print("[hf-upload-gguf] FAIL: release set has problems:")
        for line in problems:
            print(f"  - {line}")
        return 1
    print("[hf-upload-gguf] release set OK")

    if args.dry_run:
        print("[hf-upload-gguf] --dry-run set; not staging or pushing")
        return 0

    with tempfile.TemporaryDirectory(prefix="yuholens-gguf-") as tmp:
        stage_dir = Path(tmp)
        stage_release(args.gguf_dir, args.readme, stage_dir=stage_dir)
        print(f"[hf-upload-gguf] staged into {stage_dir}")
        upload_to_hub(
            stage_dir,
            args.hf_repo,
            commit_message=args.commit_message,
            private=args.private,
        )
    print(f"[hf-upload-gguf] pushed -> {args.hf_repo}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
