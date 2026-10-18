# Balanced Distributor Mini ERP — Design Specification

**Date:** 9 August 2026
**Status:** Approved conversational design; awaiting written-spec review
**Product:** Arvanta Distributor Mini ERP
**Foundation:** Arvanta ProcureBridge Recovery Agent

## 1. Product intent

Arvanta Distributor Mini ERP is a focused operational ERP for a single distributor. It connects purchasing, receiving, inventory, sales, delivery, supplier/customer invoices, and payments in one auditable workflow. It is intentionally smaller than a full Arvanta ERP implementation.

The product differentiator is an approval-gated AI Supplier Agent. The agent helps procurement teams follow up late or unconfirmed purchase orders, but it cannot directly change financial, inventory, pricing, or contractual data.

The primary end-to-end flow is:

`Purchase → Goods Receipt → Inventory → Sales → Delivery → Payables/Receivables`

## 2. Product principles

- Deliver one complete distributor workflow before expanding module breadth.
- Treat the ERP core as useful without AI; AI is an operational accelerator, not a dependency.
- Require explicit human approval for calls and consequential structured results.
- Route all business mutations through domain commands rather than direct UI writes.
- Keep demo data persistent, synchronized across pages and tabs, versioned, resettable, and visibly labeled.
- Keep provider, repository, domain, and UI responsibilities separated.
- Optimize for a desktop presentation while remaining usable on tablet.

## 3. Version-one scope

### 3.1 Dashboard and Action Center

The dashboard summarizes work that requires attention:

- purchase orders waiting for approval;
- unconfirmed and overdue purchase orders;
- low-stock products;
- goods receipts awaiting review;
- sales orders blocked by insufficient stock;
- payables and receivables approaching their due dates;
- supplier commitments requiring follow-up;
- recent approvals and AI Agent activity.

Every summary links to its underlying transaction. All seeded statistics and transactions are labeled **Demo Data**.

### 3.2 Master data

- Products and product categories
- Units of measure
- Suppliers
- Customers
- One active warehouse
- Purchase and selling prices

The data model may support additional warehouses later, but version one exposes only one active warehouse and does not implement transfers.

### 3.3 Purchasing

- Purchase requests
- Purchase-order drafting and approval
- Supplier confirmation and promised delivery dates
- Partial and complete goods receipts
- Supplier discrepancies and follow-ups

Purchase-order lifecycle:

`Draft → Pending Approval → Sent → Confirmed → Partially Received → Fully Received → Completed`

Terminal alternatives are `Rejected` and `Cancelled`. A completed or cancelled purchase order cannot be called or received against.

### 3.4 Inventory

- Physical stock
- Reserved stock
- Available stock
- Incoming quantities
- Goods-in and goods-out movements
- Controlled stock adjustments
- Product stock cards

The defining calculation is:

`available stock = physical stock - reserved stock`

Inventory may never become negative. Stock changes only through approved goods receipts, completed deliveries, or approved stock adjustments.

### 3.5 Sales

- Sales orders
- Stock availability checks
- Stock reservation
- Partial or complete delivery orders
- Customer invoices

Sales lifecycle:

`Draft → Confirmed → Partially Delivered → Fully Delivered → Invoiced → Completed`

Cancelling a confirmed sales order releases its remaining reservation. When stock is insufficient, the system shows the shortage and offers a purchase-request draft; it does not create or approve purchasing documents automatically.

### 3.6 Lightweight finance

- Supplier invoices and accounts payable
- Customer invoices and accounts receivable
- Partial and full payment recording
- Due dates, remaining balances, and payment status

Version one does not implement a general ledger, journal posting, tax engine, bank reconciliation, or financial statements. Financial balances change only after explicit user actions.

### 3.7 AI Supplier Agent

The Agent prioritizes supplier follow-up for:

- purchase orders without supplier confirmation;
- overdue promised delivery dates;
- partial deliveries with outstanding quantities;
- purchase orders tied to critical stock shortages;
- price or quantity discrepancies;
- supplier commitments that have not been fulfilled.

Priority considers purchase-order value, delay, stock shortage, affected customer orders, and supplier history.

Agent workflow:

`Follow-up Queue → Supplier Brief → Human Approval → Guardrails → Mock Call → Transcript → Structured Result → Human Review → ERP Update → Audit Log`

Approval defines the call objective, permitted purchase order and products, maximum acceptable delivery date, partial-delivery allowance, price-change boundary, language, and calling time.

