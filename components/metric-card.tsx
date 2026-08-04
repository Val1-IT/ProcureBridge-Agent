export function MetricCard({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <article className={`metric-card ${accent ? "metric-accent" : ""}`}>
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}
