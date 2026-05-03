import { describe, it, expect } from "vitest";
import { parseJpName, shortenJpName } from "@/lib/parse-jp-name";

describe("parseJpName", () => {
  it("extracts a 株式会社-suffixed name", () => {
    const memo =
      "1. Executive summary\n- Kintetsu Corporation (近鉄グループホールディングス株式会社, TSE code 90410) reported...";
    expect(parseJpName(memo)).toBe("近鉄グループホールディングス株式会社");
  });

  it("returns empty string on no match", () => {
    expect(parseJpName("English-only memo")).toBe("");
  });

  it("shortenJpName produces a chip label", () => {
    expect(shortenJpName("近鉄グループホールディングス株式会社")).toBe("近鉄HD");
    expect(shortenJpName("ワンダーコーポレーション株式会社")).toBe("ワン");
  });
});
