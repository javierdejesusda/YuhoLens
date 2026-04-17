"""Pass-1 per-section extractor prompt for the YuhoLens LangGraph pipeline.

The Pass-1 stage consumes one segmented Yuho section at a time and emits a
structured JSON payload consisting of (a) red flags with severity tags,
(b) numerical claims, and (c) a short Japanese section summary. The schema
mirrors build-spec section 7.3 exactly; see ``yuholens-pipeline-build-spec.md``
for the authoritative taxonomy.

The module exposes three constants:

* ``PASS1_SYSTEM`` - analyst-framing system prompt.
* ``PASS1_USER_TEMPLATE`` - Python ``.format(**kwargs)`` template. All literal
  JSON braces are doubled so that only the five named placeholders
  (``section_key_jp``, ``edinet_code``, ``company_name_jp``, ``fiscal_year``,
  ``section_text``) substitute.
* ``PASS1_FEW_SHOT`` - three reference (input, expected_output) demonstrations
  drawn from the section taxonomy in build-spec section 7.2.
"""

from __future__ import annotations

PASS1_SYSTEM: str = (
    "You are a Japanese financial disclosure analyst. Read the following "
    "section of a 有価証券報告書 ({section_key_jp}). Extract a structured JSON "
    "payload with red flags, cited Japanese spans, and numerical claims. "
    "Output pure JSON, no commentary, UTF-8."
)

PASS1_USER_TEMPLATE: str = """Company: {company_name_jp} (EDINET {edinet_code})
Fiscal year: {fiscal_year}
Section: {section_key_jp}

Source text (verbatim, Japanese):
<<<
{section_text}
>>>

Return a single JSON object matching exactly this schema. Output nothing but
valid UTF-8 JSON - no markdown fences, no commentary.

```json
{{
  "section": "{section_key_jp}",
  "red_flags": [
    {{
      "flag_type": "going_concern | accrual_quality | earnings_direction | related_party | segment_anomaly | other",
      "severity": "low | medium | high",
      "japanese_span": "exact quoted substring from the source, <=200 chars",
      "span_char_offset": <integer offset into section_text>,
      "reasoning_ja": "short Japanese reasoning, <=100 chars"
    }}
  ],
  "numerical_claims": [
    {{
      "metric": "revenue | operating_income | net_income | operating_cf | ...",
      "value": <float or string>,
      "unit": "¥ million | ¥ billion | %",
      "japanese_span": "exact quoted substring"
    }}
  ],
  "section_summary_ja": "Japanese 2-3 sentence summary"
}}
```

Rules:
- ``japanese_span`` MUST be an exact substring of ``section_text``.
- ``span_char_offset`` MUST be the zero-indexed character offset at which
  ``japanese_span`` first occurs in ``section_text``.
- If no red flag applies, return ``"red_flags": []``.
- If no numerical claim is present, return ``"numerical_claims": []``.
- Never invent figures, company names, or dates that are not in the source.
- ``section_summary_ja`` MUST be written in Japanese (2-3 sentences, <=250
  characters total).
"""

PASS1_FEW_SHOT: tuple[dict[str, str], ...] = (
    {
        "section_key_jp": "事業等のリスク",
        "input_excerpt": (
            "当社グループの主要顧客である自動車業界は世界的な半導体不足および"
            "電気自動車へのシフトに伴い、発注量の下振れリスクが継続しております。"
            "前連結会計年度において主要顧客3社で売上高の約62%を占めており、"
            "これら顧客からの受注減少は当社の収益に重大な影響を及ぼす可能性が"
            "あります。加えて、原材料価格の高騰および為替変動による影響が利益率"
            "を圧迫しており、来期の営業利益は前期比で減少する見通しであります。"
        ),
        "expected_output": (
            '{"section": "事業等のリスク", "red_flags": ['
            '{"flag_type": "earnings_direction", "severity": "medium", '
            '"japanese_span": "来期の営業利益は前期比で減少する見通しであります", '
            '"span_char_offset": 181, '
            '"reasoning_ja": "経営側が営業利益の前期比減少を明示的に開示。"}], '
            '"numerical_claims": ['
            '{"metric": "customer_concentration", "value": 62.0, "unit": "%", '
            '"japanese_span": "主要顧客3社で売上高の約62%を占めており"}], '
            '"section_summary_ja": "主要顧客の発注減および原材料高が来期利益を圧迫する見通し。"}'
        ),
    },
    {
        "section_key_jp": "関連当事者との取引",
        "input_excerpt": (
            "当社の代表取締役社長が実質的に支配する株式会社ABCホールディングス"
            "に対し、当連結会計年度において1,250百万円の業務委託料を支払って"
            "おります。取引条件は市場価格を参照しておりますが、独立した第三者"
            "からの相見積は取得しておりません。また、同社に対する売掛金残高は"
            "期末時点で480百万円であり、前期末比で約2.3倍に増加しております。"
            "当社は当該取引について取締役会にて承認を得ております。"
        ),
        "expected_output": (
            '{"section": "関連当事者との取引", "red_flags": ['
            '{"flag_type": "related_party", "severity": "high", '
            '"japanese_span": "独立した第三者からの相見積は取得しておりません", '
            '"span_char_offset": 120, '
            '"reasoning_ja": "代表が支配する関連会社との高額取引で独立見積なし。"}, '
            '{"flag_type": "related_party", "severity": "medium", '
            '"japanese_span": "前期末比で約2.3倍に増加しております", '
            '"span_char_offset": 198, '
            '"reasoning_ja": "関連当事者向け売掛金が短期間で急増。"}], '
            '"numerical_claims": ['
            '{"metric": "related_party_fee", "value": 1250.0, "unit": "¥ million", '
            '"japanese_span": "1,250百万円の業務委託料"}, '
            '{"metric": "related_party_receivable", "value": 480.0, "unit": "¥ million", '
            '"japanese_span": "期末時点で480百万円"}], '
            '"section_summary_ja": "代表支配下の関連会社への業務委託料と売掛金が急増しており、独立見積も未取得。"}'
        ),
    },
    {
        "section_key_jp": "継続企業の前提に関する注記",
        "input_excerpt": (
            "当社は前連結会計年度において継続的な営業損失および営業キャッシュ"
            "フローのマイナスを計上しており、当連結会計年度末における現金及び"
            "現金同等物は892百万円であります。主要取引銀行との短期借入契約は"
            "来期上半期に返済期日を迎え、返済原資の確保に重要な不確実性が存在"
            "しております。これらの状況により、継続企業の前提に関する重要な"
            "不確実性が認められます。"
        ),
        "expected_output": (
            '{"section": "継続企業の前提に関する注記", "red_flags": ['
            '{"flag_type": "going_concern", "severity": "high", '
            '"japanese_span": "継続企業の前提に関する重要な不確実性が認められます", '
            '"span_char_offset": 178, '
            '"reasoning_ja": "経営者自身が継続企業の前提に重要な不確実性を認定。"}, '
            '{"flag_type": "going_concern", "severity": "high", '
            '"japanese_span": "返済原資の確保に重要な不確実性が存在しております", '
            '"span_char_offset": 130, '
            '"reasoning_ja": "短期借入返済の原資確保に重要な不確実性を明示。"}], '
            '"numerical_claims": ['
            '{"metric": "cash_and_equivalents", "value": 892.0, "unit": "¥ million", '
            '"japanese_span": "現金及び現金同等物は892百万円"}], '
            '"section_summary_ja": "営業損失とCFマイナスが継続し、短期借入の返済原資も未確定で、継続企業前提に重要な不確実性あり。"}'
        ),
    },
)
