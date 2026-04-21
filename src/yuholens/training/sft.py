"""Full-parameter SFT entry point for ``pfnet/nekomata-14b-pfn-qfin``.

Notes:
    * ``pfnet/nekomata-14b-pfn-qfin`` is Qwen1 (``QWenLMHeadModel``). It does
      NOT support HuggingFace's ``attn_implementation="flash_attention_2"``
      keyword. Flash attention is routed via the ``use_flash_attn`` config
      field inside the model's own ``modeling_qwen.py`` custom code.
    * Default training sequence length is 8192 (the model's
      ``max_position_embeddings``). PFN's original continued-pretraining was
      at seq 2048, so training further than 8192 without a progressive
      schedule risks quality degradation; see build-spec §19.
    * 8-bit AdamW states are provided by bitsandbytes built from
      ``ROCm/bitsandbytes`` branch ``rocm_enabled``.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import yaml


def load_config(path: Path) -> dict[str, Any]:
    """Read a YAML config file and return its contents as a dict.

    Args:
        path: Path to the YAML configuration file.

    Returns:
        A mapping of config keys to values.
    """
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def build_model_and_tokenizer(model_id: str) -> tuple[Any, Any]:
    """Load the base model with Qwen1-compatible flash-attention routing.

    Args:
        model_id: HuggingFace Hub identifier, e.g.
            ``pfnet/nekomata-14b-pfn-qfin``.

    Returns:
        A tuple ``(model, tokenizer)`` ready for TRL's SFTTrainer.
    """
    import torch
    from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer

    cfg = AutoConfig.from_pretrained(model_id, trust_remote_code=True)
    cfg.use_flash_attn = "auto"
    cfg.use_dynamic_ntk = True
    cfg.use_logn_attn = True

    tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
    tokenizer.truncation_side = "left"
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        config=cfg,
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
    )
    return model, tokenizer


def main() -> None:
    """Entry point: parse CLI, load config, run SFT."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()

    config = load_config(args.config)

    from datasets import load_dataset
    from trl import SFTConfig, SFTTrainer

    model, tokenizer = build_model_and_tokenizer(config["model_id"])
    dataset = load_dataset("json", data_files=config["train_data"], split="train")

    sft_args = SFTConfig(
        output_dir=config["output_dir"],
        per_device_train_batch_size=config["per_device_train_batch_size"],
        gradient_accumulation_steps=config["gradient_accumulation_steps"],
        num_train_epochs=config["num_train_epochs"],
        learning_rate=config["learning_rate"],
        max_length=config["max_length"],
        bf16=True,
        gradient_checkpointing=True,
        logging_steps=10,
        save_steps=config.get("save_steps", 200),
        optim="adamw_bnb_8bit",
        dataset_text_field="text",
        packing=False,
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_args,
        train_dataset=dataset,
        processing_class=tokenizer,
    )
    trainer.train()
    trainer.save_model(config["output_dir"])


if __name__ == "__main__":
    main()
