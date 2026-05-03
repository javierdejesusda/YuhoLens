import { ImageResponse } from "next/og";

export const dynamic = "force-static";

type SectionKey = "kg2" | "demo" | "manifest" | "hero";

interface SectionMeta {
  num: string;
  ja: string;
  headline: string;
}

const SECTIONS: Record<SectionKey, SectionMeta> = {
  hero: {
    num: "00",
    ja: "序章",
    headline: "Read every yūhō. Cite every claim.",
  },
  kg2: {
    num: "04",
    ja: "評価",
    headline: "KG-2 PASS · 3.88 coherence · 1.000 citation rate",
  },
  demo: {
    num: "03",
    ja: "実演",
    headline: "Live read-along · span-cited memos in real time",
  },
  manifest: {
    num: "06",
    ja: "宣言",
    headline: "Open weights. MIT. Refuse when uncertain.",
  },
};

export async function generateStaticParams(): Promise<{ section: string }[]> {
  return (Object.keys(SECTIONS) as SectionKey[]).map((section) => ({ section }));
}

const BG = "#0E0E10";
const VERMILION = "#E8503A";
const PAPER = "#F0ECE3";
const MUTED = "#9D9A8E";

export async function GET(
  _req: Request,
  context: { params: Promise<{ section: string }> },
): Promise<Response> {
  const { section } = await context.params;
  const key = (section in SECTIONS ? section : "hero") as SectionKey;
  const meta = SECTIONS[key];

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: BG,
          color: PAPER,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            fontSize: "20px",
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          <span style={{ color: VERMILION }}>§ {meta.num}</span>
          <span
            style={{
              flex: 1,
              height: "1px",
              background: "rgba(240,236,227,0.22)",
            }}
          />
          <span style={{ color: PAPER, letterSpacing: "0.06em" }}>{meta.ja}</span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div
            style={{
              fontSize: "72px",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              fontStyle: "normal",
              fontWeight: 500,
              color: PAPER,
              maxWidth: "1040px",
            }}
          >
            {meta.headline}
          </div>
          <div
            style={{
              width: "120px",
              height: "2px",
              background: VERMILION,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "18px",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          <span>
            YUHO<span style={{ color: VERMILION }}>·</span>LENS
          </span>
          <span style={{ color: PAPER }}>yuholens.site</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
