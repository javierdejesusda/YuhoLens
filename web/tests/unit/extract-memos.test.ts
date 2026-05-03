import { describe, it, expect } from "vitest";
import { parseMemoLines, splitIntoMemoSections } from "@/lib/extract-memos";

describe("parseMemoLines", () => {
  it("flags refusal lines", () => {
    const lines = parseMemoLines("Some text [evidence insufficient].");
    expect(lines.some((l) => l.refused)).toBe(true);
  });

  it("attaches citations to lines", () => {
    const lines = parseMemoLines("- Revenue rose (ref: '売上高' p.??).");
    expect(lines).toHaveLength(1);
    expect(lines[0].citations).toHaveLength(1);
    expect(lines[0].citations[0].span).toBe("売上高");
  });
});

describe("splitIntoMemoSections", () => {
  it("identifies numbered sections", () => {
    const memo = `1. Executive summary
- a
2. Going-concern assessment
- b`;
    const sections = splitIntoMemoSections(memo);
    expect(Object.keys(sections)).toContain("Executive summary");
    expect(Object.keys(sections)).toContain("Going-concern assessment");
  });
});
