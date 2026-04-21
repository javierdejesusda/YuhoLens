"""Tests for sft_data: filtered JSONL → conversational SFT JSONL."""

from __future__ import annotations

import json
from pathlib import Path

from yuholens.training.sft_data import (
    _fit_user_to_budget,
    build_sft_dataset,
    convert_filtered_to_sft_messages,
    render_qwen_chatml,
    system_prompt_for,
)
from yuholens.training.teacher import SYSTEM_PROMPT, SYSTEM_PROMPT_ALT


def _write_pair(
    tmp_path: Path,
    stem: str,
    filtered_rows: list[dict],
    manifest_rows: list[dict],
) -> tuple[Path, Path]:
    filtered = tmp_path / f"{stem}_filtered.jsonl"
    manifest = tmp_path / f"{stem}.source_rows.jsonl"
    filtered.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in filtered_rows) + "\n",
        encoding="utf-8",
    )
    manifest.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in manifest_rows) + "\n",
        encoding="utf-8",
    )
    return filtered, manifest


def test_system_prompt_for_v1_vs_v2() -> None:
    assert system_prompt_for("industry_prediction-00001") is SYSTEM_PROMPT
    assert system_prompt_for("industry_prediction_v2-00001") is SYSTEM_PROMPT_ALT
    assert system_prompt_for("fraud_detection-00500") is SYSTEM_PROMPT
    assert system_prompt_for("fraud_detection_v2-00500") is SYSTEM_PROMPT_ALT


def test_convert_emits_messages_with_correct_roles(tmp_path: Path) -> None:
    filtered, manifest = _write_pair(
        tmp_path,
        "batch_demo",
        filtered_rows=[
            {"custom_id": "demo-00000", "memo": "hello memo", "dedup_key": "k0"},
            {"custom_id": "demo_v2-00000", "memo": "red-flag memo", "dedup_key": "k0"},
        ],
        manifest_rows=[
            {"custom_id": "demo-00000", "row": {"text": "src text", "bs": {}, "pl": {}, "cf": {}}},
            {"custom_id": "demo_v2-00000", "row": {"text": "src text", "bs": {}, "pl": {}, "cf": {}}},
        ],
    )
    records = convert_filtered_to_sft_messages(filtered, manifest)
    assert len(records) == 2

    v1, v2 = records
    assert v1["messages"][0]["role"] == "system"
    assert v1["messages"][0]["content"] is SYSTEM_PROMPT
    assert v1["messages"][1]["role"] == "user"
    assert v1["messages"][2] == {"role": "assistant", "content": "hello memo"}

    assert v2["messages"][0]["content"] is SYSTEM_PROMPT_ALT
    assert v2["messages"][2]["content"] == "red-flag memo"

    assert v1["text"].startswith("<|im_start|>system")
    assert "<|im_start|>assistant" in v1["text"]
    assert v1["text"].rstrip().endswith("<|im_end|>")


class _FakeTokenizer:
    """Deterministic whitespace tokenizer for budget-math tests."""

    def encode(self, text: str, add_special_tokens: bool = True) -> list[int]:
        return list(range(len(text.split())))

    def decode(self, ids: list[int], skip_special_tokens: bool = True) -> str:
        return " ".join(f"tok{i}" for i in ids)


def test_fit_user_to_budget_left_truncates_user_when_over_budget() -> None:
    tok = _FakeTokenizer()
    system = "sys"
    user = " ".join(f"u{i}" for i in range(1000))
    assistant = "assistant tail"
    kept = _fit_user_to_budget(system, user, assistant, tok, max_tokens=500)
    kept_tokens = tok.encode(kept, add_special_tokens=False)
    full_tokens = tok.encode(user, add_special_tokens=False)
    assert 0 < len(kept_tokens) < len(full_tokens)


def test_fit_user_to_budget_returns_user_when_already_fits() -> None:
    tok = _FakeTokenizer()
    system = "sys"
    user = "already short user"
    assistant = "short assistant"
    kept = _fit_user_to_budget(system, user, assistant, tok, max_tokens=1000)
    assert kept == user


def test_render_qwen_chatml_roundtrip_roles() -> None:
    msgs = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "u"},
        {"role": "assistant", "content": "a"},
    ]
    rendered = render_qwen_chatml(msgs)
    for marker in ("<|im_start|>system\nsys<|im_end|>",
                   "<|im_start|>user\nu<|im_end|>",
                   "<|im_start|>assistant\na<|im_end|>"):
        assert marker in rendered


def test_convert_drops_rows_without_manifest_match(tmp_path: Path) -> None:
    filtered, manifest = _write_pair(
        tmp_path,
        "batch_demo",
        filtered_rows=[
            {"custom_id": "demo-00000", "memo": "kept"},
            {"custom_id": "demo-99999", "memo": "orphan"},
        ],
        manifest_rows=[
            {"custom_id": "demo-00000", "row": {"text": "t", "bs": {}, "pl": {}, "cf": {}}},
        ],
    )
    records = convert_filtered_to_sft_messages(filtered, manifest)
    assert [r["custom_id"] for r in records] == ["demo-00000"]


def test_build_sft_dataset_preserves_pair_order(tmp_path: Path) -> None:
    f_a, m_a = _write_pair(
        tmp_path, "a",
        filtered_rows=[{"custom_id": "x-00000", "memo": "A"}],
        manifest_rows=[{"custom_id": "x-00000", "row": {"text": "t"}}],
    )
    f_b, m_b = _write_pair(
        tmp_path, "b",
        filtered_rows=[{"custom_id": "y-00000", "memo": "B"}],
        manifest_rows=[{"custom_id": "y-00000", "row": {"text": "t"}}],
    )
    out = tmp_path / "sft.jsonl"
    total = build_sft_dataset([(f_a, m_a), (f_b, m_b)], out)
    assert total == 2
    lines = out.read_text(encoding="utf-8").splitlines()
    first = json.loads(lines[0])
    second = json.loads(lines[1])
    assert first["messages"][-1]["content"] == "A"
    assert second["messages"][-1]["content"] == "B"
