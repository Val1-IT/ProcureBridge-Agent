import { NextResponse } from "next/server";
import { getCallProvider, getCallProviderMode, type CalleEnvironment } from "../calle/client";
import type { CallProvider, CreateCallInput, CreateCallResult } from "../calle/types";
import { createSeedState } from "../demo/seed";
import { evaluateCallEligibility } from "../domain/guardrails";
import type { CallApproval, Customer, Invoice } from "../domain/types";

export interface CreateCallRequest { callId: string; customerId: string; invoiceId: string }

export interface CallAuthorizationRepository {
  readonly authorizationMode: "demo" | "production";
  getCustomer(customerId: string): Promise<Customer | null>;
  getInvoice(invoiceId: string): Promise<Invoice | null>;
  getApproval(callId: string): Promise<CallApproval | null>;
  countCallsForCustomerOnDate(customerId: string, customerLocalDate: string): Promise<number>;
  hasOpenDispute(invoiceId: string): Promise<boolean>;
  recordCreatedCall(input: CreateCallRequest, result: CreateCallResult, customerLocalDate: string): Promise<void>;
}

export class DemoCallAuthorizationRepository implements CallAuthorizationRepository {
  readonly authorizationMode = "demo" as const;
  private readonly state = createSeedState();

  async getCustomer(customerId: string) { return this.state.customers.find((item) => item.id === customerId) ?? null; }
  async getInvoice(invoiceId: string) { return this.state.invoices.find((item) => item.id === invoiceId) ?? null; }
  async getApproval(callId: string) {
    const invoice = this.state.invoices.find((item) => callId === `call-${item.id.replace("inv-", "")}`);
    if (!invoice) return null;
    return { callId, objective: invoice.recommendedAction, minimumPayment: invoice.scenario === "promise_to_pay" ? 5_000_000 : 0, extensionAllowed: invoice.scenario === "promise_to_pay", maximumFollowUpDate: "2026-08-14", language: "Bahasa Indonesia", callTime: "10:00", aiDisclosureApproved: true, dataConfirmed: true, approvedBy: "Demo server policy", approvedAt: "2026-08-04T02:59:00.000Z" } satisfies CallApproval;
  }
  async countCallsForCustomerOnDate() { return 0; }
  async hasOpenDispute(invoiceId: string) { return this.state.disputes.some((item) => item.invoiceId === invoiceId && item.status !== "Resolved"); }
  async recordCreatedCall() { /* Demo browser state is authoritative for resettable simulated activity. */ }
}

export interface CreateCallHandlerDependencies {
  repository: CallAuthorizationRepository;
  env: CalleEnvironment;
  now?: () => Date;
  providerFactory?: (mode: "mock" | "calle") => CallProvider;
}

function parseRequest(input: unknown): CreateCallRequest | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const keys = ["callId", "customerId", "invoiceId"] as const;
  if (Object.keys(value).some((key) => !keys.includes(key as typeof keys[number]))) return null;
  if (keys.some((key) => typeof value[key] !== "string" || !String(value[key]).trim() || String(value[key]).length > 160)) return null;
  return { callId: String(value.callId), customerId: String(value.customerId), invoiceId: String(value.invoiceId) };
}

function customerClock(now: Date, timezone: string): { time: string; date: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return { time: `${part("hour")}:${part("minute")}`, date: `${part("year")}-${part("month")}-${part("day")}` };
}

export function createCreateCallHandler(dependencies: CreateCallHandlerDependencies) {
  return async function handleCreateCall(request: Request): Promise<Response> {
    let input: CreateCallRequest | null;
    try { input = parseRequest(await request.json()); } catch { input = null; }
    if (!input) return NextResponse.json({ error: "Invalid call request." }, { status: 400 });

    const forceMock = new URL(request.url).searchParams.get("forceMock") === "1";
    const providerMode = getCallProviderMode(dependencies.env, { forceMock });
    if (providerMode === "calle" && dependencies.repository.authorizationMode !== "production") {
      return NextResponse.json({
        error: "Live provider requires a production authorization repository.",
        code: "LIVE_PROVIDER_REQUIRES_PRODUCTION_REPOSITORY",
      }, { status: 503 });
    }
    const [customer, invoice, approval] = await Promise.all([
      dependencies.repository.getCustomer(input.customerId),
      dependencies.repository.getInvoice(input.invoiceId),
      dependencies.repository.getApproval(input.callId),
    ]);
    if (!customer || !invoice || invoice.customerId !== customer.id) return NextResponse.json({ error: "Call request references invalid data.", codes: ["INVALID_INVOICE"] }, { status: 422 });

    let clock: { time: string; date: string };
    try {
      const effectiveNow = dependencies.now?.() ?? (providerMode === "mock" ? new Date("2026-08-04T03:00:00.000Z") : new Date());
      clock = customerClock(effectiveNow, customer.timezone);
    } catch {
      return NextResponse.json({ error: "Call request references invalid data.", codes: ["INVALID_CUSTOMER_TIMEZONE"] }, { status: 422 });
    }
    const [callsToday, openDispute] = await Promise.all([
      dependencies.repository.countCallsForCustomerOnDate(customer.id, clock.date),
      dependencies.repository.hasOpenDispute(invoice.id),
    ]);
    const decision = evaluateCallEligibility({ customer, invoice, approval, localTime: clock.time, callsToday, openDispute });
    if (!decision.allowed) return NextResponse.json({ error: "Call is not eligible.", codes: decision.codes }, { status: 409 });

    const provider = dependencies.providerFactory?.(providerMode) ?? getCallProvider(dependencies.env, { forceMock: providerMode === "mock" });
    const providerInput: CreateCallInput = { callId: input.callId, customerId: customer.id, invoiceId: invoice.id, phone: customer.phone, language: approval?.language ?? customer.preferredLanguage, scenario: invoice.scenario, disclosure: "Penelepon adalah asisten suara AI Arvanta." };
    try {
      const result = await provider.createCall(providerInput);
      await dependencies.repository.recordCreatedCall(input, result, clock.date);
      return NextResponse.json(result, { status: 201 });
    } catch {
      return NextResponse.json({ error: "Unable to create call." }, { status: 502 });
    }
  };
}
