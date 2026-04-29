# HuggingFace upload runbook

End-to-end procedure for publishing the YuhoLens-14B release. Two
artefacts: the BF16 reference checkpoint (`yuholens/yuholens-14b`) and
the GGUF release set (`yuholens/yuholens-14b-GGUF`).

## 0. Prerequisites

1. HuggingFace account with write access to the `yuholens` org. If the
   org does not yet exist, create it at <https://huggingface.co/organizations/new>
   before step 2.
2. `huggingface_hub` Python package in the active environment:
   ```bash
   pip install --upgrade huggingface_hub
   ```
3. Authenticate. Pick one:
   ```bash
   huggingface-cli login        # interactive, persists to ~/.cache/huggingface/token
   # or
   export HF_TOKEN=hf_xxx_yyy_zzz
   ```
4. Confirm both repos are reachable (will be created on first push if
   they don't exist):
   ```bash
   huggingface-cli whoami
   ```

## 1. BF16 checkpoint -> yuholens/yuholens-14b

### 1a. Pre-flight verify

```bash
python scripts/check_release_set.py \
  --model-path output/yuholens-14b-sft/checkpoint-212
```

Expected: `RESULT: PASS` with the four checks (tokenizer, weights,
generation_config, architecture). If `generation_config.json` is not
yet patched, run the patcher (does not push):

```bash
python scripts/hf_upload.py \
  --model-path output/yuholens-14b-sft/checkpoint-212 \
  --hf-repo placeholder \
  --skip-upload
```

### 1b. Stage the model card

The model card lives at `docs/model-card.md`. Copy it into the
checkpoint folder as `README.md` so `upload_folder` picks it up:

```bash
cp docs/model-card.md output/yuholens-14b-sft/checkpoint-212/README.md
```

### 1c. Push

`scripts/hf_upload.py` excludes training-state artefacts
(`optimizer.pt`, `scheduler.pt`, `rng_state.pth`, `training_args.bin`,
`trainer_state.json`, plus any `global_step*/` and `checkpoint-*/`
subdirs) so the 33 GB optimizer state stays local.

Public release:

```bash
python scripts/hf_upload.py \
  --model-path output/yuholens-14b-sft/checkpoint-212 \
  --hf-repo yuholens/yuholens-14b
```

Private dry-run first if you want a sanity check:

```bash
python scripts/hf_upload.py \
  --model-path output/yuholens-14b-sft/checkpoint-212 \
  --hf-repo yuholens/yuholens-14b-staging \
  --private
```

The shipped upload payload is approximately 28 GB across 6 safetensors
shards plus tokenizer / config / model-card files. Expect 30-90 minutes
on residential broadband.

## 2. GGUF release set -> yuholens/yuholens-14b-GGUF

### 2a. Verify the set

```bash
python scripts/hf_upload_gguf.py \
  --gguf-dir data/eval/gguf \
  --readme docs/gguf_readme.md \
  --hf-repo yuholens/yuholens-14b-GGUF \
  --dry-run
```

Expected: `release set OK` with all five quants listed
(Q3_K_M / Q4_K_M / Q5_K_M / Q6_K / Q8_0). The script refuses to push if
any expected quant is missing or under 1 GB.

### 2b. Push

```bash
python scripts/hf_upload_gguf.py \
  --gguf-dir data/eval/gguf \
  --readme docs/gguf_readme.md \
  --hf-repo yuholens/yuholens-14b-GGUF
```

Total payload is ~52 GB across 5 GGUF files plus the README. The
script copies into a temp staging dir before uploading so the f16
intermediate (if it still exists locally) is not pushed.

## 3. Post-push checklist

- [ ] Browse <https://huggingface.co/yuholens/yuholens-14b> and confirm
      the model card renders, no `optimizer.pt` is visible, and the
      *Files and versions* tab lists all 6 safetensors shards.
- [ ] Browse <https://huggingface.co/yuholens/yuholens-14b-GGUF> and
      confirm all five quants appear with the sizes listed in the
      README.
- [ ] Update the GitHub README with the live HuggingFace URLs and
      the verified GGUF table (sizes + smoke result already in
      `docs/model-card.md`).
- [ ] Tag both repos with the corresponding GitHub commit hash via
      the *Settings -> Tags* tab on the Hub for traceability
      (currently `f903174` on `main`).

## 4. Rollback

To unpublish (e.g., if a wrong file slipped in), use the Hub UI's
*Settings -> Delete repository*. Do not git-revert; the Hub commit
history is independent of GitHub.

## 5. Bandwidth cost

- BF16 push: 28 GB once.
- GGUF push: 52 GB once.
- Total: ~80 GB upstream. Plan for ~2-4 hours on a 100 Mbps connection.
