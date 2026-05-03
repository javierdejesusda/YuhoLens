import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "120px 32px",
        gap: 24,
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontStyle: "normal",
          fontWeight: 500,
          fontSize: "var(--text-hero)",
          lineHeight: 1.02,
          letterSpacing: "-0.035em",
          margin: 0,
          color: "var(--type-primary)",
          textWrap: "balance",
        }}
      >
        404 <span style={{ color: "var(--vermilion)" }}>·</span>{" "}
        <span
          className="jp"
          style={{ fontFamily: "var(--font-jp)", fontStyle: "normal" }}
        >
          訂正
        </span>
      </h1>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontStyle: "normal",
          fontSize: "var(--text-lg)",
          color: "var(--type-muted)",
          margin: 0,
          maxWidth: "42ch",
        }}
      >
        This page is not in the source.
      </p>
      <Link
        className="btn-primary"
        href="/"
        style={{ marginTop: 24 }}
      >
        Back to YuhoLens
        <span className="arr" aria-hidden="true">
          →
        </span>
      </Link>
    </main>
  );
}
