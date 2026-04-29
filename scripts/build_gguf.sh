#!/usr/bin/env bash
#
# Build the YuhoLens-14B GGUF release set from a HuggingFace checkpoint.
#
# Two-directory layout:
#   - LLAMACPP_REPO: the cloned llama.cpp repo (provides convert_hf_to_gguf.py).
#   - LLAMACPP_BIN:  the directory holding the llama-quantize binary. May be
#                    the repo's build/bin (when llama.cpp is built from source)
#                    OR a flat directory of prebuilt Windows binaries (which
#                    is what ggml-org publishes on the GitHub releases page).
#
#   When LLAMACPP_BIN is unset it auto-derives to "$LLAMACPP_REPO/build/bin".
#   Both the bare ("llama-quantize") and the .exe ("llama-quantize.exe") name
#   are probed, so the same script works on Linux source builds and on
#   Windows prebuilt-binary checkouts.
#
# Required tools the operator must install BEFORE running:
#   - python with `gguf` and `safetensors` packages (pip install gguf
#     safetensors).
#   - llama.cpp cloned somewhere readable (default ../llama.cpp).
#   - A llama-quantize binary, either built from source or unzipped from
#     the official prebuilt Windows release.
#   - At least 80 GB free disk for a 14B model (f16 intermediate + 5 quants).
#
# Usage:
#   scripts/build_gguf.sh <checkpoint_dir> [output_dir]
#
# Defaults:
#   - output_dir defaults to <checkpoint_dir> when omitted.
#   - LLAMACPP_REPO defaults to ../llama.cpp.
#   - LLAMACPP_BIN defaults to $LLAMACPP_REPO/build/bin.
#
# This script does not run automatically. Operator runs it after the HF
# checkpoint is downloaded locally; the resulting GGUFs are uploaded to
# yuholens/yuholens-14b-GGUF via huggingface-cli upload.

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: $0 <checkpoint_dir> [output_dir]" >&2
  exit 64
fi

CKPT="$1"
OUT_DIR="${2:-$CKPT}"

if [[ ! -d "$CKPT" ]]; then
  echo "error: checkpoint dir '$CKPT' not found" >&2
  exit 66
fi

mkdir -p "$OUT_DIR"

# Back-compat: legacy LLAMACPP env var maps to LLAMACPP_REPO.
LLAMACPP_REPO="${LLAMACPP_REPO:-${LLAMACPP:-../llama.cpp}}"
LLAMACPP_BIN="${LLAMACPP_BIN:-$LLAMACPP_REPO/build/bin}"
CONVERT_SCRIPT="$LLAMACPP_REPO/convert_hf_to_gguf.py"

resolve_quant_bin() {
  for candidate in "$LLAMACPP_BIN/llama-quantize" "$LLAMACPP_BIN/llama-quantize.exe"; do
    if [[ -f "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

if [[ ! -f "$CONVERT_SCRIPT" ]]; then
  echo "error: convert script not found at $CONVERT_SCRIPT" >&2
  echo "       set LLAMACPP_REPO=/path/to/llama.cpp clone" >&2
  exit 66
fi

if ! QUANT_BIN="$(resolve_quant_bin)"; then
  echo "error: llama-quantize binary not found in $LLAMACPP_BIN" >&2
  echo "       set LLAMACPP_BIN to the directory containing llama-quantize(.exe)" >&2
  echo "       (build/bin/ for a source build, or the unzip dir for prebuilts)" >&2
  exit 66
fi

OUT_F16="${OUT_DIR%/}/yuholens-14b-f16.gguf"

echo "[gguf] using convert script: $CONVERT_SCRIPT"
echo "[gguf] using quantize bin:   $QUANT_BIN"
echo "[gguf] converting $CKPT -> $OUT_F16"
python "$CONVERT_SCRIPT" \
  --outfile "$OUT_F16" \
  --outtype f16 \
  "$CKPT"

# Q3_K_M is the 8 GB consumer headline quant; everything from Q4_K_M up
# wants 10 GB+ VRAM or partial CPU offload at runtime.
QUANTS=("Q3_K_M" "Q4_K_M" "Q5_K_M" "Q6_K" "Q8_0")
for quant in "${QUANTS[@]}"; do
  out="${OUT_DIR%/}/yuholens-14b-${quant}.gguf"
  echo "[gguf] quantising $quant -> $out"
  "$QUANT_BIN" "$OUT_F16" "$out" "${quant}"
  du -h "$out"
done

echo "[gguf] done; artefacts in $OUT_DIR"
