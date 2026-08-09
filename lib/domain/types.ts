import type { SimulationSpeed } from "../demo/simulation";
import type { ErpState } from "../erp/types";

export type ScenarioKey = "promise_to_pay" | "invoice_dispute" | "failed_contact";
export type ConsentStatus = "granted" | "missing" | "revoked";
export type ContactStatus =
  | "Ready to Call"
  | "Scheduled"
  | "Promise to Pay"
  | "Disputed"
  | "Human Review"
  | "Paid"
  | "Do Not Contact";
export type RiskLevel = "Low" | "Medium" | "High";
export type CallLifecycle =
  | "draft"
  | "approval_pending"
  | "approved"
  | "blocked"
  | "creating"
  | "connecting"
  | "active"
  | "completed"
  | "failed"
  | "result_pending_review"
  | "result_approved"
  | "human_review"
  | "result_rejected";

export interface Customer {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  preferredLanguage: string;
  timezone: string;
  consentStatus: ConsentStatus;
  allowedCallStart: string;
  allowedCallEnd: string;
  doNotContact: boolean;
  riskScore: number;
}

export interface Invoice {
  id: string;
  customerId: string;
  invoiceNumber: string;
  originalAmount: number;
  outstandingAmount: number;
  dueDate: string;
  daysOverdue: number;
  status: "overdue" | "partially_paid" | "paid";
  disputeStatus: "None" | "Open" | "Resolved";
  lastContactAt: string | null;
  nextActionAt: string | null;
  contactStatus: ContactStatus;
  recommendedAction: string;
  product: string;
  scenario: ScenarioKey;
  riskLevel: RiskLevel;
  paymentHistory: Array<{ date: string; amount: number; note: string }>;
  contactHistory: Array<{ date: string; channel: string; note: string }>;
}

export interface CallApproval {
  callId: string;
  objective: string;
  minimumPayment: number;
  extensionAllowed: boolean;
  maximumFollowUpDate: string;
  language: string;
  callTime: string;
  aiDisclosureApproved: boolean;
  dataConfirmed: boolean;
  approvedBy: string;
  approvedAt: string;
}

export interface TranscriptSegment {
  id: string;
  speaker: "AI" | "Customer" | "System";
  text: string;
  stage: number;
  offsetSeconds: number;
  sentiment?: "neutral" | "cooperative" | "concerned" | "frustrated";
}

export interface CallRecord {
  id: string;
  customerId: string;
  invoiceId: string;
  provider: "mock" | "calle";
  providerCallId: string | null;
  status: CallLifecycle;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  outcome: string | null;
  sentiment: string | null;
  recordingUrl: string | null;
  transcript: TranscriptSegment[];
  aiSummary: string | null;
  humanApprovedBy: string | null;
  humanApprovedAt: string | null;
  scenario: ScenarioKey;
}

export type StructuredOutcome = "promise_to_pay" | "dispute" | "failed_contact";

export interface StructuredResult {
  id: string;
  callId: string;
  customerId: string;
  invoiceId: string;
  scenario: ScenarioKey;
  reviewStatus: "pending" | "approved" | "rejected" | "human_review";
  callOutcome: StructuredOutcome;
  contactVerified: boolean;
  customerIntent: string;
  promisedAmount: number | null;
  promisedDate: string | null;
  delayReason: string | null;
  disputeCategory: string | null;
  customerSentiment: string;
  followUpRequired: boolean;
  followUpDate: string | null;
  humanReviewRequired: boolean;
  summary: string;
  confidenceScore: number;
}

export interface PaymentCommitment {
  id: string;
  customerId: string;
  invoiceId: string;
  callId: string;
  promisedAmount: number;
  promisedDate: string;
  actualAmount: number;
  status: "Upcoming" | "Due Today" | "Fulfilled" | "Partially Fulfilled" | "Broken Promise" | "Rescheduled" | "Cancelled";
  followUpDate: string | null;
  followUpStatus: string;
  assignedOwner: string;
}

export interface DisputeTicket {
  id: string;
  customerId: string;
  invoiceId: string;
  callId: string;
  category: string;
  description: string;
  requestedEvidence: string;
  assignedTo: string;
  status: "Open" | "Investigating" | "Resolved";
  dueDate: string;
  followUpDate: string | null;
}

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorType: "human" | "ai" | "system" | "provider";
  actorId: string;
  beforeData: unknown;
  afterData: unknown;
  createdAt: string;
  apiRequestId?: string;
  guardrailViolations?: string[];
}

export interface DemoState {
  schemaVersion: number;
  demoSessionId: string;
  updatedAt: string;
  customers: Customer[];
  invoices: Invoice[];
  calls: CallRecord[];
  approvals: CallApproval[];
  pendingResults: StructuredResult[];
  paymentCommitments: PaymentCommitment[];
  disputes: DisputeTicket[];
  auditLogs: AuditLog[];
  demo: { simulationSpeed: SimulationSpeed; selectedScenario: ScenarioKey | null };
  erp: ErpState;
}

export interface GuardrailInput {
  customer: Customer;
  invoice: Invoice;
  approval: CallApproval | null;
  localTime: string;
  callsToday: number;
  openDispute: boolean;
}

export interface GuardrailDecision {
  allowed: boolean;
  reasons: string[];
  codes: string[];
}
