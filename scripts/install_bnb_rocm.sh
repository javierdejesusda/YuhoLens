#!/usr/bin/env bash
set -euo pipefail

# Source-build bitsandbytes for ROCm 7.0 on MI300X (gfx942).
# No prebuilt wheel exists for ROCm 7.0 + gfx942, so we compile from the
# ROCm/bitsandbytes rocm_enabled branch.
# Intended to run inside the rocm/pytorch:rocm7.0_ubuntu24.04_py3.12_pytorch_release_2.5.1
# container — not on Windows. Assumes pip points to the container's python3.12.

build_dir="${1:-/tmp/bnb-build}"
repo_url="https://github.com/ROCm/bitsandbytes.git"
repo_branch="rocm_enabled"
rocm_arch="gfx942"

mkdir -p "${build_dir}"
cd "${build_dir}"

# Clone with submodules (bitsandbytes/cpu_ops is required for the build).
git clone \
  --branch "${repo_branch}" \
  --recurse-submodules \
  --depth 1 \
  "${repo_url}" \
  bitsandbytes

cd bitsandbytes

pip install -r requirements-dev.txt

cmake -DCOMPUTE_BACKEND=hip -DBNB_ROCM_ARCH="${rocm_arch}" -S .
make -j "$(nproc)"
pip install .

# Smoke verification: import bnb and instantiate the 8-bit AdamW optimizer.
if ! python -c "import bitsandbytes as bnb; print(f'bnb version: {bnb.__version__}'); opt = bnb.optim.AdamW8bit([]); print('AdamW8bit OK')"; then
  echo "[install_bnb_rocm] ERROR: bitsandbytes smoke verification failed" >&2
  exit 1
fi

echo "[install_bnb_rocm] done — gfx942 source build complete"
