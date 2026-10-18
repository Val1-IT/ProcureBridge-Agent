# Screenshot Plan

Capture PNG at 1440 × 900 unless specified. Use 100% browser zoom, hide browser chrome when possible, and keep every Demo Data label visible.

| # | Screenshot | Route | Required state | Important area | Must not be cropped | Caption |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Landing page | `/` | Reset state; Judge Mode inactive | Hero, CTA, value proposition, access card | Headline, Demo Data badge, both demo controls | Turn calls into controlled recovery actions. |
| 2 | Collection Queue | `/collections` | Judge step 1; Sinar row highlighted | Amount, days overdue, risk, recommended action | Table headers, row action, guide | Prioritized collection queue with recommended action. |
| 3 | AI Pre-call Briefing | `/invoices/inv-sinar` | Judge step 2; before approval | Summary, history, objective, required questions | Invoice identity and negotiation limit | AI prepares context before customer contact. |
| 4 | Approval and Guardrails | `/invoices/inv-sinar` | Both approvals saved; eight checks passed | Checklist, passed guardrails, unlocked Start CALL-E | Disclosure, data confirmation, Start control | Human approval unlocks policy-compliant outreach. |
| 5 | Live CALL-E Console | `/calls/call-sinar` | Fast Demo; transcript midway or complete | Disclosure, transcript, stage, sentiment, intent, entities | Simulation label and timer | CALL-E conversation produces structured signals. |
| 6 | Structured Result Review | `/calls/call-sinar/result` | Promise draft; before approval | Outcome, confidence, amount, date, review actions | Demo label and all four review controls | AI drafts; humans control the result. |
| 7 | Promise Tracker | `/promises` | Promise approved | Customer, amount, promise date, follow-up, status | Table headers and latest record | Approved promises become trackable commitments. |
| 8 | Audit Log | `/activity` | Main scenario approved | Approval, call, result, and commitment events | Event type, actor, timestamp | Every consequential action remains auditable. |
| 9 | Architecture | `/architecture` | Any stable state | Workflow, component statuses, legend | Implemented/simulated/integration-ready labels | Explicit boundaries from queue to audit. |
| 10 | Technical Notes | `/technical-notes` | Any stable state | Real versus simulated and fallback explanation | Section headings and status labels | Honest proof of what is real today. |

## Priority when only five uploads are allowed

1. Landing page.
2. Approval and Guardrails.
3. Live CALL-E Console.
4. Structured Result Review.
5. Promise Tracker; use the Audit Log as the first alternate.

## Published screenshot paths

Final presentation captures are served from `/submission-screenshots/` on the public deployment and referenced by the Submission Hub.

