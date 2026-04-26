#!/usr/bin/env bash
#
# Build the YuhoLens-14B GGUF release set from a HuggingFace checkpoint.
#
# Required tools (operator must install before running):
#   - python (matching the llama.cpp checkout's environment)
#   - llama.cpp cloned and built with the quantize binary:
#       git clone https://github.com/ggerganov/llama.cpp ../llama.cpp
#       cd ../llama.cpp && cmake -B build && cmake --build build --target llama-quantize
#       pip install -r ../llama.cpp/requirements.txt
#   - At least 80 GB free on the target disk (f16 + four quants for a 14B model).
#
# Usage:
#   scripts/build_gguf.sh <checkpoint_dir> [output_dir]
#
# Defaults:
#   - LLAMACPP env var overrides the llama.cpp path (default: ../llama.cpp).
#   - output_dir defaults to <checkpoint_dir> when omitted.
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

LLAMACPP="${LLAMACPP:-../llama.cpp}"
CONVERT_SCRIPT="$LLAMACPP/convert_hf_to_gguf.py"
QUANT_BIN="$LLAMACPP/build/bin/llama-quantize"

if [[ ! -f "$CONVERT_SCRIPT" ]]; then
  echo "error: convert script not found at $CONVERT_SCRIPT" >&2
  echo "       set LLAMACPP=/path/to/llama.cpp or clone llama.cpp at ../llama.cpp" >&2
  exit 66
fi

if [[ ! -x "$QUANT_BIN" ]]; then
  echo "error: llama-quantize binary not found at $QUANT_BIN" >&2
  echo "       build llama.cpp first: cmake -B build && cmake --build build --target llama-quantize" >&2
  exit 66
fi

OUT_F16="${OUT_DIR%/}/yuholens-14b-f16.gguf"

echo "[gguf] converting $CKPT -> $OUT_F16"
python "$CONVERT_SCRIPT" \
  --outfile "$OUT_F16" \
  --outtype f16 \
  "$CKPT"

QUANTS=("Q4_K_M" "Q5_K_M" "Q6_K" "Q8_0")
for quant in "${QUANTS[@]}"; do
  out="${OUT_DIR%/}/yuholens-14b-${quant}.gguf"
  echo "[gguf] quantising $quant -> $out"
  "$QUANT_BIN" "$OUT_F16" "$out" "${quant}"
  du -h "$out"
done

echo "[gguf] done; artefacts in $OUT_DIR"
