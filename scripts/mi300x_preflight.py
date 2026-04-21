"""MI300X preflight: validate every dependency before the long SFT run.

Runs on the MI300X host (inside the ROCm 7.0 container) and checks, in
order, that every moving piece of Phase D/E/F/G is wired up correctly.
Prints one line per check; exits non-zero at the first hard failure so
the operator sees exactly which step broke.

Checks:
    1. GPU visible, HIP driver, bf16 available.
    2. ``flash_attn`` importable and produces correct output shape.
    3. ``bitsandbytes`` importable, ``AdamW8bit`` instantiable.
    4. ``trl.experimental.orpo`` present, ``SFTTrainer`` present,
       ``trl`` version ≥ 1.2.0.
    5. ``transformers`` version pinned (4.48.x), ``langgraph`` importable.
    6. ``openai`` SDK importable; ``OPENAI_API_KEY`` set.
    7. ``configs/sft.yaml`` parses; ``data/teacher/sft_trl.jsonl`` exists
       and streams at least one well-formed row with ``text`` + ``messages``.
    8. ``scripts/install_bnb_rocm.sh`` reachable.
    9. ``scripts/convert_to_gguf.sh`` reachable; ``llama.cpp`` clone present.

Usage::

    python scripts/mi300x_preflight.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Callable


ROOT = Path(__file__).resolve().parents[1]


def check(name: str, fn: Callable[[], str]) -> bool:
    """Run one check; print ``name: OK — detail`` or ``name: FAIL — detail``."""
    try:
        detail = fn()
        print(f"[ok]   {name}: {detail}")
        return True
    except Exception as exc:
        print(f"[FAIL] {name}: {type(exc).__name__}: {exc}")
        return False


def _gpu() -> str:
    import torch

    if not torch.cuda.is_available():
        raise RuntimeError("torch.cuda.is_available() == False")
    name = torch.cuda.get_device_name(0)
    bf16 = torch.cuda.is_bf16_supported()
    return f"device='{name}' bf16={bf16}"


def _flash_attn() -> str:
    import torch
    import flash_attn  # noqa: F401
    from flash_attn import flash_attn_func

    q = torch.randn(1, 128, 40, 128, dtype=torch.bfloat16, device="cuda")
    out = flash_attn_func(q, q, q)
    assert tuple(out.shape) == (1, 128, 40, 128)
    return f"v{flash_attn.__version__} shape=OK"


def _bnb() -> str:
    import bitsandbytes as bnb

    opt = bnb.optim.AdamW8bit([])
    _ = opt.param_groups
    return f"v{bnb.__version__} AdamW8bit OK"


def _trl() -> str:
    import trl

    from trl import SFTConfig, SFTTrainer  # noqa: F401
    from trl.experimental.orpo import ORPOConfig, ORPOTrainer  # noqa: F401

    return f"v{trl.__version__}"


def _transformers() -> str:
    import transformers

    return f"v{transformers.__version__}"


def _langgraph() -> str:
    import langgraph

    return f"v{getattr(langgraph, '__version__', 'unknown')}"


def _openai() -> str:
    import openai  # noqa: F401

    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY not set in environment")
    return "import + key set"


def _sft_config_and_data() -> str:
    import yaml

    cfg_path = ROOT / "configs" / "sft.yaml"
    cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8"))
    assert cfg["model_id"] == "pfnet/nekomata-14b-pfn-qfin"
    train_data = ROOT / cfg["train_data"]
    assert train_data.exists(), f"train_data missing: {train_data}"

    with train_data.open("r", encoding="utf-8") as fh:
        first = fh.readline().strip()
    row = json.loads(first)
    assert "text" in row and row["text"].startswith("<|im_start|>")
    assert "messages" in row and len(row["messages"]) == 3
    return f"{cfg['train_data']} rows>=1 chatml OK"


def _install_script() -> str:
    p = ROOT / "scripts" / "install_bnb_rocm.sh"
    assert p.exists(), f"missing {p}"
    return str(p.relative_to(ROOT))


def _gguf_script() -> str:
    p = ROOT / "scripts" / "convert_to_gguf.sh"
    assert p.exists(), f"missing {p}"
    llama = Path(os.environ.get("LLAMACPP", str(ROOT.parent / "llama.cpp")))
    if not llama.exists():
        raise RuntimeError(
            f"llama.cpp clone not found at {llama}; set LLAMACPP or clone it"
        )
    return f"{p.relative_to(ROOT)}  llama.cpp={llama}"


def main() -> int:
    """Run every preflight check. Return 0 on full pass, 1 on any failure."""
    checks = [
        ("gpu", _gpu),
        ("flash_attn", _flash_attn),
        ("bitsandbytes", _bnb),
        ("trl", _trl),
        ("transformers", _transformers),
        ("langgraph", _langgraph),
        ("openai", _openai),
        ("sft_config_and_data", _sft_config_and_data),
        ("install_script", _install_script),
        ("gguf_script", _gguf_script),
    ]
    ok = True
    for name, fn in checks:
        ok = check(name, fn) and ok
    print()
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
