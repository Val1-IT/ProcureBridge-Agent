import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createSeedState } from "../lib/demo/seed";
import { MapperError } from "../lib/repository/mappers/mapper-utils";
import { fromCustomerRow, toCustomerRow } from "../lib/repository/mappers/customer-mapper";
import { fromInvoiceRow, toInvoiceRow } from "../lib/repository/mappers/invoice-mapper";
import { fromCallRow, toCallRow } from "../lib/repository/mappers/call-mapper";
import { fromApprovalRow, toApprovalRow } from "../lib/repository/mappers/approval-mapper";
import { fromCommitmentRow, toCommitmentRow } from "../lib/repository/mappers/commitment-mapper";
import { fromDisputeRow, toDisputeRow } from "../lib/repository/mappers/dispute-mapper";
import { fromAuditLogRow, toAuditLogRow } from "../lib/repository/mappers/audit-log-mapper";
import { SupabaseRecoveryRepository } from "../lib/repository/supabase-repository";

const state = createSeedState();

describe("Supabase repository mappers", () => {
  it("round trips a customer through snake_case storage", () => {
    const row = toCustomerRow(state.customers[0]);
    expect(row.company_name).toBe(state.customers[0].companyName);
    expect(fromCustomerRow(row)).toEqual(state.customers[0]);
  });

  it("round trips an invoice and converts numeric strings safely", () => {
    const row = toInvoiceRow(state.invoices[0]);
    expect(row.customer_id).toBe(state.invoices[0].customerId);
    expect(fromInvoiceRow({ ...row, original_amount: "12500000.00", outstanding_amount: "12500000", days_overdue: "18" })).toEqual(state.invoices[0]);
  });

  it("round trips payment commitments and disputes", () => {
    const commitment = {
      id: "ptp-1", customerId: "cust-1", invoiceId: "inv-1", callId: "call-1",
      promisedAmount: 7_500_000, promisedDate: "2026-08-10", actualAmount: 0,
      status: "Upcoming" as const, followUpDate: null, followUpStatus: "Scheduled", assignedOwner: "Nadia Pratama",
    };
    const dispute = {
      id: "dispute-1", customerId: "cust-1", invoiceId: "inv-1", callId: "call-1",
      category: "Quantity", description: "Mismatch", requestedEvidence: "Delivery note",
      assignedTo: "Order Operations", status: "Open" as const, dueDate: "2026-08-07", followUpDate: null,
    };
    expect(fromCommitmentRow({ ...toCommitmentRow(commitment), promised_amount: "7500000.00", actual_amount: "0" })).toEqual(commitment);
    expect(fromDisputeRow(toDisputeRow(dispute))).toEqual(dispute);
  });

  it("round trips call and approval records", () => {
    const call = {
      id: "call-1", customerId: "cust-1", invoiceId: "inv-1", provider: "mock" as const,
      providerCallId: null, status: "active" as const, startedAt: "2026-08-04T03:00:00.000Z",
      endedAt: null, durationSeconds: 12, outcome: null, sentiment: null, recordingUrl: null,
      transcript: [], aiSummary: null, humanApprovedBy: "Nadia Pratama",
      humanApprovedAt: "2026-08-04T02:59:00.000Z", scenario: "promise_to_pay" as const,
    };
    const approval = {
      callId: "call-1", objective: "Confirm", minimumPayment: 5_000_000, extensionAllowed: true,
      maximumFollowUpDate: "2026-08-14", language: "Bahasa Indonesia", callTime: "10:00",
      aiDisclosureApproved: true, dataConfirmed: true, approvedBy: "Nadia Pratama",
      approvedAt: "2026-08-04T02:59:00.000Z",
    };
    expect(fromCallRow(toCallRow(call))).toEqual(call);
    expect(fromApprovalRow({ ...toApprovalRow(approval), minimum_payment: "5000000.00" })).toEqual(approval);
  });

  it("preserves nullable fields without producing undefined", () => {
    const invoice = state.invoices[2];
    const mapped = fromInvoiceRow(toInvoiceRow(invoice));
    expect(mapped.lastContactAt).toBeNull();
    expect(mapped.nextActionAt).toBe(invoice.nextActionAt);
    expect(Object.values(mapped)).not.toContain(undefined);
  });

  it("round trips audit logs", () => {
    const log = state.auditLogs[0];
    expect(fromAuditLogRow(toAuditLogRow(log))).toEqual(log);
  });

  it("rejects an invalid or incomplete database row with a safe mapper error", () => {
    const invalid = { ...toCustomerRow(state.customers[0]), risk_score: "not-a-number" };
    expect(() => fromCustomerRow(invalid)).toThrow(MapperError);
    expect(() => fromCustomerRow({ id: "cust-1" })).toThrow("Invalid customer row");
  });

  it("uses mappers for repository reads and writes", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      if (!init?.method) return Response.json([toCustomerRow(state.customers[0])]);
      return new Response(null, { status: 204 });
    };
    try {
      const repository = new SupabaseRecoveryRepository({ url: "https://project.supabase.co/", serviceRoleKey: "test-only" });
      expect(await repository.listCustomers()).toEqual([state.customers[0]]);
      const call = { id: "call-1", customerId: "cust-1", invoiceId: "inv-1", provider: "mock" as const, providerCallId: null, status: "active" as const, startedAt: null, endedAt: null, durationSeconds: 0, outcome: null, sentiment: null, recordingUrl: null, transcript: [], aiSummary: null, humanApprovedBy: null, humanApprovedAt: null, scenario: "promise_to_pay" as const };
      await repository.saveCall(call);
      expect(JSON.parse(String(requests[1].init?.body))).toMatchObject({ customer_id: "cust-1", invoice_id: "inv-1", duration_seconds: 0 });
      expect(JSON.parse(String(requests[1].init?.body))).not.toHaveProperty("customerId");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps the optional SQL schema aligned with mapped domain fields", () => {
    const sql = readFileSync("supabase/schema.sql", "utf8");
    for (const column of ["days_overdue", "contact_status", "payment_history", "scenario", "ai_disclosure_approved", "follow_up_status", "assigned_owner"]) {
      expect(sql).toContain(column);
    }
  });
});
