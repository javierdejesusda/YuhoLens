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

for tool in cmake git make pip; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "[install_bnb_rocm] ERROR: required tool '${tool}' not found in PATH" >&2
    exit 1
  fi
done

mkdir -p "${build_dir}"
cd "${build_dir}"

# Clone with submodules (bitsandbytes/cpu_ops is required for the build).
# Re-run safe: refresh if the target is already a valid clone of this remote+branch.
clone_dir="bitsandbytes"
if [[ -d "${clone_dir}/.git" ]] \
    && [[ "$(git -C "${clone_dir}" config --get remote.origin.url || true)" == "${repo_url}" ]]; then
  git -C "${clone_dir}" fetch --depth 1 origin "${repo_branch}"
  git -C "${clone_dir}" reset --hard FETCH_HEAD
  git -C "${clone_dir}" submodule update --init --recursive --depth 1
else
  rm -rf "${clone_dir}"
  git clone \
    --branch "${repo_branch}" \
    --recurse-submodules \
    --depth 1 \
    "${repo_url}" \
    "${clone_dir}"
fi

cd "${clone_dir}"

# The rocm_enabled branch has dropped requirements-dev.txt in favor of pyproject
# build-system deps; only install if the file still exists.
if [[ -f requirements-dev.txt ]]; then
  pip install -r requirements-dev.txt
else
  echo "[install_bnb_rocm] requirements-dev.txt absent; relying on build-system deps"
fi

cmake -DCOMPUTE_BACKEND=hip -DBNB_ROCM_ARCH="${rocm_arch}" -S .
make -j "$(nproc)"
pip install .

# Smoke verification: import bnb and instantiate the 8-bit AdamW optimizer.
# PyTorch 2.5+ rejects empty parameter lists, so we pass a 1-element dummy tensor.
if ! python -c "
import torch, bitsandbytes as bnb
print(f'bnb version: {bnb.__version__}')
p = torch.nn.Parameter(torch.zeros(1, device='cuda' if torch.cuda.is_available() else 'cpu'))
opt = bnb.optim.AdamW8bit([p])
print('AdamW8bit OK')
"; then
  echo "[install_bnb_rocm] ERROR: bitsandbytes smoke verification failed" >&2
  exit 1
fi

echo "[install_bnb_rocm] done — gfx942 source build complete"
