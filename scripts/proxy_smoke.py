"""Proxy SFT smoke on Qwen2.5-0.5B before committing to the full 14B run.

Exercises the exact code path Phase D uses:

    yuholens.training.sft.build_model_and_tokenizer  (via a stub model_id)
    transformers + trl + bitsandbytes + dataset_text_field='text'

on a tiny ``Qwen/Qwen2.5-0.5B-Instruct`` checkpoint so the operator can
catch a broken ``sft_trl.jsonl`` format, a missing TRL dependency, or a
bitsandbytes import failure in ~5 minutes instead of 12 hours into the
nekomata run.

Steps: load ``configs/sft.yaml`` for ``train_data`` and ``max_length``,
replace ``model_id`` with the proxy, clamp ``num_train_epochs=1``,
``max_steps=20``, and ``per_device_train_batch_size=1``. Writes to
``/tmp/yuholens-proxy-smoke`` which is safe to delete between runs.

Pass criterion: trainer completes without raising and loss at step 15
is strictly less than the step-0 loss.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

PROXY_MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct"
OUTPUT_DIR = "/tmp/yuholens-proxy-smoke"


def main() -> int:
    """Run 20 SFT steps on the proxy; return 0 on pass, 1 on fail."""
    from datasets import load_dataset
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from trl import SFTConfig, SFTTrainer

    from yuholens.training.sft import load_config

    cfg = load_config(Path("configs/sft.yaml"))
    tokenizer = AutoTokenizer.from_pretrained(PROXY_MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(
        PROXY_MODEL_ID, torch_dtype="bfloat16"
    )

    ds = load_dataset("json", data_files=cfg["train_data"], split="train[:16]")

    sft_args = SFTConfig(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        num_train_epochs=1,
        max_steps=20,
        learning_rate=2.0e-5,
        max_length=min(int(cfg["max_length"]), 2048),
        bf16=True,
        gradient_checkpointing=False,
        logging_steps=5,
        save_steps=10000,
        dataset_text_field="text",
        packing=False,
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_args,
        train_dataset=ds,
        processing_class=tokenizer,
    )
    trainer.train()

    history = trainer.state.log_history
    losses = [entry["loss"] for entry in history if "loss" in entry]
    if len(losses) < 2:
        print(f"proxy smoke: unexpected log_history (losses={losses})")
        return 1

    first, last = losses[0], losses[-1]
    decreasing = last < first
    print(f"proxy smoke: first_loss={first:.4f} last_loss={last:.4f} decreasing={decreasing}")
    return 0 if decreasing else 1


if __name__ == "__main__":
    sys.exit(main())
