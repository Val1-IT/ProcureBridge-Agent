export function StatusChip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "amber" | "green" | "red" | "blue" }) {
  return <span className={`status-chip status-${tone}`}>{children}</span>;
}
