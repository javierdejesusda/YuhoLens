"""Convert teacher-output JSONL into TRL-compatible SFT training data.

Each teacher-pass output line has the shape
``{"custom_id": ..., "memo": ..., "usage": ..., "dedup_key": ...}`` — it
carries only the generated memo, not the prompt that produced it. TRL's
:class:`~trl.SFTTrainer` expects each row to be either ``{"text": ...}``,
``{"prompt": ..., "completion": ...}``, or a list of chat messages under
``{"messages": [...]}``. This module bridges the gap: it loads the
persisted source-row manifest for each teacher run, reconstructs the
exact user prompt that was sent to ``gpt-5-mini`` via
:func:`yuholens.training.teacher.build_user_prompt`, and emits a
conversational JSONL with the system prompt the teacher actually used.

The ``custom_id`` prefix carries the v1/v2 distinction. Any custom_id
that ends with the ``_v2`` suffix indicates the Phase C augmentation
pass, which used :data:`SYSTEM_PROMPT_ALT`; every other row used
:data:`SYSTEM_PROMPT`. This mapping lets a single sft dataset carry
both styles without losing the system-prompt provenance.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from yuholens.training.teacher import (
    SYSTEM_PROMPT,
    SYSTEM_PROMPT_ALT,
    _load_source_manifest,
    build_user_prompt,
)

_V2_SUFFIX_PATTERN = re.compile(r"_v2-\d+$")


def render_qwen_chatml(messages: list[dict[str, str]]) -> str:
    """Render a ``messages`` list into Qwen1 ChatML plain text.

    Qwen1 (``QWenLMHeadModel``) uses the ChatML-style role markers
    ``<|im_start|>{role}\\n{content}<|im_end|>``. TRL's
    :class:`~trl.SFTTrainer` applies the tokenizer's ``chat_template`` to
    conversational rows, but ``pfnet/nekomata-14b-pfn-qfin`` is a base
    (non-chat) checkpoint that may ship without a ``chat_template``. We
    emit a pre-rendered ``text`` field alongside ``messages`` so training
    works on both paths.

    Args:
        messages: List of ``{"role": "...", "content": "..."}`` dicts.

    Returns:
        A single string joining each turn in Qwen1 ChatML format with
        newlines, followed by a trailing newline so the final assistant
        turn ends cleanly.
    """
    parts: list[str] = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        parts.append(f"<|im_start|>{role}\n{content}<|im_end|>")
    return "\n".join(parts) + "\n"


def system_prompt_for(custom_id: str) -> str:
    """Return the system prompt that matches the row's ``custom_id`` provenance.

    Args:
        custom_id: The batch request id, e.g. ``industry_prediction-00042``
            or ``industry_prediction_v2-00042``.

    Returns:
        :data:`SYSTEM_PROMPT_ALT` when the ``custom_id`` indicates a Phase C
        v2 row, otherwise :data:`SYSTEM_PROMPT`.
    """
    return SYSTEM_PROMPT_ALT if _V2_SUFFIX_PATTERN.search(custom_id) else SYSTEM_PROMPT


def convert_filtered_to_sft_messages(
    filtered_path: Path,
    manifest_path: Path,
    out_path: Path | None = None,
) -> list[dict[str, Any]]:
    """Convert one ``*_filtered.jsonl`` into conversational SFT rows.

    Args:
        filtered_path: Path to a teacher ``*_filtered.jsonl`` written by
            :func:`yuholens.training.teacher.poll_and_filter`.
        manifest_path: Matching ``*.source_rows.jsonl`` so we can rebuild
            the original user prompt from the EDINET-Bench row.
        out_path: Optional sink. When provided, each converted row is
            written as one JSONL line; parent directories are created.

    Returns:
        The list of conversational records. Each has the shape
        ``{"messages": [{"role": "system", ...}, {"role": "user", ...},
        {"role": "assistant", "content": memo}], "custom_id": ...,
        "dedup_key": ...}``.
    """
    manifest = _load_source_manifest(manifest_path)
    records: list[dict[str, Any]] = []
    with filtered_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            custom_id = row.get("custom_id")
            memo = row.get("memo")
            if not isinstance(custom_id, str) or not isinstance(memo, str) or not memo:
                continue
            source = manifest.get(custom_id)
            if source is None:
                continue
            messages = [
                {"role": "system", "content": system_prompt_for(custom_id)},
                {"role": "user", "content": build_user_prompt(source)},
                {"role": "assistant", "content": memo},
            ]
            record = {
                "custom_id": custom_id,
                "dedup_key": row.get("dedup_key"),
                "messages": messages,
                "text": render_qwen_chatml(messages),
            }
            records.append(record)

    if out_path is not None:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as out_fh:
            for record in records:
                out_fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    return records


def build_sft_dataset(
    pairs: list[tuple[Path, Path]],
    out_path: Path,
) -> int:
    """Merge multiple ``(filtered, manifest)`` pairs into one SFT JSONL.

    Args:
        pairs: Iterable of ``(filtered_path, manifest_path)`` tuples in the
            order they should appear in the merged output.
        out_path: Destination JSONL.

    Returns:
        The total number of rows written to ``out_path``.
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with out_path.open("w", encoding="utf-8") as out_fh:
        for filtered_path, manifest_path in pairs:
            for record in convert_filtered_to_sft_messages(filtered_path, manifest_path):
                out_fh.write(json.dumps(record, ensure_ascii=False) + "\n")
                total += 1
    return total


def main() -> None:
    """CLI: discover filtered/manifest pairs in a directory and merge them."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-dir", type=Path, default=Path("data/teacher"),
        help="Directory containing *_filtered.jsonl and *.source_rows.jsonl pairs.",
    )
    parser.add_argument(
        "--out", type=Path, default=Path("data/teacher/sft_trl.jsonl"),
        help="Destination merged SFT JSONL.",
    )
    parser.add_argument(
        "--stems", nargs="+", required=True,
        help="Stem names (without suffix) to include, in order.",
    )
    args = parser.parse_args()

    pairs: list[tuple[Path, Path]] = []
    for stem in args.stems:
        filtered = args.data_dir / f"{stem}_filtered.jsonl"
        manifest = args.data_dir / f"{stem}.source_rows.jsonl"
        if not filtered.exists() or not manifest.exists():
            print(f"skip {stem}: missing {filtered} or {manifest}")
            continue
        pairs.append((filtered, manifest))
    total = build_sft_dataset(pairs, args.out)
    print(f"wrote {args.out} rows={total}")


if __name__ == "__main__":
    main()
