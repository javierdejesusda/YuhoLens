"""ORPO (reference-free preference optimisation) entry point.

ORPO saves memory versus DPO because no reference model is held in GPU
memory. The trainer lives in ``trl.experimental.orpo`` as of TRL 1.2.0.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from yuholens.training.sft import build_model_and_tokenizer, load_config


def main() -> None:
    """Entry point: parse CLI, load config, run ORPO."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()

    config = load_config(args.config)

    from datasets import load_dataset
    from trl.experimental.orpo import ORPOConfig, ORPOTrainer

    model, tokenizer = build_model_and_tokenizer(config["model_id"])
    dataset = load_dataset("json", data_files=config["preference_data"], split="train")

    orpo_args = ORPOConfig(
        output_dir=config["output_dir"],
        per_device_train_batch_size=config["per_device_train_batch_size"],
        gradient_accumulation_steps=config["gradient_accumulation_steps"],
        num_train_epochs=config["num_train_epochs"],
        learning_rate=config["learning_rate"],
        max_length=config["max_seq_length"],
        beta=config.get("beta", 0.1),
        bf16=True,
        gradient_checkpointing=True,
        logging_steps=10,
        save_steps=config.get("save_steps", 200),
        optim="adamw_bnb_8bit",
    )

    trainer = ORPOTrainer(
        model=model,
        args=orpo_args,
        train_dataset=dataset,
        processing_class=tokenizer,
    )
    trainer.train()
    trainer.save_model(config["output_dir"])


if __name__ == "__main__":
    main()
