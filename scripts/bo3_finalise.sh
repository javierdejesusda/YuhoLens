#!/usr/bin/env bash
# Post-best-of-3 pipeline: pull candidate memos from droplet, run a
# fresh-pass judge over all 3 sets, pick the best per custom_id, and
# rescore the picked set for an unbiased mean coherence number.
#
# Run from the repo root after the bo3 tmux session reports "all seeds
# complete". Idempotent: each step writes to its own files in
# data/eval/.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
source ./scripts/adc/_lib.sh
adc::load_env

ip="$(adc::state_get ip)"
ssh_opts=$(adc::ssh_opts)
remote="root@${ip}"

mkdir -p data/eval
echo "[bo3-final] pulling candidate memos from droplet"
for seed in 1 2 3; do
  scp $ssh_opts \
    "${remote}:/root/yuholens/data/eval/kg2_memos_bo3_s${seed}.jsonl" \
    "data/eval/kg2_memos_bo3_s${seed}.jsonl"
done
wc -l data/eval/kg2_memos_bo3_s*.jsonl

echo "[bo3-final] judging all 3 sets in a single fresh pass (~150 calls)"
PYTHONPATH=src python scripts/bestofn_judge.py \
  --memos data/eval/kg2_memos_bo3_s1.jsonl \
          data/eval/kg2_memos_bo3_s2.jsonl \
          data/eval/kg2_memos_bo3_s3.jsonl \
  --scores-out data/eval/kg2_per_memo_scores_bo3_s1.json \
               data/eval/kg2_per_memo_scores_bo3_s2.json \
               data/eval/kg2_per_memo_scores_bo3_s3.json \
  --labels bo3_s1 bo3_s2 bo3_s3

echo "[bo3-final] picking best of 3 per custom_id"
PYTHONPATH=src python scripts/bestofn_pick.py \
  --memos data/eval/kg2_memos_bo3_s1.jsonl \
          data/eval/kg2_memos_bo3_s2.jsonl \
          data/eval/kg2_memos_bo3_s3.jsonl \
  --scores data/eval/kg2_per_memo_scores_bo3_s1.json \
           data/eval/kg2_per_memo_scores_bo3_s2.json \
           data/eval/kg2_per_memo_scores_bo3_s3.json \
  --labels bo3_s1 bo3_s2 bo3_s3 \
  --picked-memos data/eval/kg2_memos_bo3_picked.jsonl \
  --picked-scores data/eval/kg2_per_memo_scores_bo3_picked_cached.json

echo "[bo3-final] fresh rescore on the picked set (unbiased mean)"
PYTHONPATH=src python scripts/rescore_kg2.py \
  --memos data/eval/kg2_memos_bo3_picked.jsonl \
  --out data/eval/kg2_scores_bo3_picked.json \
  --per-memo-out data/eval/kg2_per_memo_scores_bo3_picked_fresh.json
