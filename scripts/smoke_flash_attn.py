"""Day-1 smoke: verify flash-attn is importable and functional on ROCm.

Run inside the AMD Developer Cloud MI300X instance using AMD's
``rocm/pytorch:rocm7.0_ubuntu24.04_py3.12_pytorch_release_2.5.1`` image, in
which flash-attn ROCm is pre-installed.

Prints the detected version and the output shape of a single flash_attn
call on a bf16 tensor matched to nekomata-14b's attention heads.
"""

from __future__ import annotations

import sys

HEADS = 40
HEAD_DIM = 128
SEQ = 128


def main() -> int:
    """Run the smoke test.

    Returns:
        0 on success; non-zero on failure.
    """
    try:
        import torch
    except ImportError:
        print("torch not installed", file=sys.stderr)
        return 1

    try:
        import flash_attn
        from flash_attn import flash_attn_func
    except ImportError as exc:
        print(f"flash_attn import failed: {exc}", file=sys.stderr)
        print(
            "Use AMD's rocm/pytorch image or build flash-attn from "
            "ROCm/flash-attention; do NOT install upstream flash-attn "
            "(CUDA-only wheels).",
            file=sys.stderr,
        )
        return 2

    if not torch.cuda.is_available():
        print("torch.cuda.is_available() == False — no HIP device detected", file=sys.stderr)
        return 3

    print(f"flash_attn version: {flash_attn.__version__}")
    q = torch.randn(1, SEQ, HEADS, HEAD_DIM, dtype=torch.bfloat16, device="cuda")
    k = torch.randn_like(q)
    v = torch.randn_like(q)
    out = flash_attn_func(q, k, v)
    print(f"flash_attn_func output shape: {tuple(out.shape)}")
    assert out.shape == q.shape, "flash_attn shape mismatch"
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
