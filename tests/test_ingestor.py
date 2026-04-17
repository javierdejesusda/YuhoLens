"""Smoke tests for the Japanese Yuho section splitter."""

from __future__ import annotations

from yuholens.ingestor import split_yuho


SAMPLE = """\
XYZ株式会社 有価証券報告書

第一部 【企業情報】
第1 【企業の概況】
当社は東京に本社を置く製造業です。

第2 【事業の状況】

事業等のリスク
当社の事業は為替変動リスクにさらされています。

経営者による財政状態、経営成績及びキャッシュ・フローの状況の分析
売上高は前年同期比8%増加しました。

第5 【経理の状況】
連結財務諸表作成基準はIFRSです。

関連当事者との取引
主要株主との取引額は2024年度で1,200百万円でした。

第二部 【提出会社の保証会社等の情報】
該当事項はありません。
"""


def test_split_yuho_detects_top_level_sections() -> None:
    spans = split_yuho(SAMPLE)
    for key in (
        "part_1",
        "company_overview",
        "business_status",
        "financial_section",
        "part_2",
    ):
        assert key in spans, f"missing top-level section: {key}"


def test_split_yuho_detects_high_signal_subsections() -> None:
    spans = split_yuho(SAMPLE)
    for key in ("risk_factors", "mda", "related_party"):
        assert key in spans, f"missing sub-section: {key}"


def test_split_yuho_preamble_is_captured() -> None:
    spans = split_yuho(SAMPLE)
    assert "preamble" in spans
    assert "XYZ株式会社" in spans["preamble"].text


def test_split_yuho_sections_carry_body_text() -> None:
    spans = split_yuho(SAMPLE)
    assert "東京に本社" in spans["company_overview"].text
    assert "連結財務諸表" in spans["financial_section"].text


def test_split_yuho_empty_input_returns_empty_mapping() -> None:
    assert split_yuho("") == {}
