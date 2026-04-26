# CITATIONS

Primary-source citations for YuhoLens-14B. This file enumerates every
external model, dataset, paper, or tool that the project directly depends
on, so that a reader of the Hugging Face model card can verify the lineage.
Entries are ordered to follow the training and inference pipeline: base
models first, then data, then training and serving infrastructure, then
operational substrate.

## 1. nekomata-14b-pfn-qfin (Preferred Networks, 2024)

YuhoLens-14B fine-tunes directly from `pfnet/nekomata-14b-pfn-qfin`, a
continual-pre-trained adaptation of rinna's `nekomata-14b` on Japanese
financial corpora released by Preferred Networks. This is the starting
checkpoint for both the SFT and ORPO stages.

- Model card: https://huggingface.co/pfnet/nekomata-14b-pfn-qfin
- Paper (arXiv): https://arxiv.org/abs/2404.10555

```bibtex
@misc{hirano2024pfnqfin,
  title        = {Construction of Domain-specified Japanese Large Language
                  Model for Finance through Continual Pre-training},
  author       = {Hirano, Masanori and Imajo, Kentaro},
  year         = {2024},
  eprint       = {2404.10555},
  archivePrefix= {arXiv},
  primaryClass = {cs.CL},
  url          = {https://arxiv.org/abs/2404.10555}
}
```

## 2. nekomata-14b (rinna Co., Ltd., 2023)

`rinna/nekomata-14b` is the Japanese-adapted continual pre-training of
Qwen1-14B that underlies `nekomata-14b-pfn-qfin`. YuhoLens inherits its
tokenizer vocabulary (152064) and architectural configuration transitively
from this checkpoint.

- Model card: https://huggingface.co/rinna/nekomata-14b

```bibtex
@misc{rinna2023nekomata,
  title        = {nekomata-14b: Japanese Continual Pre-Training of Qwen-14B},
  author       = {{rinna Co., Ltd.}},
  year         = {2023},
  howpublished = {Hugging Face model repository},
  url          = {https://huggingface.co/rinna/nekomata-14b},
  note         = {Accessed 2026-04-17.}
}
```

## 3. Qwen1 (Alibaba Cloud, 2023)

Qwen1 provides the `QWenLMHeadModel` architecture (40 layers, hidden 5120,
40 multi-head attention heads, `max_position_embeddings: 8192`) and the
Tongyi Qianwen license under which YuhoLens weights are redistributed.

- Paper (arXiv): https://arxiv.org/abs/2309.16609

```bibtex
@misc{bai2023qwen,
  title        = {Qwen Technical Report},
  author       = {Bai, Jinze and Bai, Shuai and Chu, Yunfei and Cui, Zeyu
                  and Dang, Kai and Deng, Xiaodong and Fan, Yang and Ge,
                  Wenbin and Han, Yu and Huang, Fei and others},
  year         = {2023},
  eprint       = {2309.16609},
  archivePrefix= {arXiv},
  primaryClass = {cs.CL},
  url          = {https://arxiv.org/abs/2309.16609}
}
```

## 4. EDINET-Bench (Sakana AI, 2025)

`SakanaAI/EDINET-Bench` supplies the three labeled Yuho subsets
(`fraud_detection`, `earnings_forecast`, `industry_prediction`) that form
the teacher-bootstrap input and the student training corpus for YuhoLens.

- Dataset card: https://huggingface.co/datasets/SakanaAI/EDINET-Bench
- Paper (arXiv): https://arxiv.org/abs/2506.08762

```bibtex
@misc{sugiura2025edinetbench,
  title        = {EDINET-Bench: Evaluating LLMs on Complex Financial Tasks
                  using Japanese Financial Statements},
  author       = {Sugiura, Issa and Ishida, Takashi and Makino, Taro and
                  Tazuke, Chieko and Nakagawa, Takanori and Nakago, Kosuke
                  and Ha, David},
  year         = {2025},
  eprint       = {2506.08762},
  archivePrefix= {arXiv},
  primaryClass = {cs.CL},
  url          = {https://arxiv.org/abs/2506.08762}
}
```

## 5. TRL — Transformer Reinforcement Learning (Hugging Face, 2023-2024)

TRL provides the SFT and ORPO trainer implementations used in YuhoLens
training. YuhoLens uses `SFTTrainer` for Stage 1 and `ORPOTrainer` for
Stage 2.

- GitHub: https://github.com/huggingface/trl

```bibtex
@misc{vonwerra2023trl,
  author       = {von Werra, Leandro and Belkada, Younes and Tunstall,
                  Lewis and Beeching, Edward and Thrush, Tristan and
                  Lambert, Nathan and Huang, Shengyi and Rasul, Kashif and
                  Gallouedec, Quentin},
  title        = {{TRL: Transformer Reinforcement Learning}},
  year         = {2023},
  howpublished = {\url{https://github.com/huggingface/trl}},
  note         = {Accessed 2026-04-17.}
}
```

## 6. ORPO (Hong et al., 2024)

ORPO defines the reference-free preference optimization objective used in
YuhoLens Stage 2, which avoids maintaining a frozen reference model and
therefore fits the single-MI300X compute envelope.

- Paper (arXiv): https://arxiv.org/abs/2403.07691

```bibtex
@misc{hong2024orpo,
  title        = {ORPO: Monolithic Preference Optimization without
                  Reference Model},
  author       = {Hong, Jiwoo and Lee, Noah and Thorne, James},
  year         = {2024},
  eprint       = {2403.07691},
  archivePrefix= {arXiv},
  primaryClass = {cs.CL},
  url          = {https://arxiv.org/abs/2403.07691}
}
```

