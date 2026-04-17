"""Pass-2 composer prompt for the YuhoLens LangGraph pipeline.

The Pass-2 stage consumes the concatenated Pass-1 per-section JSON payloads
plus the three core financial-statement JSON blobs (BS/PL/CF) and emits a
7-section English investor memo with inline Japanese-span citations. The
template mirrors build-spec section 7.4 verbatim.

The module exposes three constants:

* ``PASS2_SYSTEM`` - composer framing stressing citation fidelity and
  refusal-over-hallucination.
* ``PASS2_USER_TEMPLATE`` - Python ``.format(**kwargs)`` template. The eight
  named placeholders (``edinet_code``, ``company_name_jp``,
  ``company_name_en``, ``fiscal_year``, ``pass1_blocks``, ``bs_json``,
  ``pl_json``, ``cf_json``) substitute; any example JSON braces inside the
  memo structure are doubled for ``.format`` safety.
* ``PASS2_FEW_SHOT`` - three memo demonstrations covering the main regimes:
  clean (no going-concern), earnings-DOWN with DSO degradation, and a
  related-party-heavy filing.
"""

from __future__ import annotations

PASS2_SYSTEM: str = (
    "You are a financial analyst writing English investor memos grounded in "
    "cited Japanese passages from a 有価証券報告書. You MUST cite specific "
    "Japanese spans for every material claim. If a claim is not supported by "
    "the provided Pass-1 extractions, DO NOT include it. Refusal to speculate "
    "is preferable to hallucination."
)

PASS2_USER_TEMPLATE: str = """Company: {company_name_jp} / {company_name_en}
EDINET code: {edinet_code}
Fiscal year: {fiscal_year}

Pass-1 per-section JSON extractions (concatenated):
<<<PASS1
{pass1_blocks}
PASS1>>>

Balance sheet (JSON):
<<<BS
{bs_json}
BS>>>

Profit & loss (JSON):
<<<PL
{pl_json}
PL>>>

Cash flow (JSON):
<<<CF
{cf_json}
CF>>>

Write an English investor memo with EXACTLY the following 7 sections, in
order, using markdown ``##`` headings:

## 1. Executive summary
- 3-5 bullet points. Each bullet must cite a Japanese span inline using the
  format ``(ref: '<Japanese span>' p.N)`` where ``N`` is the Pass-1 page/offset.

## 2. Going-concern
- State whether the filing contains a 継続企業の前提に関する注記.
- If yes: cite the span verbatim and assign severity from Pass-1.
- If no: write exactly ``No going-concern note was disclosed.`` and stop this
  section - do not speculate.

## 3. Accrual quality
- Comment on the gap between reported net income and operating cash flow.
- Reference DSO / DPO / inventory-days trend only if the Pass-1 payload or
  BS/PL/CF JSON supplies the required line items. Cite at minimum one
  Japanese span supporting the qualitative claim.

## 4. Earnings direction
- UP / FLAT / DOWN, with a single-sentence justification.
- Anchor the direction in (a) a Pass-1 ``earnings_direction`` red flag OR
  (b) PL-JSON year-over-year deltas. Cite the driving Japanese span.

## 5. Top 3 risks
- Numbered list 1-3. Pull from Pass-1 ``red_flags`` across all sections,
  ranked by severity then materiality.
- Each risk: 1-2 sentences + inline citation.

## 6. Related-party
- Summarise any ``related_party`` red flags. If none, write exactly
  ``No material related-party concerns identified.``

## 7. Evidence appendix
- Bulleted list of every Japanese span cited in sections 1-6, deduplicated,
  in citation order. Format each bullet as
  ``- '<Japanese span>' -- <English paraphrase> (section: <section_key_jp>)``.

Hard rules:
- Cite a Japanese span for every material claim. Every factual sentence in
  sections 1-6 MUST carry at least one ``(ref: ...)`` citation.
- Do not introduce numerical figures that are not present in the Pass-1 JSON
  or in the BS/PL/CF JSON.
- Do not speculate about management intent, M&A, or forward guidance beyond
  what the source text literally says.
- If the Pass-1 payload is empty or contradictory, prefer a shorter memo
  over fabrication. Refusal beats hallucination.
- Use plain ASCII English prose outside of Japanese citation spans. No
  emojis, no decorative separators.
"""

