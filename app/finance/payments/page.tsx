"use client";

import { useMemo, useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useErpCommands } from "@/components/erp-command-provider";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import type { PaymentInput } from "@/lib/erp/commands/finance";
import type { ErpCommandResult } from "@/lib/erp/errors";
import { formatCurrency, formatDate } from "@/lib/format";
import { authorize } from "@/lib/erp/permissions";
import { selectPayableRows, selectReceivableRows } from "@/lib/erp/selectors-finance";
import type { Payment } from "@/lib/erp/types";

type PaymentCommand = (input: PaymentInput, now: string) => Promise<ErpCommandResult<Payment>>;

export function executePaymentRecording(command: PaymentCommand, input: PaymentInput, now: string): Promise<ErpCommandResult<Payment>> {
  return command(input, now);
}

export interface PaymentConfirmationPanelProps {
  invoiceNumber: string;
  counterpartyName: string;
  direction: "payable" | "receivable";
  amount: number;
  remainingBefore: number;
  remainingAfter: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PaymentConfirmationPanel(props: PaymentConfirmationPanelProps) {
  return <section className="guardrail-warning" aria-label="Payment preview"><div className="panel-title"><div><h3>Payment preview</h3><p>Review the exact balance change before recording this Demo Data payment.</p></div><StatusChip tone="amber">Confirmation required</StatusChip></div><dl className="detail-list"><div><dt>Invoice</dt><dd>{props.invoiceNumber}</dd></div><div><dt>Counterparty</dt><dd>{props.counterpartyName}</dd></div><div><dt>Direction</dt><dd>{props.direction}</dd></div><div><dt>Payment amount</dt><dd>{formatCurrency(props.amount)}</dd></div><div><dt>Remaining before</dt><dd>{formatCurrency(props.remainingBefore)}</dd></div><div><dt>Remaining after</dt><dd>{formatCurrency(props.remainingAfter)}</dd></div></dl><div className="table-actions"><button className="button" type="button" onClick={props.onConfirm}>Confirm payment</button><button className="button button-secondary" type="button" onClick={props.onCancel}>Cancel preview</button></div></section>;
}

export default function PaymentsPage() {
  const { state } = useDemoStore();
  const commands = useErpCommands();
  const invoiceOptions = useMemo(() => [
    ...selectPayableRows(state.erp).filter((row) => row.status !== "cancelled" && row.remainingBalance > 0).map((row) => ({ ...row, direction: "payable" as const })),
    ...selectReceivableRows(state.erp).filter((row) => row.status !== "cancelled" && row.remainingBalance > 0).map((row) => ({ ...row, direction: "receivable" as const })),
  ], [state.erp]);
  const [selection, setSelection] = useState(invoiceOptions[0] ? `${invoiceOptions[0].direction}:${invoiceOptions[0].id}` : "");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<{ invoiceId: string; direction: "payable" | "receivable"; amount: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mayWrite = authorize(state.erp.activeRole, "finance.write");
  const selected = invoiceOptions.find((option) => `${option.direction}:${option.id}` === selection) ?? null;

  function previewPayment() {
    const numericAmount = Number(amount);
    if (!selected || !Number.isSafeInteger(numericAmount) || numericAmount <= 0 || numericAmount > selected.remainingBalance) {
      setMessage("Enter a positive whole amount no greater than the remaining balance.");
      setPreview(null);
      return;
    }
    setMessage(null);
    setPreview({ invoiceId: selected.id, direction: selected.direction, amount: numericAmount });
  }

  async function confirmPayment() {
    if (!preview) return;
    const result = await executePaymentRecording(commands.recordPayment, preview, new Date().toISOString());
    setMessage(result.ok ? `${result.value.paymentNumber} recorded after explicit confirmation.` : result.error.message);
    setPreview(null);
    if (result.ok) setAmount("");
  }

  return <>
    <PageHeader eyebrow="Finance • Demo Data" title="Payments" description="Payments are recorded only after a visible remaining-balance preview and explicit confirmation." />
    {message ? <div className="operational-note" role="status">{message}</div> : null}
    <div className="purchasing-layout"><section className="panel purchasing-main"><div className="panel-title"><div><h2>Payment register</h2><p className="body-copy">Cancelled entries are retained for audit but excluded from balances.</p></div><StatusChip tone="blue">Demo Data</StatusChip></div><div className="table-panel"><table className="data-table"><thead><tr><th>Payment</th><th>Invoice</th><th>Counterparty</th><th>Direction</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{state.erp.payments.map((payment) => { const invoice = payment.direction === "payable" ? state.erp.supplierInvoices.find((item) => item.id === payment.invoiceId) : state.erp.customerInvoices.find((item) => item.id === payment.invoiceId); const counterparty = payment.direction === "payable" ? state.erp.suppliers.find((item) => item.id === payment.supplierId)?.name : state.erp.customers.find((item) => item.id === payment.customerId)?.name; return <tr key={payment.id}><td className="mono">{payment.paymentNumber}</td><td className="mono">{invoice?.invoiceNumber ?? payment.invoiceId}</td><td>{counterparty ?? "Unknown counterparty"}</td><td>{payment.direction}</td><td>{formatDate(payment.paymentDate)}</td><td className="mono">{formatCurrency(payment.amount)}</td><td><StatusChip tone={payment.status === "posted" ? "green" : "red"}>{payment.status}</StatusChip></td></tr>; })}</tbody></table>{state.erp.payments.length === 0 ? <div className="empty-state"><strong>No payments recorded.</strong><p>Preview an invoice balance to begin.</p></div> : null}</div></section><aside className="panel purchasing-form"><div className="panel-title"><div><h2>Record payment</h2><p className="body-copy">Invoice direction and counterparty are derived at the command boundary.</p></div></div><label className="field"><span>Open invoice</span><select value={selection} disabled={!mayWrite || Boolean(preview)} onChange={(event) => { setSelection(event.target.value); setPreview(null); }}><option value="">Select invoice</option>{invoiceOptions.map((option) => <option value={`${option.direction}:${option.id}`} key={`${option.direction}:${option.id}`}>{option.invoiceNumber} • {option.counterpartyName} • {formatCurrency(option.remainingBalance)}</option>)}</select></label><label className="field"><span>Amount</span><input type="number" min={1} step={1} value={amount} disabled={!mayWrite || Boolean(preview)} onChange={(event) => { setAmount(event.target.value); setPreview(null); }} /></label>{selected ? <div className="operational-note"><strong>Remaining balance</strong><p>{formatCurrency(selected.remainingBalance)} • {selected.direction}</p></div> : null}<button className="button button-full" type="button" disabled={!mayWrite || !selected || Boolean(preview)} onClick={previewPayment}>Preview payment</button>{preview && selected ? <PaymentConfirmationPanel invoiceNumber={selected.invoiceNumber} counterpartyName={selected.counterpartyName} direction={preview.direction} amount={preview.amount} remainingBefore={selected.remainingBalance} remainingAfter={selected.remainingBalance - preview.amount} onConfirm={confirmPayment} onCancel={() => setPreview(null)} /> : null}{!mayWrite ? <small>Finance or Admin role is required.</small> : null}</aside></div>
  </>;
}
