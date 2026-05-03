const SUFFIX_NAME_RE = /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー・]+(?:株式会社|グループ(?:ホールディングス|HD)?))/u;
const PREFIX_NAME_RE = /株式会社([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー・]+)/u;

export function parseJpName(memoText: string): string {
  const suffixMatch = memoText.match(SUFFIX_NAME_RE);
  if (suffixMatch) return suffixMatch[1];
  const prefixMatch = memoText.match(PREFIX_NAME_RE);
  if (prefixMatch) return `株式会社${prefixMatch[1]}`;
  return "";
}

const SUFFIX_MAP: Array<[RegExp, string]> = [
  [/グループホールディングス株式会社$/, "HD"],
  [/ホールディングス株式会社$/, "HD"],
  [/グループ株式会社$/, ""],
  [/株式会社$/, ""],
];

export function shortenJpName(name: string): string {
  if (!name) return "";
  // Prefix form: `株式会社X` — strip the prefix, take first two chars of X.
  if (name.startsWith("株式会社")) {
    const stem = name.slice("株式会社".length);
    if (stem) return Array.from(stem).slice(0, 2).join("");
  }
  for (const [re, replacement] of SUFFIX_MAP) {
    if (re.test(name)) {
      const stem = name.replace(re, "");
      const head = Array.from(stem).slice(0, 2).join("");
      return replacement ? `${head}${replacement}` : head;
    }
  }
  return name.slice(0, 4);
}
