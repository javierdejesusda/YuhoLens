"""Pre-release artefact checker for a YuhoLens checkpoint directory.

Validates the invariants that gate a HuggingFace release:

    1. Required tokenizer files are present.
    2. ``generation_config.json`` matches the v5 defaults
       (temperature 0.1, top_p 0.9, repetition_penalty 1.15,
       no_repeat_ngram_size 0). Run ``scripts/hf_upload.py --skip-upload``
       to repair this in place.
    3. Model weights are present (any of pytorch_model*.bin,
       model*.safetensors, or model.safetensors.index.json).
    4. ``config.json`` carries the expected base architecture
       (``QWenLMHeadModel``).

The exit code is 0 when every check passes, 1 otherwise. The script
never modifies the checkpoint — repair is the operator's job.
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
}

REQUIRED_TOKENIZER_FILES: tuple[str, ...] = (
    "tokenizer_config.json",
    "tokenization_qwen.py",
)

WEIGHT_GLOBS: tuple[str, ...] = (
    "pytorch_model*.bin",
    "model*.safetensors",
    "model.safetensors.index.json",
)


def check_tokenizer(model_path: Path) -> list[str]:
    """Return a list of tokenizer files that are missing from ``model_path``."""
    return [name for name in REQUIRED_TOKENIZER_FILES if not (model_path / name).exists()]


def check_weights(model_path: Path) -> bool:
    """Return True when at least one weight artefact exists in ``model_path``."""
    for pattern in WEIGHT_GLOBS:
        if any(model_path.glob(pattern)):
            return True
    return False


def check_generation_config(model_path: Path) -> tuple[bool, list[str]]:
    """Return ``(ok, mismatches)`` for the v5 generation_config invariant."""
    config_path = model_path / "generation_config.json"
    if not config_path.exists():
        return False, ["generation_config.json missing"]
    config = json.loads(config_path.read_text(encoding="utf-8"))
    mismatches: list[str] = []
    for key, expected in V5_GENERATION_CONFIG.items():
        actual = config.get(key)
        if actual != expected:
            mismatches.append(f"{key}: expected {expected!r}, got {actual!r}")
    return not mismatches, mismatches


def check_arch(model_path: Path) -> tuple[bool, str]:
    """Return ``(ok, detail)`` for the expected Qwen1 architecture string."""
    config_path = model_path / "config.json"
    if not config_path.exists():
        return False, "config.json missing"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    archs = config.get("architectures", []) or []
    if "QWenLMHeadModel" not in archs:
        return False, f"unexpected architectures={archs}"
    return True, ",".join(archs)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model-path",
        type=Path,
        required=True,
        help="Local checkpoint directory.",
    )
    args = parser.parse_args(argv)

    if not args.model_path.is_dir():
        print(
            f"FAIL: --model-path {args.model_path} is not a directory",
            file=sys.stderr,
        )
        return 1

    ok = True

    missing_tokenizer = check_tokenizer(args.model_path)
    if missing_tokenizer:
        ok = False
        print(f"FAIL: tokenizer files missing: {missing_tokenizer}")
    else:
        print(f"OK:   tokenizer files present ({len(REQUIRED_TOKENIZER_FILES)})")

    if not check_weights(args.model_path):
        ok = False
        print(f"FAIL: no weight artefacts (looked for {WEIGHT_GLOBS})")
    else:
        print("OK:   weight artefacts present")

    gen_ok, mismatches = check_generation_config(args.model_path)
    if gen_ok:
        print("OK:   generation_config.json matches v5 defaults")
    else:
        ok = False
        for line in mismatches:
            print(f"FAIL: generation_config: {line}")
        print(
            "      hint: run `python scripts/hf_upload.py "
            f"--model-path {args.model_path} --hf-repo placeholder --skip-upload`"
        )

    arch_ok, arch_detail = check_arch(args.model_path)
    if arch_ok:
        print(f"OK:   config.architectures includes QWenLMHeadModel ({arch_detail})")
    else:
        ok = False
        print(f"FAIL: config.json: {arch_detail}")

    print()
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
