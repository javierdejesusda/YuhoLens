"use client";

import dynamic from "next/dynamic";

const ReadAlong = dynamic(
  () => import("@/components/sections/readalong").then((m) => m.ReadAlong),
  {
    ssr: false,
    loading: () => (
      <section
        id="readalong"
        className="readalong-section is-paper-anchor-left"
        aria-label="Read-along"
        data-paper-stage="readalong"
        data-paper-hide
        style={{ minHeight: "900px" }}
      />
    ),
  },
);

export function ReadAlongMount() {
  return <ReadAlong />;
}
