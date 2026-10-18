# ProcureBridge Demo Scripts

All people, companies, invoices, transcripts, and outcomes shown are **Demo Data**.

## 90-second version

### 0–10 seconds — Business problem

“Receivables teams do not just need another automated phone call. They need a controlled way to turn customer conversations into reliable recovery work. ProcureBridge connects prioritization, voice outreach, human approval, structured outcomes, and auditability.”

### 10–25 seconds — Queue and AI briefing

“I will use the recommended PT Sinar Jaya Retail scenario. This invoice is Rp12.5 million outstanding and 18 days overdue. The AI brief summarizes the history, likely constraint, required questions, tone, and negotiation limits before any call is created.”

### 25–40 seconds — Approval and guardrails

“The Start Call button is locked. I must approve the AI disclosure and confirm the customer, invoice, outstanding amount, policy, and script. ProcureBridge then checks consent, Do Not Contact, allowed hours, repeat calls, open disputes, phone validity, and invoice validity.”

### 40–65 seconds — CALL-E simulation

“Now the CALL-E provider boundary starts the call. For this judge demo, MockCallProvider runs a clearly labeled accelerated simulation. The transcript progresses through disclosure, verification, invoice context, customer constraint, negotiation, and confirmation. Sensitive requests and unauthorized concessions remain prohibited.”

### 65–80 seconds — Structured result and approval

“The conversation becomes a structured promise: Rp7.5 million on 10 August, with follow-up on 11 August. This is only a draft. I can edit, reject, or send it to Human Review. Only Approve creates the recovery record; the invoice amount itself does not change.”

### 80–90 seconds — Tracker and audit

“The Promise Tracker, Collection Queue, Dashboard, and Audit Log now show the synchronized outcome. That is the core idea: voice becomes controlled, structured, and auditable financial operations.”

## 3-minute version

### Opening and primary scenario

“ProcureBridge is an AI-powered receivables recovery agent built around human control. I will start the guided two-minute mode. It resets only the temporary judge scenario and keeps a snapshot of the prior Demo Store so exiting the guide restores normal data.

In the Collection Queue, overdue invoices are prioritized with risk, status, and recommended actions. PT Sinar Jaya Retail owes Rp12.5 million, 18 days overdue. Its AI briefing combines invoice context, payment and contact history, possible cash-flow pressure, required questions, negotiation limits, and the approved opening.

The system has two control gates. First, the human approves call objectives, disclosure, timing, language, and data. Then the policy engine evaluates consent, Do Not Contact, allowed hours, same-day frequency, active disputes, phone validity, and invoice validity. The call cannot start until both gates pass.

The provider boundary now runs the conversation. Without live credentials, MockCallProvider produces a deterministic, clearly labeled transcript in Fast Demo mode. We can also use a 30-to-45-second real-time simulation or Instant Result for presentation recovery. If a real CALL-E call fails, ProcureBridge shows the failure and offers an explicit Switch to Demo Call action. It never calls a failed provider session a live success.

After the conversation, AI extracts a promise to pay Rp7.5 million on 10 August with follow-up on 11 August. This does not update an invoice automatically. I review the amount, date, intent, sentiment, confidence, and summary, then approve it. The Promise Tracker, queue, dashboard, and Audit Log synchronize immediately and survive refresh. The report can be copied or downloaded with phone and email masked.”

### Dispute scenario

“The second scenario demonstrates a different operational branch. CV Maju Teknik reports that the invoice quantity does not match the goods received. The AI immediately stops payment negotiation. After human result approval, ProcureBridge opens a dispute ticket, requests delivery and receiving evidence, changes the invoice status to Disputed, and blocks another collection call while the dispute is open.”

### Failed-contact scenario

“The third scenario reaches a receptionist while the authorized PIC is unavailable. The agent avoids disclosing sensitive invoice details, records no payment promise, and proposes a 09:30 callback. Human approval creates only a follow-up action.”

### Architecture, fallback, and roadmap

“Technically, the Next.js application uses pure state machines and a versioned browser store. CALL-E is isolated behind a provider interface. The webhook processor validates events, deduplicates event IDs, handles out-of-order timestamps, and appends audit evidence. Supabase is prepared through SQL and a repository boundary but is optional for the demo.

What is real today is the approval logic, policy evaluation, state transitions, structured review, downstream record creation, persistence, audit log, provider abstraction, webhook idempotency, and automated tests. Telephony is simulated when credentials are unavailable, and production still requires official CALL-E signing, enterprise identity, tenant isolation, live accounting integration, reconciliation, monitoring, and privacy controls.

ProcureBridge shows how a voice conversation can become a controlled recovery action—not just a transcript.”

