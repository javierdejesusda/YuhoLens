export function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {children}
    </span>
  );
}
