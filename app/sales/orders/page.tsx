"use client";

import Link from "next/link";
import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import type { SalesOrderInput } from "@/lib/erp/commands/sales";
import type { ErpCommandResult } from "@/lib/erp/errors";
import { authorize } from "@/lib/erp/permissions";
import { selectSalesOrderLineAvailability, selectSalesOrderReservedQuantity, selectSalesShortage } from "@/lib/erp/selectors";
import type { SalesOrder } from "@/lib/erp/types";

type SalesOrderCommand = (input: SalesOrderInput, now: string) => Promise<ErpCommandResult<SalesOrder>>;

export function executeSalesOrderCreation(command: SalesOrderCommand, input: SalesOrderInput, now: string): Promise<ErpCommandResult<SalesOrder>> {
  return command(input, now);
}

export default function SalesOrdersPage() {
  const { state } = useDemoStore();
  const commands = useErpCommands();
  const [customerId, setCustomerId] = useState(state.erp.customers.find((customer) => customer.active)?.id ?? "");
  const [productId, setProductId] = useState(state.erp.products.find((product) => product.active)?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [message, setMessage] = useState<string | null>(null);
  const mayWrite = authorize(state.erp.activeRole, "sales.write");

  async function create() {
    const product = state.erp.products.find((item) => item.id === productId);
    if (!product) return;
    const result = await executeSalesOrderCreation(commands.createSalesOrder, { customerId, lines: [{ productId, quantity: Number(quantity), unitPrice: product.salePrice }] }, new Date().toISOString());
    setMessage(result.ok ? `${result.value.orderNumber} created as a stock-neutral draft.` : result.error.message);
  }

  return <>
    <PageHeader eyebrow="Sales • Demo Data" title="Sales Orders" description="Availability and reservations are derived from physical movements and confirmed undelivered quantities." />
    {message ? <div className="operational-note" role="status">{message}</div> : null}
    <div className="purchasing-layout">
      <section className="panel purchasing-main"><div className="panel-title"><div><h2>Order workspace</h2><p className="body-copy">Draft shortages stay blocked until every line can be reserved.</p></div><StatusChip tone="blue">Demo Data</StatusChip></div><div className="table-panel"><table className="data-table"><thead><tr><th>Sales order</th><th>Customer</th><th>Availability</th><th>Reserved / delivered</th><th>Linked documents</th><th>Action</th></tr></thead><tbody>{state.erp.salesOrders.map((order) => {
        const customer = state.erp.customers.find((item) => item.id === order.customerId);
        const shortages = selectSalesShortage(state.erp, order.id);
        const available = order.lines.reduce((sum, line) => sum + selectSalesOrderLineAvailability(state.erp, order.id, line.productId), 0);
        const reserved = order.lines.reduce((sum, line) => sum + selectSalesOrderReservedQuantity(state.erp, order.id, line.productId), 0);
        const delivered = order.lines.reduce((sum, line) => sum + line.deliveredQuantity, 0);
        const requests = state.erp.purchaseRequests.filter((request) => request.sourceSalesOrderId === order.id).length;
        const deliveries = state.erp.deliveryOrders.filter((delivery) => delivery.salesOrderId === order.id).length;
        return <tr key={order.id}><td><Link className="cell-title mono" href={`/sales/orders/${order.id}`}>{order.orderNumber}</Link><span className="cell-sub">{order.status}</span></td><td>{customer?.name ?? order.customerId}</td><td>Available {available}{shortages.length ? <span className="cell-sub danger-text">Shortage {shortages.reduce((sum, line) => sum + line.shortage, 0)}</span> : null}</td><td>Reserved {reserved}<span className="cell-sub">Delivered {delivered}</span></td><td>Purchase requests {requests}<span className="cell-sub">Deliveries {deliveries}</span></td><td><Link className="button button-secondary" href={`/sales/orders/${order.id}`}>{shortages.length && requests === 0 ? "Create Purchase Request" : "Open Sales Order"}</Link></td></tr>;
      })}</tbody></table></div></section>
      <aside className="panel purchasing-form"><div className="panel-title"><div><h2>New Sales Order</h2><p className="body-copy">Creation never reserves or moves stock.</p></div></div><label className="field"><span>Customer</span><select value={customerId} disabled={!mayWrite} onChange={(event) => setCustomerId(event.target.value)}>{state.erp.customers.filter((item) => item.active).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label className="field"><span>Product</span><select value={productId} disabled={!mayWrite} onChange={(event) => setProductId(event.target.value)}>{state.erp.products.filter((item) => item.active).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label className="field"><span>Quantity</span><input type="number" min={1} step={1} value={quantity} disabled={!mayWrite} onChange={(event) => setQuantity(event.target.value)} /></label><button className="button button-full" type="button" disabled={!mayWrite} onClick={create}>Create Sales Order draft</button></aside>
    </div>
  </>;
}