Possible structured outcomes are:

- delivery commitment;
- partial delivery;
- stock unavailable;
- price discrepancy;
- quantity discrepancy;
- failed contact;
- human follow-up required.

The reviewer must choose `Approve`, `Edit`, `Reject`, or `Human Review`. Only an approved result may update promised delivery dates, follow-ups, or disputes. It never directly changes received stock, invoice balances, payment status, or approved prices.

### 3.8 Approval and guardrails

Call initiation is blocked when:

- approval is incomplete;
- the supplier phone number is invalid;
- the supplier is marked Do Not Contact;
- the request is outside allowed calling hours;
- the supplier has already been called for the same purchase order that day;
- the purchase order is completed or cancelled;
- quantity or price data is invalid;
- the purchase order has an unresolved dispute requiring review.

Version one uses `MockCallProvider`. A live provider remains fail-closed until production authentication, tenancy, authorization, consent provenance, and durable repositories are active.

### 3.9 Audit log

The audit log records approvals, rejections, document transitions, inventory mutations, payment recording, call lifecycle events, result review, and follow-up creation. Reset deliberately clears that history with the prior Demo Data; the new session/reset generation is the documented reset boundary rather than an audit row inside the clean seed. Retained events contain actor, timestamp, action, entity reference, and a safe before/after summary where appropriate.

## 4. Roles and permissions

- **Owner/Admin:** complete visibility, demo settings, and master-data administration.
- **Procurement:** supplier, purchase request, purchase order, and Supplier Agent work.
- **Warehouse:** goods receipt, delivery, stock view, and proposed adjustments.
- **Sales:** customer, sales order, delivery monitoring, and customer invoice work.
- **Finance:** supplier/customer invoices, payables, receivables, and payments.
- **Approver:** purchase-order approval, price-change approval, stock-adjustment approval, and AI-result review.

Demo Mode permits role switching. Permissions are enforced in the domain command boundary, not only by hiding UI controls.

## 5. Navigation and page structure

The persistent sidebar contains:

- **Overview:** Dashboard, Action Center
- **Purchasing:** Purchase Requests, Purchase Orders, Goods Receipts, Supplier Follow-up
- **Inventory:** Stock Overview, Stock Movements, Stock Adjustments
- **Sales:** Sales Orders, Deliveries, Customer Invoices
- **Finance:** Accounts Payable, Accounts Receivable, Payments
- **Master Data:** Products, Suppliers, Customers, Warehouse
- **Control:** Approval Inbox, Audit Log, Demo Settings

Transaction detail pages consistently display header/status, dates and counterparties, item lines, totals, linked documents, approval state, activity timeline, audit history, and allowed next actions.

## 6. Transaction synchronization

| Approved business action | Atomic effects |
| --- | --- |
| Approve goods receipt | Update received PO quantities and status, create stock movements, increase physical stock, append audit event |
| Confirm sales order | Validate availability, reserve stock, update order status, append audit event |
| Complete delivery | Reduce physical and reserved stock, create stock movements, update order/delivery status, append audit event |
| Record supplier invoice | Create or update payable without changing stock, append audit event |
| Create customer invoice | Create receivable from eligible delivered quantities, append audit event |
| Record payment | Reduce the selected payable or receivable balance, update payment status, append audit event |
| Approve call result | Update commitment, follow-up, or dispute; never stock or financial balances; append audit event |

If any validation in an atomic command fails, none of its changes are stored.

## 7. Architecture

### 7.1 Boundaries

1. **Pages and components** render state and submit user intent.
2. **Domain commands and pure policies** validate permissions, approvals, invariants, calculations, and transitions.
3. **Repository interfaces** expose storage operations without binding domain logic to a provider.
4. **Demo repository** persists a versioned shared store in the browser.
5. **Optional production repository** maps the same interfaces to reviewed PostgreSQL/Supabase storage.
6. **CallProvider** isolates mock and future provider implementations from UI and domain logic.

Representative domain commands include:

- `approvePurchaseOrder`
- `receivePurchaseOrderItems`
- `confirmSalesOrder`
- `completeDelivery`
- `recordSupplierInvoice`
- `recordCustomerPayment`
- `approveSupplierCallResult`

### 7.2 Core entities

