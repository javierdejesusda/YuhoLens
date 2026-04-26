"""Tests for the pre-release checkpoint validator."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "check_release_set.py"


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "check_release_set_under_test", SCRIPT_PATH
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_good_checkpoint(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    (path / "tokenizer_config.json").write_text("{}", encoding="utf-8")
    (path / "tokenization_qwen.py").write_text("# stub", encoding="utf-8")
    (path / "model.safetensors.index.json").write_text("{}", encoding="utf-8")
    (path / "config.json").write_text(
        json.dumps({"architectures": ["QWenLMHeadModel"]}),
        encoding="utf-8",
    )
    (path / "generation_config.json").write_text(
        json.dumps(
            {
                "do_sample": True,
                "temperature": 0.1,
                "top_p": 0.9,
                "repetition_penalty": 1.15,
                "no_repeat_ngram_size": 0,
            }
        ),
        encoding="utf-8",
    )


def test_check_release_passes_for_complete_checkpoint(tmp_path: Path) -> None:
    ckpt = tmp_path / "ckpt"
    _make_good_checkpoint(ckpt)

    module = _load_module()
    rc = module.main(["--model-path", str(ckpt)])
    assert rc == 0


def test_check_release_fails_when_generation_config_drifts(tmp_path: Path) -> None:
    ckpt = tmp_path / "ckpt"
    _make_good_checkpoint(ckpt)
    (ckpt / "generation_config.json").write_text(
        json.dumps(
            {
                "do_sample": True,
                "temperature": 0.7,
                "top_p": 0.9,
                "repetition_penalty": 1.15,
                "no_repeat_ngram_size": 0,
            }
        ),
        encoding="utf-8",
    )

    module = _load_module()
    rc = module.main(["--model-path", str(ckpt)])
    assert rc == 1


def test_check_release_fails_when_tokenizer_missing(tmp_path: Path) -> None:
    ckpt = tmp_path / "ckpt"
    _make_good_checkpoint(ckpt)
    (ckpt / "tokenizer_config.json").unlink()

    module = _load_module()
    rc = module.main(["--model-path", str(ckpt)])
    assert rc == 1
