"use client";

import Link from "next/link";
import { useDemoStore } from "@/components/demo-store-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { selectStockOverview } from "@/lib/erp/selectors";

export default function InventoryPage() {
  const { state } = useDemoStore();
  const rows = selectStockOverview(state.erp);
  return <>
    <PageHeader eyebrow="Inventory • Demo Data" title="Stock Overview" description="Physical stock comes only from approved movements. Available stock subtracts active reservations; incoming stock tracks open purchase orders." />
    <section className="panel">
      <div className="panel-title"><div><h2>One active warehouse</h2><p className="body-copy">{state.erp.warehouses.find((warehouse) => warehouse.active)?.name ?? "No valid active warehouse"}</p></div><StatusChip tone="blue">Derived balances</StatusChip></div>
      <div className="table-panel"><table className="data-table"><thead><tr><th>Product</th><th>Physical</th><th>Reserved</th><th>Available</th><th>Incoming</th><th>Stock card</th></tr></thead><tbody>{rows.map((row) => <tr key={row.product.id}><td><span className="cell-title">{row.product.name}</span><span className="cell-subtitle mono">{row.product.sku}</span></td><td>{row.physical}</td><td>{row.reserved}</td><td><strong>{row.available}</strong></td><td>{row.incoming}</td><td><Link className="button button-secondary" href={row.stockCardHref}>View movements</Link></td></tr>)}</tbody></table>{rows.length === 0 ? <div className="empty-state"><strong>No products to show.</strong><p>Add active products through Master Data.</p></div> : null}</div>
    </section>
  </>;
}
