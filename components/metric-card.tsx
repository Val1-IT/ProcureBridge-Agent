import Link from "next/link";

interface MetricCardProps {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
  href?: string;
}

export function MetricCard({ label, value, note, accent = false, href }: MetricCardProps) {
  const card = <article className={`metric-card ${accent ? "metric-accent" : ""}`}><p className="eyebrow">{label}</p><strong>{value}</strong><span>{note}</span></article>;
  return href ? <Link href={href} aria-label={`${label}: ${value}`}>{card}</Link> : card;
}