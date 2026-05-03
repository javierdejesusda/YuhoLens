import type { EmphasisSegment } from "@/lib/types";

interface Props {
  segments: EmphasisSegment[];
  emColor?: string;
  boldColor?: string;
}

export function EmphasisText({ segments, emColor = "var(--color-vermilion)", boldColor = "var(--color-type-primary)" }: Props) {
  return (
    <>
      {segments.map((s, i) => {
        if (s.bold) return <strong key={i} style={{ color: boldColor }}>{s.text}</strong>;
        if (s.em) return <strong key={i} className="accent" style={{ color: emColor }}>{s.text}</strong>;
        return <span key={i}>{s.text}</span>;
      })}
    </>
  );
}
