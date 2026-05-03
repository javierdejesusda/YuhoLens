import { describe, it, expect } from "vitest";
import {
  CITATION_RE,
  parseCitations,
  stripInlineCitations,
} from "@/lib/cite-regex";

describe("CITATION_RE", () => {
  it("matches a single-quoted citation", () => {
    const text = "Revenue rose (ref: '売上高は1,125,288百万円' p.??).";
    const m = text.match(CITATION_RE);
    expect(m).not.toBeNull();
    expect(m?.[0]).toContain("売上高");
  });

  it("matches a double-quoted citation", () => {
    const text = 'Revenue rose (ref: "売上高は1,125,288百万円" p.??).';
    expect(text.match(CITATION_RE)).not.toBeNull();
  });

  it("does not match plural (refs: ...)", () => {
    expect("(refs: 'a' p.1)".match(CITATION_RE)).toBeNull();
  });

  it("tolerates inner parens inside the quoted span", () => {
    const text = "Revenue rose (ref: '売上高は1,125,288百万円(前期比1.6％増)' p.??).";
    const m = text.match(CITATION_RE);
    expect(m).not.toBeNull();
    expect(m?.[0]).toContain("前期比1.6％増");
  });
});

describe("parseCitations", () => {
  it("extracts span + pageRef for a simple ref", () => {
    const line = "Revenue rose (ref: '売上高は1,125,288百万円(前期比1.6％増)' p.??).";
    const cites = parseCitations(line);
    expect(cites).toHaveLength(1);
    expect(cites[0].span).toBe("売上高は1,125,288百万円(前期比1.6％増)");
    expect(cites[0].pageRef).toBe("??");
  });

  it("extracts a CashFlow page label", () => {
    const line =
      '- OCF turned negative (ref: "営業キャッシュフロー...-1,025,000,000" p.CashFlow).';
    const cites = parseCitations(line);
    expect(cites).toHaveLength(1);
    expect(cites[0].pageRef).toBe("CashFlow");
  });

  it("splits multiple semicolon-separated refs in a single block", () => {
    const line =
      '- Revenue (ref: "売上高...10,800,000,000" p.P&L; "営業利益...1,000,000,000" p.P&L; "販売費...5,400,000,000" p.P&L).';
    const cites = parseCitations(line);
    expect(cites).toHaveLength(3);
    expect(cites[0].span).toBe("売上高...10,800,000,000");
    expect(cites[0].pageRef).toBe("P&L");
    expect(cites[1].span).toBe("営業利益...1,000,000,000");
    expect(cites[1].pageRef).toBe("P&L");
    expect(cites[2].span).toBe("販売費...5,400,000,000");
    expect(cites[2].pageRef).toBe("P&L");
  });
});

describe("stripInlineCitations", () => {
  it("removes the ref block and the orphan space before the period", () => {
    const line =
      '- OCF negative (ref: "営業キャッシュフロー...-1,025,000,000" p.CashFlow).';
    expect(stripInlineCitations(line)).toBe("- OCF negative.");
  });

  it("removes multiple ref blocks", () => {
    const line =
      'A (ref: "x" p.P&L) and B (ref: "y" p.P&L; "z" p.P&L) end.';
    expect(stripInlineCitations(line)).toBe("A and B end.");
  });
});
