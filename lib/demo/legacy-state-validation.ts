import { isStrictIsoDate, isStrictIsoInstant } from "../erp/date-validation";

type UnknownRecord = Record<string, unknown>;

const scenarios = ["promise_to_pay", "invoice_dispute", "failed_contact"];
const callStatuses = ["draft", "approval_pending", "approved", "blocked", "creating", "connecting", "active", "completed", "failed", "result_pending_review", "result_approved", "human_review", "result_rejected"];
const contactStatuses = ["Ready to Call", "Scheduled", "Promise to Pay", "Disputed", "Human Review", "Paid", "Do Not Contact"];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasStrings(value: unknown, fields: readonly string[]): value is UnknownRecord {
  return isRecord(value) && fields.every((field) => isString(value[field]));
}

function isOneOf(values: readonly string[], value: unknown): boolean {
  return typeof value === "string" && values.includes(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isNullableDate(value: unknown): boolean {
  return value === null || isStrictIsoDate(value);
}

function isNullableInstant(value: unknown): boolean {
  return value === null || isStrictIsoInstant(value);
}

function isNullableParseableDateTime(value: unknown): boolean {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

function isTimeOfDay(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function hasUniqueStrings(items: readonly UnknownRecord[], field: string): boolean {
  const values = items.map((item) => item[field]);
  return values.every(isString) && new Set(values).size === values.length;
}

function asRecords(value: unknown): UnknownRecord[] | null {
  return Array.isArray(value) && value.every(isRecord) ? value : null;
}

function isHistoryItem(value: unknown, fields: readonly string[]): value is UnknownRecord {
  return hasStrings(value, fields) && isStrictIsoDate(value.date);
}

export function hasValidLegacyDemoCollections(value: UnknownRecord): boolean {
  if (!isStrictIsoInstant(value.updatedAt) || !isRecord(value.demo)
    || !isOneOf(["real_time", "fast_demo", "instant"], value.demo.simulationSpeed)
    || !(value.demo.selectedScenario === null || isOneOf(scenarios, value.demo.selectedScenario))) return false;

  const customers = asRecords(value.customers);
  const invoices = asRecords(value.invoices);
  const calls = asRecords(value.calls);
  const approvals = asRecords(value.approvals);
  const pendingResults = asRecords(value.pendingResults);
  const paymentCommitments = asRecords(value.paymentCommitments);
  const disputes = asRecords(value.disputes);
  const auditLogs = asRecords(value.auditLogs);
  if (!customers || !invoices || !calls || !approvals || !pendingResults || !paymentCommitments || !disputes || !auditLogs) return false;

  if (![customers, invoices, calls, pendingResults, paymentCommitments, disputes, auditLogs].every((items) => hasUniqueStrings(items, "id"))
    || !hasUniqueStrings(invoices, "invoiceNumber")
    || !hasUniqueStrings(approvals, "callId")) return false;

  if (!customers.every((item) =>
    hasStrings(item, ["id", "companyName", "contactName", "phone", "email", "preferredLanguage", "timezone", "allowedCallStart", "allowedCallEnd"])
    && isOneOf(["granted", "missing", "revoked"], item.consentStatus)
    && isTimeOfDay(item.allowedCallStart)
    && isTimeOfDay(item.allowedCallEnd)
    && typeof item.doNotContact === "boolean"
    && isFiniteNumber(item.riskScore)
    && item.riskScore >= 0
    && item.riskScore <= 100
  )) return false;
  const customerById = new Map(customers.map((item) => [item.id, item]));

  if (!invoices.every((item) => {
    const paymentHistory = asRecords(item.paymentHistory);
    const contactHistory = asRecords(item.contactHistory);
    return hasStrings(item, ["id", "customerId", "invoiceNumber", "dueDate", "contactStatus", "recommendedAction", "product", "scenario", "riskLevel"])
      && customerById.has(item.customerId)
      && isFiniteNumber(item.originalAmount) && item.originalAmount > 0
      && isFiniteNumber(item.outstandingAmount) && item.outstandingAmount >= 0 && item.outstandingAmount <= item.originalAmount
      && isStrictIsoDate(item.dueDate)
      && Number.isSafeInteger(item.daysOverdue) && Number(item.daysOverdue) >= 0
      && isOneOf(["overdue", "partially_paid", "paid"], item.status)
      && isOneOf(["None", "Open", "Resolved"], item.disputeStatus)
      && isOneOf(contactStatuses, item.contactStatus)
      && isOneOf(scenarios, item.scenario)
      && isOneOf(["Low", "Medium", "High"], item.riskLevel)
      && isNullableParseableDateTime(item.lastContactAt)
      && isNullableParseableDateTime(item.nextActionAt)
      && paymentHistory !== null
      && paymentHistory.every((history) => isHistoryItem(history, ["date", "note"]) && isFiniteNumber(history.amount) && history.amount >= 0)
      && contactHistory !== null
      && contactHistory.every((history) => isHistoryItem(history, ["date", "channel", "note"]));
  })) return false;
  const invoiceById = new Map(invoices.map((item) => [item.id, item]));

  if (!calls.every((item) => {
    const invoice = invoiceById.get(item.invoiceId);
    const transcript = asRecords(item.transcript);
    return hasStrings(item, ["id", "customerId", "invoiceId", "provider", "status", "scenario"])
      && customerById.has(item.customerId)
      && invoice?.customerId === item.customerId
      && isOneOf(["mock", "calle"], item.provider)
      && isOneOf(callStatuses, item.status)
      && isOneOf(scenarios, item.scenario)
      && isNullableString(item.providerCallId)
      && isNullableInstant(item.startedAt)
      && isNullableInstant(item.endedAt)
      && Number.isSafeInteger(item.durationSeconds) && Number(item.durationSeconds) >= 0
      && ["outcome", "sentiment", "recordingUrl", "aiSummary", "humanApprovedBy"].every((field) => isNullableString(item[field]))
      && isNullableInstant(item.humanApprovedAt)
      && transcript !== null
      && transcript.every((segment) => hasStrings(segment, ["id", "speaker", "text"])
        && isOneOf(["AI", "Customer", "System"], segment.speaker)
        && Number.isSafeInteger(segment.stage) && Number(segment.stage) > 0
        && Number.isSafeInteger(segment.offsetSeconds) && Number(segment.offsetSeconds) >= 0
        && (segment.sentiment === undefined || isOneOf(["neutral", "cooperative", "concerned", "frustrated"], segment.sentiment)));
  })) return false;
  const callById = new Map(calls.map((item) => [item.id, item]));

  if (!approvals.every((item) =>
    hasStrings(item, ["callId", "objective", "maximumFollowUpDate", "language", "callTime", "approvedBy", "approvedAt"])
    && callById.has(item.callId)
    && isFiniteNumber(item.minimumPayment) && item.minimumPayment >= 0
    && typeof item.extensionAllowed === "boolean"
    && isStrictIsoDate(item.maximumFollowUpDate)
    && isTimeOfDay(item.callTime)
    && typeof item.aiDisclosureApproved === "boolean"
    && typeof item.dataConfirmed === "boolean"
    && isStrictIsoInstant(item.approvedAt)
  )) return false;

  if (!pendingResults.every((item) => {
    const invoice = invoiceById.get(item.invoiceId);
    return hasStrings(item, ["id", "callId", "customerId", "invoiceId", "scenario", "reviewStatus", "callOutcome", "customerIntent", "customerSentiment", "summary"])
      && customerById.has(item.customerId)
      && invoice?.customerId === item.customerId
      && isOneOf(scenarios, item.scenario)
      && isOneOf(["pending", "approved", "rejected", "human_review"], item.reviewStatus)
      && isOneOf(["promise_to_pay", "dispute", "failed_contact"], item.callOutcome)
      && typeof item.contactVerified === "boolean"
      && (item.promisedAmount === null || (isFiniteNumber(item.promisedAmount) && item.promisedAmount > 0))
      && isNullableDate(item.promisedDate)
      && isNullableString(item.delayReason)
      && isNullableString(item.disputeCategory)
      && typeof item.followUpRequired === "boolean"
      && isNullableDate(item.followUpDate)
      && typeof item.humanReviewRequired === "boolean"
      && isFiniteNumber(item.confidenceScore) && item.confidenceScore >= 0 && item.confidenceScore <= 1;
  })) return false;

  if (!paymentCommitments.every((item) => {
    const invoice = invoiceById.get(item.invoiceId);
    return hasStrings(item, ["id", "customerId", "invoiceId", "callId", "promisedDate", "status", "followUpStatus", "assignedOwner"])
      && customerById.has(item.customerId)
      && invoice?.customerId === item.customerId
      && callById.has(item.callId)
      && isFiniteNumber(item.promisedAmount) && item.promisedAmount > 0
      && isFiniteNumber(item.actualAmount) && item.actualAmount >= 0
      && isStrictIsoDate(item.promisedDate)
      && isOneOf(["Upcoming", "Due Today", "Fulfilled", "Partially Fulfilled", "Broken Promise", "Rescheduled", "Cancelled"], item.status)
      && isNullableDate(item.followUpDate);
  })) return false;

  if (!disputes.every((item) => {
    const invoice = invoiceById.get(item.invoiceId);
    return hasStrings(item, ["id", "customerId", "invoiceId", "callId", "category", "description", "requestedEvidence", "assignedTo", "status", "dueDate"])
      && customerById.has(item.customerId)
      && invoice?.customerId === item.customerId
      && callById.has(item.callId)
      && isOneOf(["Open", "Investigating", "Resolved"], item.status)
      && isStrictIsoDate(item.dueDate)
      && isNullableDate(item.followUpDate);
  })) return false;

  return auditLogs.every((item) =>
    hasStrings(item, ["id", "entityType", "entityId", "action", "actorType", "actorId", "createdAt"])
    && isOneOf(["human", "ai", "system", "provider"], item.actorType)
    && isStrictIsoInstant(item.createdAt)
    && (item.apiRequestId === undefined || isString(item.apiRequestId))
    && (item.guardrailViolations === undefined || (Array.isArray(item.guardrailViolations) && item.guardrailViolations.every(isString))));
}
