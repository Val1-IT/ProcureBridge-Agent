"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDemoStore } from "@/components/demo-store-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { selectStockCard } from "@/lib/erp/selectors";

function signed(quantity: number): string { return quantity > 0 ? `+${quantity}` : String(quantity); }

export default function StockMovementsPage() {
  const { state } = useDemoStore();
  const searchParams = useSearchParams();
  const selectedProductId = searchParams.get("productId");
  const products = selectedProductId ? state.erp.products.filter((product) => product.id === selectedProductId) : state.erp.products;
  const rows = products.flatMap((product) => selectStockCard(state.erp, product.id).map((card) => ({ product, card })));
  return <>
    <PageHeader eyebrow="Inventory • Demo Data" title="Stock Movements" description="Every quantity is shown with its operational sign and the resulting physical balance for the product stock card." />
    <div className="erp-toolbar"><Link className="button button-secondary" href="/inventory/movements">All products</Link>{state.erp.products.map((product) => <Link key={product.id} className="button button-secondary" href={`/inventory/movements?productId=${product.id}`}>{product.sku}</Link>)}</div>
    <section className="panel"><div className="panel-title"><div><h2>Movement history</h2><p className="body-copy">Source, actor, timestamp, signed quantity, and running balance are derived from immutable movement records.</p></div><StatusChip tone="blue">Audit-ready</StatusChip></div>
      <div className="table-panel"><table className="data-table"><thead><tr><th>Time</th><th>Product</th><th>Source</th><th>Actor</th><th>Signed quantity</th><th>Result</th></tr></thead><tbody>{rows.map(({ product, card }) => <tr key={card.movement.id}><td>{new Date(card.movement.createdAt).toLocaleString("id-ID", { timeZone: "UTC" })}</td><td><span className="cell-title">{product.name}</span><span className="cell-subtitle mono">{product.sku}</span></td><td><span className="cell-title">{card.sourceLabel}</span><span className="cell-subtitle">{card.movement.reason ?? card.movement.sourceType}</span></td><td>{card.actorLabel}</td><td><strong>{signed(card.signedQuantity)}</strong></td><td>Balance {card.resultingBalance}</td></tr>)}</tbody></table>{rows.length === 0 ? <div className="empty-state"><strong>No movements found.</strong><p>The selected stock card has no approved inventory activity.</p></div> : null}</div>
    </section>
  </>;
}
