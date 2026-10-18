"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { PageHeader } from "@/components/page-header";
import type { AsyncErpCommandExecutor } from "@/components/erp-command-provider";
import { StatusChip } from "@/components/status-chip";
import { authorize } from "@/lib/erp/permissions";
import { canCancelSalesOrder } from "@/lib/erp/order-cancellation";
import { selectSalesOrderLineAvailability, selectSalesOrderReservedQuantity, selectSalesShortage } from "@/lib/erp/selectors";

export function executeSalesOrderConfirmation(commands: Pick<AsyncErpCommandExecutor, "confirmSalesOrder">, salesOrderId: string, now: string) {
  return commands.confirmSalesOrder(salesOrderId, now);
}

export function executeSalesOrderCancellation(commands: Pick<AsyncErpCommandExecutor, "cancelSalesOrder">, salesOrderId: string, now: string) {
  return commands.cancelSalesOrder(salesOrderId, now);
}

export function executeShortagePurchaseRequest(commands: Pick<AsyncErpCommandExecutor, "createPurchaseRequestFromShortage">, salesOrderId: string, now: string) {
  return commands.createPurchaseRequestFromShortage(salesOrderId, now);
}

export default function SalesOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { state } = useDemoStore();
  const commands = useErpCommands();
  const [message, setMessage] = useState<string | null>(null);
  const order = state.erp.salesOrders.find((item) => item.id === orderId);
  if (!order) return <><PageHeader eyebrow="Sales • Demo Data" title="Sales Order not found" description="Reload the list to use the latest persisted state." /><Link className="button" href="/sales/orders">Back to Sales Orders</Link></>;
  const customer = state.erp.customers.find((item) => item.id === order.customerId);
  const shortages = selectSalesShortage(state.erp, order.id);
  const requests = state.erp.purchaseRequests.filter((request) => request.sourceSalesOrderId === order.id);
  const deliveries = state.erp.deliveryOrders.filter((delivery) => delivery.salesOrderId === order.id);
  const mayWrite = authorize(state.erp.activeRole, "sales.write");
  const canCancel = canCancelSalesOrder(state.erp, state.erp.activeRole, order.id);

  async function perform(kind: "confirm" | "cancel" | "request") {
    const now = new Date().toISOString();
    const result = kind === "confirm" ? await executeSalesOrderConfirmation(commands, order!.id, now)
      : kind === "cancel" ? await executeSalesOrderCancellation(commands, order!.id, now)
        : await executeShortagePurchaseRequest(commands, order!.id, now);
    setMessage(result.ok ? "Sales command committed with one revision and audit event." : result.error.message);
  }

  return <>
    <PageHeader eyebrow="Sales • Sales Order • Demo Data" title={order.orderNumber} description={`${customer?.name ?? order.customerId} • ${order.status}`} actions={<div className="header-actions"><Link className="button button-secondary" href="/sales/orders">Back</Link>{order.status === "draft" && shortages.length === 0 && mayWrite ? <button className="button" type="button" onClick={() => perform("confirm")}>Confirm Sales Order</button> : null}{order.status === "draft" && shortages.length > 0 && requests.length === 0 && mayWrite ? <button className="button" type="button" onClick={() => perform("request")}>Create Purchase Request</button> : null}{canCancel ? <button className="button button-ghost danger-action" type="button" onClick={() => perform("cancel")}>Cancel Sales Order</button> : null}</div>} />
    {message ? <div className="operational-note" role="status">{message}</div> : null}
    {shortages.length ? <div className="operational-note" role="alert">Available stock is insufficient to confirm this Sales Order. {shortages.map((line) => `${line.productId}: shortage ${line.shortage}`).join(", ")}.</div> : null}
    <div className="detail-grid"><div className="detail-main-stack"><section className="panel"><div className="panel-title"><div><h2>Availability and fulfillment</h2><p className="body-copy">Reservation is derived from confirmed remaining undelivered quantity.</p></div><StatusChip tone={shortages.length ? "red" : "green"}>{order.status}</StatusChip></div><div className="table-panel"><table className="data-table"><thead><tr><th>Product</th><th>Ordered</th><th>Available before confirmation</th><th>Reserved</th><th>Delivered</th></tr></thead><tbody>{order.lines.map((line) => { const product = state.erp.products.find((item) => item.id === line.productId); return <tr key={line.productId}><td><span className="cell-title">{product?.name ?? line.productId}</span><span className="cell-sub mono">{product?.sku}</span></td><td>{line.quantity}</td><td>{selectSalesOrderLineAvailability(state.erp, order.id, line.productId)}</td><td>{selectSalesOrderReservedQuantity(state.erp, order.id, line.productId)}</td><td>{line.deliveredQuantity}</td></tr>; })}</tbody></table></div></section></div><aside className="detail-side-stack"><section className="panel"><div className="panel-title"><h2>Linked documents</h2></div><div className="linked-document-list"><Link href="/purchasing/requests">Purchase requests ({requests.length})</Link>{requests.map((request) => <span key={request.id}>{request.requestNumber} • {request.status}</span>)}<Link href={`/sales/deliveries?salesOrderId=${order.id}`}>Delivery orders ({deliveries.length})</Link>{deliveries.map((delivery) => <span key={delivery.id}>{delivery.deliveryNumber} • {delivery.status}</span>)}</div></section><section className="panel"><div className="panel-title"><h2>Eligible next actions</h2></div><p className="body-copy">Confirmation is available only with full line coverage. Delivery posting is restricted to Warehouse or Admin.</p></section></aside></div>
  </>;
}
