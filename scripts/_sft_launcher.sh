#!/bin/bash
# Launches the SFT run inside the yuholens container. Invoked from a host-side
# tmux session so it survives ssh drops. `python -u` forces line-buffered
# stdio so `tee` sees the trainer's loss dicts in real time instead of them
# being swallowed by Python's default block buffering.
set -e
docker exec yuholens bash -lc '
  source /opt/venv/bin/activate
  cd /workspace
  export PYTHONPATH=/workspace/src:${PYTHONPATH:-}
  export HSA_ENABLE_SDMA=0
  export PYTORCH_HIP_ALLOC_CONF=expandable_segments:True
  export OMP_NUM_THREADS=8
  export TRANSFORMERS_NO_ADVISORY_WARNINGS=1
  export PYTHONUNBUFFERED=1
  python -u -m yuholens.training.sft --config configs/sft.yaml 2>&1 | tee /workspace/sft.log
'