- Product, Supplier, Customer, Warehouse
- PurchaseRequest, PurchaseOrder, GoodsReceipt
- SalesOrder, DeliveryOrder
- SupplierInvoice, CustomerInvoice, Payment
- StockMovement
- SupplierCall, Approval, Dispute, FollowUp, AuditEvent

Every transaction entity has a stable ID, human-readable document number, status, creation/update timestamps, and linked-document references. Document numbers use forms such as `PO-2026-0001`, `GR-2026-0001`, and `SO-2026-0001`.

### 7.3 Demo persistence

The browser store provides:

- explicit schema version;
- deterministic seed data;
- migrations between supported versions;
- cross-page and cross-tab synchronization;
- hydration-safe client initialization;
- atomic domain updates;
- a visible Reset Demo Data action;
- safe recovery when stored data cannot be validated.

Stored demo data is never presented as production activity.

## 8. Error handling

Domain errors are stable, actionable, and phrased operationally. Examples include:

- “Received quantity exceeds the remaining Purchase Order quantity.”
- “Available stock is insufficient to confirm this Sales Order.”
- “This invoice is already fully paid.”
- “This document changed in another page. Reload the latest data.”

Validation failures do not partially mutate state. Provider errors do not leak secrets or become successful mock calls. Invalid persistent state is quarantined and the user is offered a demo-data reset.

## 9. Primary demonstration

1. A distributor receives a sales order with insufficient stock.
2. Available stock is reserved and the shortage is shown.
3. Procurement creates a purchase request from the shortage.
4. An approver approves a purchase order.
5. The supplier misses its confirmation deadline.
6. The purchase order enters the high-priority Supplier Follow-up Queue.
7. Procurement approves a supplier brief and runs a mock call.
8. The supplier promises a partial delivery today and the remainder in two days.
9. A human reviews and approves the structured result.
10. The purchase order ETA and follow-up synchronize across the ERP.
11. Warehouse approves the first goods receipt.
12. Inventory increases and the blocked sales order becomes partially fulfillable.
13. Completing the delivery reduces inventory.
14. A customer invoice creates receivables and a supplier invoice creates payables.
15. Dashboard and Audit Log reflect the complete chain.

Supporting scenarios cover supplier stock unavailability, price discrepancies, short or damaged receipts, cancelled reserved orders, partial payments, failed contact, and unauthorized actions.
For deterministic rehearsal, Judge Demo Mode starts from explicit Demo Data evidence for steps 3-5: an exact five-unit shortage PR and its linked same-demand PO in `pending_approval`. The judge must use the real Admin/Approver PO action to reach Sent before supplier follow-up. That fixture does not change the ordinary workflow: outside the guide, purchasing documents remain explicit human actions and are never auto-created or auto-approved from a Sales Order.


## 10. Visual direction

The interface retains Arvanta’s warm operational neo-brutalism: cream/off-white surfaces, navy typography, restrained amber accents, strong borders, compact operational typography, and data-dense but readable tables. It avoids purple glow, glassmorphism, decorative blobs, and generic SaaS-dashboard styling.

Desktop presentation quality is the priority. Tablet layouts use a compact sidebar, scroll-safe tables, and persistent primary actions.

## 11. Verification strategy

Automated coverage must include:

- role permissions and approvals;
- every document status transition;
- partial receipts and partial deliveries;
- reservation and availability calculations;
- negative-stock prevention;
- PO, inventory, sales, payable, and receivable synchronization;
- supplier-call guardrails;
- structured-result approval and idempotency;
- persistence, migrations, cross-tab synchronization, and reset;
- audit logging;
- safe provider and data-recovery errors.

Release verification requires type checking, lint, automated tests, coverage, production build, and browser smoke tests for the primary desktop flow plus tablet usability.

## 12. Explicitly out of scope

- General ledger and journal posting
- Tax engine and statutory reporting
- Bank reconciliation
- Payroll and human resources
- Manufacturing and bill of materials
- Fixed assets
- Multi-company consolidation
- Multi-currency accounting
- Multi-warehouse transfers
- Automatic purchasing without human approval
- Production Supabase activation
- Production CALL-E activation
- Production authentication and tenancy in the demo milestone

## 13. Acceptance criteria

The design is successfully implemented when a user can complete the primary demonstration from sales shortage through purchase follow-up, partial receipt, delivery, invoices, and audit evidence; every downstream page remains synchronized after refresh; permissions and approvals are enforced in domain logic; all simulation is clearly labeled; no live call can be made from demo authorization; and the complete verification suite passes a production build.
