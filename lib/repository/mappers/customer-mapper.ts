import type { Customer } from "../../domain/types";
import { bool, enumText, numeric, record, text } from "./mapper-utils";

export interface CustomerRow {
  id: string;
  company_name: string;
  contact_name: string;
  phone: string;
  email: string;
  preferred_language: string;
  timezone: string;
  consent_status: Customer["consentStatus"];
  allowed_call_start: string;
  allowed_call_end: string;
  do_not_contact: boolean;
  risk_score: number | string;
}

export function toCustomerRow(customer: Customer): CustomerRow {
  return { id: customer.id, company_name: customer.companyName, contact_name: customer.contactName, phone: customer.phone, email: customer.email, preferred_language: customer.preferredLanguage, timezone: customer.timezone, consent_status: customer.consentStatus, allowed_call_start: customer.allowedCallStart, allowed_call_end: customer.allowedCallEnd, do_not_contact: customer.doNotContact, risk_score: customer.riskScore };
}

export function fromCustomerRow(input: unknown): Customer {
  const row = record(input, "customer");
  return {
    id: text(row, "id", "customer"), companyName: text(row, "company_name", "customer"), contactName: text(row, "contact_name", "customer"),
    phone: text(row, "phone", "customer"), email: text(row, "email", "customer"), preferredLanguage: text(row, "preferred_language", "customer"), timezone: text(row, "timezone", "customer"),
    consentStatus: enumText(row, "consent_status", ["granted", "missing", "revoked"] as const, "customer"),
    allowedCallStart: text(row, "allowed_call_start", "customer").slice(0, 5), allowedCallEnd: text(row, "allowed_call_end", "customer").slice(0, 5),
    doNotContact: bool(row, "do_not_contact", "customer"), riskScore: numeric(row, "risk_score", "customer"),
  };
}