PASS2_FEW_SHOT: tuple[dict[str, str], ...] = (
    {
        "pass1_summary": (
            '{"company": "Akebono Seiki K.K. (E01234)", "fiscal_year": "FY2024", '
            '"going_concern": null, '
            '"earnings_direction": {"direction": "UP", "span": "営業利益は前期比12.4%増"}, '
            '"related_party": [], '
            '"top_flags": [{"flag_type": "segment_anomaly", "severity": "low", '
            '"span": "海外セグメントの売上高は前期比3.1%減"}], '
            '"pl": {"revenue_yoy": 0.081, "op_income_yoy": 0.124, "net_income_yoy": 0.091}}'
        ),
        "expected_memo": (
            "## 1. Executive summary\n"
            "- Revenue grew 8.1% year-over-year, with operating income up 12.4% "
            "(ref: '営業利益は前期比12.4%増' p.14).\n"
            "- Overseas segment revenue declined 3.1%, diverging from the "
            "consolidated uptrend (ref: '海外セグメントの売上高は前期比3.1%減' p.22).\n"
            "- No continuation-of-business uncertainty was disclosed by management.\n"
            "- Related-party exposure is immaterial based on the filing.\n"
            "- Accrual quality is consistent with the reported earnings growth.\n"
            "\n"
            "## 2. Going-concern\n"
            "No going-concern note was disclosed.\n"
            "\n"
            "## 3. Accrual quality\n"
            "Reported net income and operating cash flow moved in the same "
            "direction year-over-year, and management's segment commentary does "
            "not flag any receivables or inventory stress "
            "(ref: '海外セグメントの売上高は前期比3.1%減' p.22). No Pass-1 red flag "
            "under ``accrual_quality`` was raised.\n"
            "\n"
            "## 4. Earnings direction\n"
            "UP. Operating income grew 12.4% year-over-year, outpacing the 8.1% "
            "revenue increase and indicating operating leverage "
            "(ref: '営業利益は前期比12.4%増' p.14).\n"
            "\n"
            "## 5. Top 3 risks\n"
            "1. Overseas segment contraction: overseas sales fell 3.1% while the "
            "group grew, indicating regional demand weakness "
            "(ref: '海外セグメントの売上高は前期比3.1%減' p.22).\n"
            "2. No additional high-severity risks were flagged by Pass-1.\n"
            "3. No additional high-severity risks were flagged by Pass-1.\n"
            "\n"
            "## 6. Related-party\n"
            "No material related-party concerns identified.\n"
            "\n"
            "## 7. Evidence appendix\n"
            "- '営業利益は前期比12.4%増' -- operating income rose 12.4% YoY "
            "(section: 経営成績の概況)\n"
            "- '海外セグメントの売上高は前期比3.1%減' -- overseas segment "
            "revenue declined 3.1% YoY (section: セグメント情報)\n"
        ),
    },
    {
        "pass1_summary": (
            '{"company": "Kitagawa Industries K.K. (E02345)", "fiscal_year": "FY2024", '
            '"going_concern": null, '
            '"earnings_direction": {"direction": "DOWN", "span": "営業利益は前期比27.8%減"}, '
            '"accrual_quality": [{"severity": "medium", '
            '"span": "売上債権回転日数は前期の58日から81日に悪化"}], '
            '"related_party": [], '
            '"pl": {"revenue_yoy": -0.041, "op_income_yoy": -0.278, "net_income_yoy": -0.312}, '
            '"cf": {"op_cf_yoy": -0.44}}'
        ),
        "expected_memo": (
            "## 1. Executive summary\n"
            "- Operating income fell 27.8% year-over-year on a 4.1% revenue "
            "decline, indicating meaningful margin compression "
            "(ref: '営業利益は前期比27.8%減' p.11).\n"
            "- Days sales outstanding deteriorated from 58 to 81 days, widening "
            "the accrual gap (ref: '売上債権回転日数は前期の58日から81日に悪化' p.19).\n"
            "- Operating cash flow dropped 44% year-over-year, materially "
            "underperforming the net income decline.\n"
            "- No going-concern note was disclosed, but cash conversion is "
            "weakening.\n"
            "- No material related-party concerns were identified.\n"
            "\n"
            "## 2. Going-concern\n"
            "No going-concern note was disclosed.\n"
            "\n"
            "## 3. Accrual quality\n"
            "Receivables days extended by 23 days year-over-year while operating "
            "cash flow fell 44%, a materially worse move than the 31.2% net "
            "income decline. This indicates earnings are being supported by "
            "looser collection, not cash "
            "(ref: '売上債権回転日数は前期の58日から81日に悪化' p.19).\n"
            "\n"
            "## 4. Earnings direction\n"
            "DOWN. Operating income declined 27.8% year-over-year on a 4.1% "
            "revenue decrease, indicating negative operating leverage "
            "(ref: '営業利益は前期比27.8%減' p.11).\n"
            "\n"
            "## 5. Top 3 risks\n"
            "1. Receivables quality: DSO expansion from 58 to 81 days raises the "
            "risk of write-downs or revenue reversals "
            "(ref: '売上債権回転日数は前期の58日から81日に悪化' p.19).\n"
            "2. Margin compression: operating income fell nearly seven times "
            "faster than revenue, pointing to fixed-cost deleveraging "
            "(ref: '営業利益は前期比27.8%減' p.11).\n"
            "3. No additional high-severity risks were flagged by Pass-1.\n"
            "\n"
            "## 6. Related-party\n"
            "No material related-party concerns identified.\n"
            "\n"
            "## 7. Evidence appendix\n"
            "- '営業利益は前期比27.8%減' -- operating income fell 27.8% YoY "
            "(section: 経営成績の概況)\n"
            "- '売上債権回転日数は前期の58日から81日に悪化' -- DSO deteriorated "
            "from 58 to 81 days (section: 財政状態の概況)\n"
        ),
    },
    {
        "pass1_summary": (
            '{"company": "Minami Holdings K.K. (E03456)", "fiscal_year": "FY2024", '
            '"going_concern": null, '
            '"earnings_direction": {"direction": "FLAT", "span": "営業利益は前期並みの水準"}, '
            '"related_party": ['
            '{"severity": "high", '
            '"span": "独立した第三者からの相見積は取得しておりません"}, '
            '{"severity": "medium", '
            '"span": "関連当事者向け売掛金は前期末比2.1倍"}], '
            '"risk_factors": ['
            '{"severity": "high", '
            '"span": "代表取締役が支配する関連会社との取引が売上高の18.5%"}], '
            '"pl": {"revenue_yoy": 0.012, "op_income_yoy": 0.003}}'
        ),
        "expected_memo": (
            "## 1. Executive summary\n"
            "- Revenue and operating income were flat year-over-year, masking a "
            "significant shift toward related-party counterparties.\n"
            "- A representative-director-controlled affiliate now accounts for "
            "18.5% of consolidated revenue "
            "(ref: '代表取締役が支配する関連会社との取引が売上高の18.5%' p.31).\n"
            "- Related-party receivables have more than doubled year-over-year "
            "(ref: '関連当事者向け売掛金は前期末比2.1倍' p.33).\n"
            "- No independent third-party quotation was obtained for the "
            "largest related-party contract "
            "(ref: '独立した第三者からの相見積は取得しておりません' p.33).\n"
            "- No going-concern note was disclosed.\n"
            "\n"
            "## 2. Going-concern\n"
            "No going-concern note was disclosed.\n"
            "\n"
            "## 3. Accrual quality\n"
            "Reported operating income was essentially unchanged "
            "(ref: '営業利益は前期並みの水準' p.12), but the doubling of "
            "related-party receivables "
            "(ref: '関連当事者向け売掛金は前期末比2.1倍' p.33) indicates that a "
            "growing portion of revenue is not yet cash-converted. Pass-1 did not "
            "flag broader accrual-quality deterioration beyond the related-party "
            "concentration.\n"
            "\n"
            "## 4. Earnings direction\n"
            "FLAT. Operating income was at prior-year levels on a 1.2% revenue "
            "gain (ref: '営業利益は前期並みの水準' p.12).\n"
            "\n"
            "## 5. Top 3 risks\n"
            "1. Revenue concentration with a director-controlled affiliate at "
            "18.5% of sales creates governance and going-concern dependency risk "
            "(ref: '代表取締役が支配する関連会社との取引が売上高の18.5%' p.31).\n"
            "2. Related-party contracting was not benchmarked against "
            "independent quotations, undermining arms-length pricing assurance "
            "(ref: '独立した第三者からの相見積は取得しておりません' p.33).\n"
            "3. Related-party receivables more than doubled year-over-year, "
            "raising the risk of impairment or revenue reversal "
            "(ref: '関連当事者向け売掛金は前期末比2.1倍' p.33).\n"
            "\n"
            "## 6. Related-party\n"
            "Related-party exposure is material and concentrated: an affiliate "
            "controlled by the representative director provides 18.5% of "
            "consolidated revenue, related-party receivables have grown 2.1x "
            "year-over-year, and no independent quotation was obtained to "
            "validate pricing (refs: "
            "'代表取締役が支配する関連会社との取引が売上高の18.5%' p.31; "
            "'関連当事者向け売掛金は前期末比2.1倍' p.33; "
            "'独立した第三者からの相見積は取得しておりません' p.33).\n"
            "\n"
            "## 7. Evidence appendix\n"
            "- '営業利益は前期並みの水準' -- operating income was flat YoY "
            "(section: 経営成績の概況)\n"
            "- '代表取締役が支配する関連会社との取引が売上高の18.5%' -- "
            "director-controlled affiliate accounts for 18.5% of revenue "
            "(section: 事業等のリスク)\n"
            "- '関連当事者向け売掛金は前期末比2.1倍' -- related-party receivables "
            "grew 2.1x YoY (section: 関連当事者との取引)\n"
            "- '独立した第三者からの相見積は取得しておりません' -- no "
            "independent quotation was obtained (section: 関連当事者との取引)\n"
        ),
    },
)
