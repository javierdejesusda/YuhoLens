"""LM-head + last-4-layers polish of the full SFT checkpoint.

Second-pass SFT on the same data, freezing the first 36 of 40 transformer
blocks and all embeddings. Only ``lm_head``, the final layer norm, and the
last 4 transformer blocks receive gradients.

Rationale:
    KG-2 decoding sweep landed at coherence 3.56 (SOFT). Closing the
    remaining 0.24 to the 3.80 PASS gate needs structural reasoning, not
    more decoding hygiene. Full-parameter retraining is out of scope at
    ~10 GPU-h; a targeted last-layers polish at ~4-5 GPU-h is the
    cheapest swing for the remaining gap.

Hyperparameters diverge from the base SFT (see configs/sft.yaml):
    * 1 epoch (was 2) -- polish, not rewrite
    * learning_rate 2e-6 (5x lower than 1e-5) -- conservative
    * warmup_steps 10 -- avoid initial-step surges on tiny trainable set
    * base model loaded from output/yuholens-14b-sft/checkpoint-212

Expected GPU time: ~4-5 hours on MI300X. Only ~10% of parameters
receive gradients so backward is roughly half the full-SFT wall time
per step; at 1 epoch vs 2 the total is ~1/4 of the main run.
"""

from __future__ import annotations

import argparse
import inspect
import warnings
from pathlib import Path
from typing import Any

import yaml


def load_config(path: Path) -> dict[str, Any]:
    """Read a YAML config file and return its contents as a dict."""
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def build_model_and_tokenizer(checkpoint_path: str) -> tuple[Any, Any]:
    """Load the SFT checkpoint with Qwen1-compatible flash-attention routing.

    Differs from :func:`yuholens.training.sft.build_model_and_tokenizer` in
    that the base is loaded from a local checkpoint directory rather than a
    HuggingFace Hub id, so the full SFT weights are preserved.

    Args:
        checkpoint_path: Local path to the SFT checkpoint directory, e.g.
            ``output/yuholens-14b-sft/checkpoint-212``.

    Returns:
        A tuple ``(model, tokenizer)`` ready for TRL's SFTTrainer.
    """
    import torch
    from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer

    cfg = AutoConfig.from_pretrained(checkpoint_path, trust_remote_code=True)
    cfg.use_flash_attn = False
    cfg.use_dynamic_ntk = True
    cfg.use_logn_attn = True

    tokenizer = AutoTokenizer.from_pretrained(
        checkpoint_path, trust_remote_code=True
    )
    tokenizer.truncation_side = "left"

    _orig_get_vocab = tokenizer.get_vocab
    _specials = getattr(tokenizer, "special_tokens", None) or getattr(
        tokenizer, "added_tokens_encoder", {}
    )
    tokenizer.get_vocab = lambda: {**_orig_get_vocab(), **_specials}

    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.pad_token_id = tokenizer.eos_token_id

    model = AutoModelForCausalLM.from_pretrained(
        checkpoint_path,
        config=cfg,
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
    )
    return model, tokenizer


def freeze_for_polish(model: Any, num_tail_blocks: int) -> tuple[int, int]:
    """Freeze everything except lm_head, final layer norm, and the tail blocks.

    Args:
        model: A Qwen1 ``QWenLMHeadModel`` with ``transformer.h`` blocks and
            a top-level ``lm_head``.
        num_tail_blocks: Count of trailing transformer blocks to leave
            trainable. For Qwen1-14B with 40 blocks, ``4`` unfreezes
            ``transformer.h[36:]``.

    Returns:
        A tuple ``(trainable_params, total_params)`` for logging.

    Raises:
        AttributeError: If the model does not expose the expected Qwen1
            attribute names (``transformer.h``, ``transformer.ln_f``,
            ``lm_head``).
    """
    for param in model.parameters():
        param.requires_grad = False

    transformer = model.transformer
    blocks = transformer.h
    total_blocks = len(blocks)
    if num_tail_blocks > total_blocks:
        raise ValueError(
            f"num_tail_blocks={num_tail_blocks} exceeds model depth "
            f"{total_blocks}"
        )

    for block in blocks[-num_tail_blocks:]:
        for param in block.parameters():
            param.requires_grad = True

    for param in transformer.ln_f.parameters():
        param.requires_grad = True

    for param in model.lm_head.parameters():
        param.requires_grad = True

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    return trainable, total


def main() -> None:
    """Entry point: parse CLI, load config, run polish SFT."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()

    config = load_config(args.config)

    from datasets import load_dataset
    from trl import SFTConfig, SFTTrainer

    checkpoint = config["base_checkpoint"]
    num_tail_blocks = int(config.get("num_tail_blocks", 4))

    model, tokenizer = build_model_and_tokenizer(checkpoint)
    trainable, total = freeze_for_polish(model, num_tail_blocks=num_tail_blocks)
    pct = 100.0 * trainable / max(total, 1)
    print(
        f"[polish] trainable params: {trainable:,} / {total:,} ({pct:.2f}%); "
        f"tail_blocks={num_tail_blocks}",
        flush=True,
    )

    dataset = load_dataset("json", data_files=config["train_data"], split="train")
    if "messages" in dataset.column_names:
        dataset = dataset.remove_columns(["messages"])

    candidate_kwargs = {
        "output_dir": config["output_dir"],
        "per_device_train_batch_size": config["per_device_train_batch_size"],
        "gradient_accumulation_steps": config["gradient_accumulation_steps"],
        "num_train_epochs": config["num_train_epochs"],
        "learning_rate": config["learning_rate"],
        "warmup_steps": config.get("warmup_steps", 0),
        "max_length": config["max_length"],
        "bf16": True,
        "bf16_full_eval": config.get("bf16_full_eval", True),
        "gradient_checkpointing": config.get("gradient_checkpointing", False),
        "logging_steps": config.get("logging_steps", 10),
        "report_to": config.get("report_to", "none"),
        "save_steps": config.get("save_steps", 50),
        "optim": config.get("optim", "paged_adamw_8bit"),
        "dataloader_num_workers": config.get("dataloader_num_workers", 4),
        "dataloader_pin_memory": config.get("dataloader_pin_memory", True),
        "group_by_length": config.get("group_by_length", True),
        "remove_unused_columns": config.get("remove_unused_columns", False),
        "dataset_text_field": "text",
        "packing": False,
    }
    supported = set(inspect.signature(SFTConfig).parameters)
    sft_kwargs = {k: v for k, v in candidate_kwargs.items() if k in supported}
    dropped = sorted(set(candidate_kwargs) - set(sft_kwargs))
    if dropped:
        warnings.warn(
            f"[polish] dropped unsupported SFTConfig kwargs: {dropped}",
            stacklevel=2,
        )

    sft_args = SFTConfig(**sft_kwargs)

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
