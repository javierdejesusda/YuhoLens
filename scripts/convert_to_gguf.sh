#!/usr/bin/env bash
#
# Convert a YuhoLens fine-tuned checkpoint to GGUF and quantise.
#
# Usage: scripts/convert_to_gguf.sh <checkpoint_dir>
#
# Requires llama.cpp cloned to ../llama.cpp with the quantize binary built.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <checkpoint_dir>" >&2
  exit 64
fi

CKPT="$1"
if [[ ! -d "$CKPT" ]]; then
  echo "error: checkpoint dir '$CKPT' not found" >&2
  exit 66
fi

LLAMACPP="${LLAMACPP:-../llama.cpp}"
OUT_F16="${CKPT%/}/yuholens-14b-f16.gguf"

echo "Converting to f16 GGUF..."
python "$LLAMACPP/convert_hf_to_gguf.py" \
  --outfile "$OUT_F16" \
  --outtype f16 \
  "$CKPT"

for quant in Q4_K_M Q5_K_M Q6_K; do
  out="${CKPT%/}/yuholens-14b-${quant}.gguf"
  echo "Quantising to ${quant}..."
  "$LLAMACPP/build/bin/llama-quantize" "$OUT_F16" "$out" "${quant}"
  du -h "$out"
done

echo "Done."
