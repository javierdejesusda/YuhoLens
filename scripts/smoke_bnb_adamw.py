"""KILL GATE 0 smoke: bitsandbytes 8-bit AdamW on nekomata-14b-pfn-qfin.

Runs 50 training steps at seq 4096, batch 1, 8-bit AdamW. Pass criteria:

    * Loss strictly decreasing (within 5 percent at step 45 vs step 0).
    * No NaN / Inf at any step.
    * Peak GPU memory below 140 GB (so seq 8192 scale-up has headroom).

Important: Qwen1 (QWenLMHeadModel) does NOT support HuggingFace's
``attn_implementation="flash_attention_2"`` keyword. Flash attention is
routed via the ``use_flash_attn`` config flag in the model's custom
``modeling_qwen.py`` code.
"""

from __future__ import annotations

import sys

MODEL_ID = "pfnet/nekomata-14b-pfn-qfin"
SEQ = 4096
STEPS = 50


def main() -> int:
    """Execute the smoke test; return 0 on pass, non-zero on fail."""
    import torch
    from datasets import load_dataset
    from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer

    import bitsandbytes as bnb

    cfg = AutoConfig.from_pretrained(MODEL_ID, trust_remote_code=True)
    cfg.use_flash_attn = "auto"
    cfg.use_dynamic_ntk = True
    cfg.use_logn_attn = True

    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        config=cfg,
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
    ).to("cuda")
    model.gradient_checkpointing_enable()

    ds = load_dataset("SakanaAI/EDINET-Bench", "fraud_detection", split="train[:16]")
    texts = [row["text"][:20000] for row in ds]
    batch = tokenizer(
        texts,
        max_length=SEQ,
        truncation=True,
        padding="max_length",
        return_tensors="pt",
    )
    input_ids = batch["input_ids"].to("cuda")
    attn_mask = batch["attention_mask"].to("cuda")

    optim = bnb.optim.AdamW8bit(model.parameters(), lr=1e-5, betas=(0.9, 0.95))
    torch.cuda.reset_peak_memory_stats()

    first_loss: float | None = None
    last_loss: float | None = None
    for step in range(STEPS):
        idx = step % input_ids.size(0)
        out = model(
            input_ids=input_ids[idx : idx + 1],
            labels=input_ids[idx : idx + 1],
            attention_mask=attn_mask[idx : idx + 1],
        )
        out.loss.backward()
        optim.step()
        optim.zero_grad(set_to_none=True)

        loss_val = float(out.loss.item())
        if first_loss is None:
            first_loss = loss_val
        last_loss = loss_val

        if step % 5 == 0:
            peak_gb = torch.cuda.max_memory_allocated() / 1e9
            print(f"step {step:3d}  loss {loss_val:.4f}  peak {peak_gb:.1f} GB")

    assert first_loss is not None and last_loss is not None
    peak_gb = torch.cuda.max_memory_allocated() / 1e9

    decreasing = last_loss < first_loss * 0.95
    within_budget = peak_gb < 140.0

    print()
    print(f"first_loss={first_loss:.4f}  last_loss={last_loss:.4f}  peak={peak_gb:.1f} GB")
    print(f"decreasing ≥5%: {decreasing}")
    print(f"peak <140 GB:   {within_budget}")

    if decreasing and within_budget:
        print("PASS")
        return 0
    print("FAIL")
    return 1


if __name__ == "__main__":
    sys.exit(main())
