# AMD Developer Program — Post-Hackathon Feedback

**From:** Javier De Jesus <javier.dejesusj9@gmail.com>
**To:** AMD Developer Program
**Date:** 2026-05-09
**Subject:** YuhoLens-Pipeline on MI300X: what worked and three ways to help the next developer

Hello,

Thank you for the $100 in AMD Developer Cloud credits. I used them across 23 days to fine-tune a 14B Japanese-finance LLM on a single AMD Instinct MI300X at $1.99/hr. The workload covered full-parameter SFT of a Qwen1 base at seq 8192 (~10 GPU-hr), two trial-and-error iterations of the ORPO data-generation route on top of the SFT checkpoint (~4 GPU-hr; both iterations failed at a pre-training data-quality gate, so no ORPO checkpoint shipped), and roughly 20 GPU-hr of smoke tests, dev iteration, and evaluation. I wanted to share what worked and a few ways the ramp could be smoother for the next developer who picks up MI300X for LLM fine-tuning.

The ROCm 7.0 PyTorch container (`rocm/pytorch:rocm7.0_ubuntu24.04_py3.12_pytorch_release_2.5.1`) was the single biggest productivity win. A ~10-minute pull, flash-attn pre-installed, and a clean PyTorch 2.5.1-ROCm build made the first training step reachable on day one. This was genuinely the reason the 23-day timeline was possible.

Three small opportunities I noticed:

First, bitsandbytes. The absence of a prebuilt ROCm 7.0 wheel meant a `cmake -DCOMPUTE_BACKEND=hip -DBNB_ROCM_ARCH="gfx942"` source-build from the `ROCm/bitsandbytes:rocm_enabled` branch. First-time ROCm developers will hit this as a wall. Shipping a Dockerfile layer or wheel for 8-bit AdamW in a future container release would remove that step entirely.

Second, TRL. `trl.experimental.orpo` worked cleanly in TRL 1.2.0, but the experimental marker makes it hard to pin. Either TRL promoting ORPOTrainer, or a known-good commit listed in AMD's ROCm compatibility table alongside PyTorch, would give users a defensible version to lock.

Third, vLLM. vLLM 0.7.x served Qwen1 (`model_type: "qwen"`) correctly with `trust_remote_code=True` and dynamic-NTK up to ~16K context. Listing Qwen1 explicitly in the vLLM-ROCm quickstart, not only Qwen2, would save the next developer a compatibility scare.

I'd be glad to contribute a short write-up to the AMD ROCm PyTorch quickstart or a PR to the bnb ROCm README if either would be useful.

Best regards,
Javier De Jesus
javier.dejesusj9@gmail.com
GitHub: https://github.com/javierdejesusda/YuhoLens
HuggingFace: https://huggingface.co/yuholens/yuholens-14b
