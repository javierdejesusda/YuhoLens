import type { CSSProperties } from "react";

type ArrowProps = {
  size?: number;
  className?: string;
  style?: CSSProperties;
};

// Crisp single-stroke right-arrow SVG. Replaces the `→` glyph that
// renders inconsistently across platforms, especially on Windows
// fallbacks where it can read thinner than the surrounding text.
export function Arrow({ size = 12, className, style }: ArrowProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      <path d="M2.5 8h11M9.5 4l4 4-4 4" />
    </svg>
  );
}
