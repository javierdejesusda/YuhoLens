"""Patch a YuhoLens checkpoint's generation_config and push it to HF Hub.

This script is the operator-side helper for the HuggingFace release. It does
two things, in order:

    1. Rewrites ``generation_config.json`` inside ``--model-path`` to the v5
       defaults committed in ``src/yuholens/eval/run_kg2.py``: temperature
       0.1, top_p 0.9, repetition_penalty 1.15, no_repeat_ngram_size 0,
       do_sample True, max_new_tokens 4096. These match the single-shot
       fallback recipe documented in ``docs/model-card.md``.
    2. Uploads the entire ``--model-path`` folder to ``--hf-repo`` via
       :func:`huggingface_hub.HfApi.upload_folder`.

No HuggingFace token is read from the environment by this script — the
operator is expected to have run ``huggingface-cli login`` (or equivalent)
beforehand. The script refuses to run when ``--model-path`` is missing the
tokenizer files that downstream consumers rely on.

Usage:
    python scripts/hf_upload.py \
        --model-path output/yuholens-14b-sft/checkpoint-212 \
        --hf-repo yuholens/yuholens-14b
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

V5_GENERATION_CONFIG: dict[str, object] = {
    "do_sample": True,
    "temperature": 0.1,
    "top_p": 0.9,
    "repetition_penalty": 1.15,
    "no_repeat_ngram_size": 0,
    "max_new_tokens": 4096,
}

REQUIRED_TOKENIZER_FILES: tuple[str, ...] = (
    "tokenizer_config.json",
    "tokenization_qwen.py",
)


def patch_generation_config(model_path: Path) -> Path:
    """Write v5 sampling defaults into ``generation_config.json``.

    Existing keys outside the v5 set are preserved so EOS / pad token
    overrides committed by the trainer survive the patch.

    Args:
        model_path: Directory containing the HuggingFace checkpoint.

    Returns:
        The path to the patched ``generation_config.json``.
    """
    config_path = model_path / "generation_config.json"
    if config_path.exists():
        existing = json.loads(config_path.read_text(encoding="utf-8"))
    else:
        existing = {}
    existing.update(V5_GENERATION_CONFIG)
    config_path.write_text(
        json.dumps(existing, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return config_path


def verify_tokenizer_present(model_path: Path) -> None:
    """Refuse to upload checkpoints missing tokenizer artefacts.

    Args:
        model_path: Directory containing the HuggingFace checkpoint.

    Raises:
        FileNotFoundError: If any file in ``REQUIRED_TOKENIZER_FILES`` is
            missing from ``model_path``.
    """
    missing = [
        name
        for name in REQUIRED_TOKENIZER_FILES
        if not (model_path / name).exists()
    ]
    if missing:
        raise FileNotFoundError(
            f"checkpoint at {model_path} is missing tokenizer files: {missing}"
        )


def upload_to_hub(
    model_path: Path,
    hf_repo: str,
    *,
    commit_message: str,
    private: bool,
) -> None:
    """Upload ``model_path`` to ``hf_repo`` via the HuggingFace Hub API.

    Args:
        model_path: Directory containing the patched HuggingFace checkpoint.
        hf_repo: Target repo identifier, e.g. ``"yuholens/yuholens-14b"``.
        commit_message: Commit message recorded on the Hub.
        private: When True, create the repo as private if it does not yet
            exist. Existing repos retain their visibility.
    """
    from huggingface_hub import HfApi

    api = HfApi()
    api.create_repo(repo_id=hf_repo, exist_ok=True, private=private)
    api.upload_folder(
        folder_path=str(model_path),
        repo_id=hf_repo,
        commit_message=commit_message,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model-path",
        type=Path,
        required=True,
        help="Local checkpoint directory (HuggingFace layout).",
    )
    parser.add_argument(
        "--hf-repo",
        type=str,
        required=True,
        help="Target HuggingFace repo, e.g. 'yuholens/yuholens-14b'.",
    )
    parser.add_argument(
        "--private",
        action="store_true",
        help="Create the repo as private if it does not yet exist.",
    )
    parser.add_argument(
        "--commit-message",
        type=str,
        default="release: YuhoLens-14B checkpoint with v5 generation_config",
    )
    parser.add_argument(
        "--skip-upload",
        action="store_true",
        help="Patch generation_config.json only; do not push to the Hub.",
    )
    args = parser.parse_args()

    if not args.model_path.is_dir():
        print(
            f"error: --model-path {args.model_path} is not a directory",
            file=sys.stderr,
        )
        return 2

    verify_tokenizer_present(args.model_path)
    patched = patch_generation_config(args.model_path)
    print(f"[hf-upload] patched {patched}")

    if args.skip_upload:
        print("[hf-upload] --skip-upload set; not pushing")
        return 0

    upload_to_hub(
        args.model_path,
        args.hf_repo,
        commit_message=args.commit_message,
        private=args.private,
    )
    print(f"[hf-upload] pushed {args.model_path} -> {args.hf_repo}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
