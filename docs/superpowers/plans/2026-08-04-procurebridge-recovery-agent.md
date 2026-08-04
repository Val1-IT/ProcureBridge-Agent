# Arvanta ProcureBridge Recovery Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production-buildable, multi-page ProcureBridge demo whose guarded CALL-E simulation persists and synchronizes results across every operational view.

**Architecture:** Next.js App Router pages consume a hydrated client-side `DemoStoreProvider`, while pure domain modules own eligibility, transitions, result application, and audit creation. CALL-E providers, route handlers, webhook processing, and optional Supabase repositories remain isolated from UI components.

**Tech Stack:** Next.js 15, React, TypeScript, Tailwind CSS, Vitest, Testing Library, localStorage, optional Supabase SQL.

## Global Constraints

- Every simulated record, chart, metric, transcript, and activity must be visibly labeled **Demo Data**.
- MockCallProvider is the default whenever `CALLE_API_KEY` is absent.
- Financial state changes only after explicit structured-result approval.
- The call state machine enforces approval, consent, contact-hour, daily-frequency, dispute, phone, invoice, and do-not-contact guardrails.
- State persistence uses an explicit schema version and never reads browser storage during server rendering.
- Visual language is cream/off-white, navy, restrained amber, strong borders, operational typography, and no purple glow, glassmorphism, blob, or generic SaaS template treatment.

---

