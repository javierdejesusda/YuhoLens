/**
 * Curated mapping from accent-span text to a kanji glyph rendered as an
 * x-ray overlay above the span. Lookup is case-insensitive and tolerant
 * of trailing punctuation; see `lookupAccentKanji` for the normaliser.
 */
export const ACCENT_KANJI: Record<string, string> = {
  "receipts": "領収書",
  "refused": "拒",
  "span-cited": "引用",
  "span-cited memos": "引用",
  "read in english": "英訳",
  "every claim": "主張",
  "open weights": "公開",
  "open eval": "評価",
  "open ledger": "台帳",
  "public repo": "公開",
  "192 gb hbm3. rocm 7.0.": "メモリ",
  "192 gb hbm3.": "メモリ",
  "rocm 7.0.": "メモリ",
  "same weights.": "重み",
  "watch it read.": "読",
  "pass.": "合格",
  "vermilion": "朱",
  "failures.": "失敗",
  "one dag.": "図",
  "not a chatbot.": "違",
  "mit-licensed today.": "公開",
  "cited english.": "英訳",
};

/**
 * Normalise an accent span's text content for lookup against ACCENT_KANJI.
 * Lower-cases, trims, and strips a single trailing comma. Periods are kept
 * because some keys (e.g. "192 gb hbm3.") encode them deliberately.
 */
export function lookupAccentKanji(raw: string): string | undefined {
  const normalised = raw.trim().toLowerCase().replace(/,$/, "");
  if (ACCENT_KANJI[normalised]) return ACCENT_KANJI[normalised];
  // Fallback: also try without a trailing period for keys whose source
  // markup punctuates differently than the curated entry.
  const noPeriod = normalised.replace(/\.$/, "");
  return ACCENT_KANJI[noPeriod];
}
