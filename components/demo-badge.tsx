export function DemoBadge({ compact = false }: { compact?: boolean }) {
  return <span className={compact ? "demo-badge demo-badge-compact" : "demo-badge"}>Demo Data</span>;
}