### Task 1: Scaffold and versioned demo domain

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`
- Create: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Create: `lib/domain/types.ts`, `lib/demo/seed.ts`, `lib/demo/persistence.ts`
- Test: `tests/persistence.test.ts`

**Interfaces:**
- Produces: `DemoState`, `DEMO_SCHEMA_VERSION`, `createSeedState()`, `serializeDemoState(state)`, `deserializeDemoState(value)`, `resetDemoState()`.

- [ ] **Step 1: Initialize the site starter and add Vitest scripts**

Preserve the starter's package manager and add `typecheck`, `lint`, and `test` scripts. Configure `@/*` path aliases for application imports.

- [ ] **Step 2: Write failing persistence tests**

```ts
expect(createSeedState().schemaVersion).toBe(DEMO_SCHEMA_VERSION);
expect(deserializeDemoState('{"schemaVersion":0}')).toEqual(createSeedState());
expect(deserializeDemoState(serializeDemoState(state))).toEqual(state);
```

- [ ] **Step 3: Run `npm.cmd run test -- tests/persistence.test.ts` and confirm failure because the persistence module is absent**

- [ ] **Step 4: Define domain records, deterministic scenario seeds, and resilient serialization**

Seed the three named customers and invoices plus initial audit and activity records. Invalid JSON or mismatched versions must return a fresh seed.

- [ ] **Step 5: Re-run the persistence test and confirm it passes**

### Task 2: Approval and call-eligibility state machine

**Files:**
- Create: `lib/domain/approval.ts`, `lib/domain/guardrails.ts`, `lib/domain/call-machine.ts`
- Test: `tests/approval-guardrails.test.ts`, `tests/call-machine.test.ts`

**Interfaces:**
- Consumes: `Customer`, `Invoice`, `CallApproval`, `CallRecord`, `Dispute`.
- Produces: `validateApproval(approval): ApprovalIssue[]`, `evaluateCallEligibility(input): GuardrailDecision`, `transitionCall(state, event): CallLifecycle`.

- [ ] **Step 1: Write one failing test per required guardrail**

```ts
expect(evaluateCallEligibility(validInput).allowed).toBe(true);
expect(evaluateCallEligibility({...validInput, customer: {...customer, doNotContact: true}}).codes).toContain('DO_NOT_CONTACT');
expect(evaluateCallEligibility({...validInput, openDispute: true}).codes).toContain('OPEN_DISPUTE');
```

Also assert missing approval fields, missing disclosure, invalid consent, outside contact hours, an earlier same-day call, invalid phone, and invalid invoice data.

- [ ] **Step 2: Run the guardrail tests and confirm they fail because the functions are absent**

- [ ] **Step 3: Implement deterministic validation and transitions**

Allowed lifecycle transitions are `draft -> approval_pending -> approved -> creating -> connecting -> active -> completed -> result_pending_review -> result_approved|human_review|result_rejected`, with `blocked` and `failed` branches. Invalid transitions return an explicit error result.

- [ ] **Step 4: Re-run approval and state-machine tests and confirm they pass**

### Task 3: Result review, synchronization, and client store

**Files:**
- Create: `lib/domain/results.ts`, `lib/demo/reducer.ts`
- Create: `components/demo-store-provider.tsx`, `components/use-demo-store.ts`
- Test: `tests/scenarios.test.ts`, `tests/reducer.test.ts`

**Interfaces:**
- Produces: `applyApprovedResult(state, result, actor)`, `demoReducer(state, action)`, `DemoStoreProvider`, `useDemoStore()`.

- [ ] **Step 1: Write failing tests for all scenario outcomes and review dispositions**

```ts
expect(applyApprovedResult(seed, promiseResult, actor).paymentCommitments).toHaveLength(1);
expect(applyApprovedResult(seed, disputeResult, actor).disputes[0].status).toBe('open');
expect(applyApprovedResult(seed, failedContactResult, actor).invoices[2].contactStatus).toBe('Scheduled');
expect(rejectResult(seed, resultId).paymentCommitments).toHaveLength(0);
```

Assert invoice status, dashboard-derived values, audit entries, follow-up timestamps, risk changes, and blocked repeat calls remain synchronized.

- [ ] **Step 2: Run scenario tests and confirm expected missing-function failures**

- [ ] **Step 3: Implement pure result application and the versioned store reducer**

The provider mounts with seed state, hydrates in an effect, renders an initializing state until hydration completes, writes every subsequent mutation, listens for browser `storage` events, and emits an app-local synchronization event.

- [ ] **Step 4: Re-run persistence, reducer, and scenario tests and confirm they pass**

### Task 4: CALL-E providers, transcript simulation, and webhook processing

**Files:**
- Create: `lib/calle/types.ts`, `lib/calle/client.ts`, `lib/calle/mock-provider.ts`, `lib/calle/webhook-handler.ts`
- Create: `app/api/calls/route.ts`, `app/api/calls/[callId]/route.ts`, `app/api/calls/[callId]/end/route.ts`, `app/api/calle/webhook/route.ts`
- Test: `tests/calle-provider.test.ts`, `tests/webhook.test.ts`

**Interfaces:**
- Produces: `CallProvider`, `CalleProvider`, `MockCallProvider`, `getCallProvider(env)`, `processWebhook(input, context)`.

- [ ] **Step 1: Write failing provider-selection and webhook tests**

```ts
expect(getCallProvider({})).toBeInstanceOf(MockCallProvider);
expect(await processWebhook(validEvent, context)).toMatchObject({accepted: true, duplicate: false});
expect(await processWebhook(validEvent, context)).toMatchObject({accepted: true, duplicate: true});
expect(await processWebhook(olderEvent, context)).toMatchObject({accepted: true, ignoredAsStale: true});
```

Also assert malformed payloads and failed signatures return safe errors without sensitive payload reflection.

- [ ] **Step 2: Run provider and webhook tests and confirm expected failures**

- [ ] **Step 3: Implement providers and a deterministic 30–45 second simulation**

`MockCallProvider` exposes scenario-specific staged transcript segments and supports a fast-demo interval. `CalleProvider` maps the documented REST assumptions without exposing secrets to the client.

- [ ] **Step 4: Implement safe webhook validation, event ID deduplication, timestamp ordering, audit callbacks, and documented signature boundary**

- [ ] **Step 5: Re-run provider and webhook tests and confirm they pass**

### Task 5: Operational shell, dashboard, queue, and invoice approval

**Files:**
- Create: `components/app-shell.tsx`, `components/demo-badge.tsx`, `components/status-chip.tsx`, `components/confirmation-dialog.tsx`, `components/metric-card.tsx`, `components/empty-state.tsx`
- Create: `app/dashboard/page.tsx`, `app/collections/page.tsx`, `app/invoices/[invoiceId]/page.tsx`
- Modify: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`
- Test: `tests/ui-approval.test.tsx`

**Interfaces:**
- Consumes: `useDemoStore()`, `validateApproval()`, `evaluateCallEligibility()`.
- Produces: navigable shell, dashboard metrics/charts, filterable queue, invoice brief, and approval form.

- [ ] **Step 1: Write a failing UI test that verifies Start Call is disabled until every approval is complete and displays each guardrail reason**

- [ ] **Step 2: Run the UI test and confirm the route/component is absent**

- [ ] **Step 3: Build the shared visual system and responsive navigation**

- [ ] **Step 4: Build computed dashboard metrics and CSS-based charts from store data**

- [ ] **Step 5: Build queue filters, scenario launcher, invoice details, AI briefing, approval fields, and block-reason panel**

- [ ] **Step 6: Re-run the UI approval test and confirm it passes**

### Task 6: Call console, structured review, trackers, and audit views

**Files:**
- Create: `app/calls/[callId]/page.tsx`, `app/calls/[callId]/result/page.tsx`
- Create: `app/promises/page.tsx`, `app/disputes/page.tsx`, `app/activity/page.tsx`
- Create: `components/call-transcript.tsx`, `components/result-review.tsx`, `components/audit-table.tsx`
- Test: `tests/ui-workflow.test.tsx`

**Interfaces:**
- Consumes: provider transcript segments and store actions.
- Produces: active call controls, progressive transcript, review dispositions, replay/download actions, synchronized trackers, and audit views.

- [ ] **Step 1: Write a failing workflow test for fast Promise, Dispute, and Failed Contact scenarios**

Each test approves the call, runs the mock transcript, reviews the structured result, and asserts the corresponding tracker plus audit update.

- [ ] **Step 2: Run the workflow test and confirm the missing screens fail**

- [ ] **Step 3: Implement active-call stages, timers, transcript progression, entity/sentiment/intent panels, warnings, Pause AI, Take Over, End Call, and Human Review controls**

- [ ] **Step 4: Implement editable result review with confirmation dialogs and no financial mutation before approval**

- [ ] **Step 5: Implement Promise, Dispute, Activity, and Audit pages with loading, empty, and error presentations**

- [ ] **Step 6: Implement Reset Demo Data with explicit confirmation and route-safe navigation**

- [ ] **Step 7: Re-run all workflow tests and confirm they pass**

### Task 7: Optional Supabase boundary and operator documentation

**Files:**
- Create: `lib/repository/types.ts`, `lib/repository/demo-repository.ts`, `lib/repository/supabase-repository.ts`
- Create: `supabase/schema.sql`, `README.md`
- Modify: `.env.example`

**Interfaces:**
- Produces: `RecoveryRepository`, optional Supabase implementation, complete relational schema, and setup/integration guide.

- [ ] **Step 1: Define repository methods for customers, invoices, calls, approvals, commitments, disputes, and append-only audit logs**

- [ ] **Step 2: Add SQL tables, indexes, constraints, timestamp fields, JSON audit fields, and idempotent webhook-event storage**

- [ ] **Step 3: Document standard local setup, environment variables, provider selection, CALL-E endpoint assumptions, webhook signing integration, Supabase activation, and every remaining simulation**

### Task 8: Final verification and shareable preview

**Files:**
- Modify: only files implicated by verification failures
- Create: `public/og.png` only if the generated social card passes visual inspection

- [ ] **Step 1: Run `npm.cmd run typecheck` and fix every reported error**

- [ ] **Step 2: Run `npm.cmd run lint` and fix every reported error**

- [ ] **Step 3: Run `npm.cmd run test` and fix every failing test**

- [ ] **Step 4: Run `npm.cmd run build` and fix every production-build failure**

- [ ] **Step 5: Verify the acceptance checklist against the implemented routes and domain tests**

- [ ] **Step 6: Publish through Sites when hosting is available, then stop the development server**
