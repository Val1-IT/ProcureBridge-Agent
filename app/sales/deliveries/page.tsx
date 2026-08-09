"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { completeDelivery, createDeliveryOrder, type DeliveryOrderInput } from "@/lib/erp/commands/sales";
import type { ErpCommandResult } from "@/lib/erp/errors";
import { authorize } from "@/lib/erp/permissions";
import { selectPhysicalStock, selectSalesOrderReservedQuantity } from "@/lib/erp/selectors";
import type { DeliveryOrder, ErpRole, ErpState } from "@/lib/erp/types";

type DeliveryCommandRunner = <T,>(command: (state: ErpState) => ErpCommandResult<T>) => ErpCommandResult<T>;

export function executeDeliveryCreation(run: DeliveryCommandRunner, role: ErpRole, input: DeliveryOrderInput, now: string): ErpCommandResult<DeliveryOrder> {
  return run((erp) => createDeliveryOrder(erp, role, input, now));
}

export function executeDeliveryCompletion(run: DeliveryCommandRunner, role: ErpRole, deliveryOrderId: string, now: string): ErpCommandResult<DeliveryOrder> {
  return run((erp) => completeDelivery(erp, role, deliveryOrderId, now));
}

export default function DeliveryOrdersPage() {
  const { state } = useDemoStore();
  const { run } = useErpCommands();
  const searchParams = useSearchParams();
  const eligible = state.erp.salesOrders.filter((order) => order.status === "confirmed" || order.status === "partially_delivered");
  const initialOrderId = searchParams.get("salesOrderId") ?? eligible[0]?.id ?? "";
  const [salesOrderId, setSalesOrderId] = useState(initialOrderId);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const selected = eligible.find((order) => order.id === salesOrderId) ?? null;
  const mayPrepare = authorize(state.erp.activeRole, "sales.write") || authorize(state.erp.activeRole, "stock.deliver");
  const mayComplete = authorize(state.erp.activeRole, "stock.deliver");

  function create() {
    if (!selected) return;
    const lines = selected.lines.map((line) => ({ productId: line.productId, quantity: Number(quantities[line.productId] ?? line.quantity - line.deliveredQuantity) })).filter((line) => line.quantity > 0);
    const result = executeDeliveryCreation(run, state.erp.activeRole, { salesOrderId: selected.id, lines }, new Date().toISOString());
    setMessage(result.ok ? `${result.value.deliveryNumber} created as a stock-neutral draft.` : result.error.message);
  }

  function complete(deliveryOrderId: string) {
    const result = executeDeliveryCompletion(run, state.erp.activeRole, deliveryOrderId, new Date().toISOString());
    setMessage(result.ok ? `${result.value.deliveryNumber} posted with exact outbound movements.` : result.error.message);
  }

  return <>
    <PageHeader eyebrow="Sales • Demo Data" title="Deliveries" description="Draft preparation is stock-neutral; Warehouse or Admin completion posts exact outbound evidence atomically." />
    {message ? <div className="operational-note" role="status">{message}</div> : null}
    {!mayComplete ? <div className="operational-note">Warehouse or Admin role is required to complete delivery.</div> : null}
    <div className="purchasing-layout"><section className="panel purchasing-main"><div className="panel-title"><div><h2>Delivery orders</h2><p className="body-copy">Reserved and physical quantities are rechecked at posting.</p></div><StatusChip tone="blue">Demo Data</StatusChip></div><div className="table-panel"><table className="data-table"><thead><tr><th>Delivery</th><th>Sales order</th><th>Status</th><th>Quantities</th><th>Action</th></tr></thead><tbody>{state.erp.deliveryOrders.map((delivery) => <tr key={delivery.id}><td className="mono">{delivery.deliveryNumber}</td><td><Link href={`/sales/orders/${delivery.salesOrderId}`}>{state.erp.salesOrders.find((order) => order.id === delivery.salesOrderId)?.orderNumber ?? delivery.salesOrderId}</Link></td><td>{delivery.status}</td><td>{delivery.lines.map((line) => `${line.productId} ${line.quantity}`).join(", ")}</td><td>{delivery.status === "draft" && mayComplete ? <button className="button button-secondary" type="button" onClick={() => complete(delivery.id)}>Complete delivery</button> : <span>{delivery.status === "posted" ? "Posted" : "Awaiting Warehouse"}</span>}</td></tr>)}</tbody></table>{state.erp.deliveryOrders.length === 0 ? <div className="empty-state"><strong>No delivery orders yet.</strong><p>Select an eligible Sales Order to prepare one.</p></div> : null}</div></section><aside className="panel purchasing-form"><div className="panel-title"><div><h2>Prepare delivery</h2><p className="body-copy">Only confirmed remaining reservation can be selected.</p></div></div><label className="field"><span>Sales Order</span><select value={salesOrderId} disabled={!mayPrepare} onChange={(event) => setSalesOrderId(event.target.value)}><option value="">Select Sales Order</option>{eligible.map((order) => <option key={order.id} value={order.id}>{order.orderNumber}</option>)}</select></label>{selected ? selected.lines.map((line) => { const product = state.erp.products.find((item) => item.id === line.productId); const reserved = selectSalesOrderReservedQuantity(state.erp, selected.id, line.productId); return <div className="receipt-draft-lines" key={line.productId}><label htmlFor={`delivery-${line.productId}`}>{product?.name ?? line.productId}</label><input id={`delivery-${line.productId}`} aria-label={`Deliver ${product?.name ?? line.productId}`} type="number" min={1} max={reserved} step={1} value={quantities[line.productId] ?? String(reserved)} disabled={!mayPrepare} onChange={(event) => setQuantities((current) => ({ ...current, [line.productId]: event.target.value }))} /><strong>Physical {selectPhysicalStock(state.erp, line.productId)} • Reserved {reserved} • Delivered {line.deliveredQuantity}</strong></div>; }) : <div className="empty-state compact"><strong>No eligible Sales Order selected.</strong></div>}<button className="button button-full" type="button" disabled={!mayPrepare || !selected} onClick={create}>Create Delivery Order draft</button></aside></div>
  </>;
}
