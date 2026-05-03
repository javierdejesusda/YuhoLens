"use client";

import dynamic from "next/dynamic";

const FailureGallery = dynamic(
  () =>
    import("@/components/sections/failure-gallery").then(
      (m) => m.FailureGallery,
    ),
  {
    ssr: false,
    loading: () => (
      <section
        id="failures"
        className="fail-section is-paper-anchor-left"
        aria-label="Failure gallery"
        data-paper-stage="failures"
        data-paper-hide
        style={{ minHeight: "700px" }}
      />
    ),
  },
);

export function FailureGalleryMount() {
  return <FailureGallery />;
}
