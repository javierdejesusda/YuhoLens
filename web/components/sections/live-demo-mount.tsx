"use client";

import dynamic from "next/dynamic";

const LiveDemo = dynamic(
  () => import("@/components/sections/live-demo").then((m) => m.LiveDemo),
  {
    ssr: false,
    loading: () => (
      <section
        id="demo"
        className="live-demo is-paper-anchor-right"
        aria-label="Live demo"
        data-paper-stage="demo"
        data-paper-hide
        style={{ minHeight: "1100px" }}
      />
    ),
  },
);

export function LiveDemoMount() {
  return <LiveDemo />;
}