## 7. bitsandbytes (Dettmers et al., 2022; ROCm port)

bitsandbytes provides the 8-bit AdamW optimizer (`adamw_bnb_8bit`) used
during SFT and ORPO, which is required to fit full-parameter 14B training
state within the MI300X budget. The ROCm port enables its use on AMD
hardware.

- Paper (arXiv): https://arxiv.org/abs/2208.07339
- GitHub: https://github.com/TimDettmers/bitsandbytes
- ROCm port: https://github.com/ROCm/bitsandbytes

```bibtex
@misc{dettmers2022llmint8,
  title        = {{LLM.int8()}: 8-bit Matrix Multiplication for
                  Transformers at Scale},
  author       = {Dettmers, Tim and Lewis, Mike and Belkada, Younes and
                  Zettlemoyer, Luke},
  year         = {2022},
  eprint       = {2208.07339},
  archivePrefix= {arXiv},
  primaryClass = {cs.LG},
  url          = {https://arxiv.org/abs/2208.07339}
}

@misc{dettmers2023bitsandbytes,
  author       = {Dettmers, Tim and contributors},
  title        = {{bitsandbytes: 8-bit CUDA and ROCm kernels for
                  PyTorch}},
  year         = {2023},
  howpublished = {\url{https://github.com/TimDettmers/bitsandbytes}},
  note         = {ROCm fork: https://github.com/ROCm/bitsandbytes.
                  Accessed 2026-04-17.}
}
```

## 8. vLLM (Kwon et al., 2023)

vLLM (ROCm build) serves the BF16 YuhoLens checkpoint during
training-time evaluation sweeps and for Pass-1 / Pass-2 inference on
MI300X. The PagedAttention KV-cache design is what makes per-section
batch inference tractable on the full corpus.

- Paper (arXiv): https://arxiv.org/abs/2309.06180
- GitHub: https://github.com/vllm-project/vllm

```bibtex
@inproceedings{kwon2023vllm,
  title        = {Efficient Memory Management for Large Language Model
                  Serving with PagedAttention},
  author       = {Kwon, Woosuk and Li, Zhuohan and Zhuang, Siyuan and
                  Sheng, Ying and Zheng, Lianmin and Yu, Cody Hao and
                  Gonzalez, Joseph E. and Zhang, Hao and Stoica, Ion},
  booktitle    = {Proceedings of the 29th Symposium on Operating Systems
                  Principles (SOSP)},
  year         = {2023},
  eprint       = {2309.06180},
  archivePrefix= {arXiv},
  url          = {https://arxiv.org/abs/2309.06180}
}
```

## 9. LangGraph (LangChain, 2024)

LangGraph orchestrates the 4-node YuhoLens pipeline (Ingestor → Pass-1 →
Pass-2 → Citation-Grounder), including the conditional edges that route
ungrounded clauses to abstention.

- GitHub: https://github.com/langchain-ai/langgraph

```bibtex
@misc{langchain2024langgraph,
  author       = {{LangChain, Inc.}},
  title        = {{LangGraph: Stateful, Multi-Actor Applications with
                  LLMs}},
  year         = {2024},
  howpublished = {\url{https://github.com/langchain-ai/langgraph}},
  note         = {Accessed 2026-04-17.}
}
```

## 10. llama.cpp (ggerganov and contributors, 2023-2024)

llama.cpp produces the Q4_K_M, Q5_K_M, and Q6_K GGUF artifacts from the
BF16 YuhoLens checkpoint and provides the inference runtime on consumer
hardware (target: RTX 4060 Ti, 16 GB).

- GitHub: https://github.com/ggerganov/llama.cpp

```bibtex
@misc{gerganov2023llamacpp,
  author       = {Gerganov, Georgi and contributors},
  title        = {{llama.cpp}: Port of Facebook's LLaMA model in C/C++},
  year         = {2023},
  howpublished = {\url{https://github.com/ggerganov/llama.cpp}},
  note         = {Accessed 2026-04-17.}
}
```

## 11. AMD ROCm 7.0 PyTorch container

The canonical training and evaluation environment. YuhoLens is trained and
evaluated inside the
`rocm/pytorch:rocm7.0_ubuntu24.04_py3.12_pytorch_release_2.5.1` Docker
container on an AMD Instinct MI300X.

- Docker Hub: https://hub.docker.com/r/rocm/pytorch
- ROCm documentation: https://rocm.docs.amd.com/

```bibtex
@misc{amd2024rocmpytorch,
  author       = {{Advanced Micro Devices, Inc.}},
  title        = {{ROCm PyTorch Container}: rocm/pytorch:rocm7.0\_ubuntu24.04\_py3.12\_pytorch\_release\_2.5.1},
  year         = {2024},
  howpublished = {\url{https://hub.docker.com/r/rocm/pytorch}},
  note         = {Accessed 2026-04-17.}
}
```

## 12. OpenAI Batch API (`gpt-5-mini`)

The teacher-bootstrap stage queries OpenAI `gpt-5-mini` through the Batch
API at $0.125 / $1.00 per million input / output tokens. Batch submission
is what keeps the teacher spend within the hackathon budget while
producing English investor-memo drafts with inline Japanese-span
citations.

- Documentation: https://platform.openai.com/docs/guides/batch

```bibtex
@misc{openai2024batchapi,
  author       = {{OpenAI}},
  title        = {{OpenAI Batch API}: Asynchronous batch inference for
                  large-scale workloads},
  year         = {2024},
  howpublished = {\url{https://platform.openai.com/docs/guides/batch}},
  note         = {Accessed 2026-04-17. Teacher model: gpt-5-mini.}
}
```
