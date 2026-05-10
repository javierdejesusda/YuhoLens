export type SectionMeta = {
  id: string;
  label: string;
  num: string;
  ja: string;
  inMarginalia: boolean;
};

export const SECTIONS: readonly SectionMeta[] = [
  { id: "hero", label: "Hero", num: "", ja: "", inMarginalia: false },
  { id: "problem", label: "Problem", num: "§ 01", ja: "読まれない", inMarginalia: true },
  { id: "how", label: "How it works", num: "§ 02", ja: "仕組み", inMarginalia: true },
  { id: "readalong", label: "Read along", num: "§ 02 · 5", ja: "対訳", inMarginalia: true },
  { id: "repro", label: "Repro", num: "§ 03", ja: "領収書", inMarginalia: true },
  { id: "hardware", label: "Hardware", num: "§ 04", ja: "物理", inMarginalia: true },
  { id: "access", label: "Access", num: "§ 05", ja: "開示", inMarginalia: false },
] as const;

export const TOPBAR_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "#problem", label: "Problem" },
  { href: "#how", label: "How it works" },
  { href: "#readalong", label: "Read along" },
  { href: "#hardware", label: "Hardware" },
];
