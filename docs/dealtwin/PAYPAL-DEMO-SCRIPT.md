# DealTwin PayPal edition: demo video script

Narration for the PayPal edition demo video (about 2 min 42 s, 1920×1080). The video opens with
the problem and why it matters, then walks the five steps of the offline PayPal adapter in
`lib/dealtwin/payments/`. This document is separate from the Amazon/Alexa submission documents.

Every id, error code and call count on screen comes from one run of the real
`PayPalDepositService` against `FakePayPalProvider`. Nothing in the video called PayPal.

## Honesty note

- The deposit service is real code. The PayPal provider is a deterministic fake.
- The data is synthetic: no real customer, no real deal, no real money.
- No sandbox call and no live call were made. The sandbox client exists, is pinned to
  `api-m.sandbox.paypal.com`, and is off unless its environment values are set.
- Rp15,000,000 → USD 920.25 uses a **fixed demo rate** (163 rupiah per US cent), not a market quote.
- "Buyer approves the order" and "PayPal unavailable" are simulated by the fake provider.

## Narration

| # | Scene | Narration | On screen |
|---|---|---|---|
| 1 | The problem | A distributor accepts a deal and asks for a deposit: fifteen million rupiah, through PayPal. But before the money is collected, things change. The supplier raises its price. An approval is still pending. The stock reservation expires. The payment button knows none of this. It just takes the money. | Timeline from "Deal accepted" to "Pay deposit", three events landing on it, "checks none of it" |
| 2 | Why it matters | Payments fail in quieter ways too. A retry after a timeout charges twice. A redelivered webhook counts cash twice. A forged one invents cash that never arrived. All of it lands in the cash forecast used to pay suppliers. That's how a profitable deal still runs out of cash. | Three failure cards, a cash forecast with "phantom cash" |
| 3 | Title | This is DealTwin's PayPal edition. PayPal moves the money, but never decides whether the deal is safe. The proof decides, checked again at the moment money moves. | Request → Authorize → Capture → Record cash, or Void |
| 4 | Request | Step one: request. DealTwin checks that the proof matches this deal version and the reservation is live, then creates a PayPal order to authorize, tagged with the commitment and the proof's hash, at a fixed demo exchange rate. Retry with the same key: same order, no new call. Reuse the key for another amount: refused. | `ORDER-FAKE-0001`, replay with no call, `IDEMPOTENCY_KEY_REUSED` |
| 5 | Authorize | Step two: authorize. Before the buyer approves, it fails. Once they approve, PayPal places a hold. No money has moved yet. | `PAYPAL_ORDER_NOT_APPROVED`, then `AUTH-FAKE-0002` |
| 6 | Capture, blocked | Step three is where it matters: capture. Now the deal changes underneath us. The proof goes stale. An approval is pending. The proof is for another version. The reservation is cancelled. Each is blocked before PayPal is ever called. | `PROOF_NOT_CURRENT`, `APPROVAL_REQUIRED`, `PROOF_BINDING_MISMATCH`, `RESERVATION_REQUIRED`; call counter stays at 3 |
| 7 | Capture, retry | With a current proof, capture goes ahead. The first attempt fails: PayPal is unavailable. The retry reuses the same request id, so PayPal treats it as one capture, not two. | `PAYPAL_UNAVAILABLE`, then `CAPTURE-FAKE-0003`; both calls carry `PayPal-Request-Id capture-1` |
| 8 | Record cash | Step four: record the cash. A forged webhook fails PayPal's signature check. A tampered amount fails reconciliation, which also checks the proof hash. The genuine webhook posts exactly one inflow, keyed by the capture id. Deliver it again: still one entry. | `WEBHOOK_UNVERIFIED`, `RECONCILIATION_AMOUNT_MISMATCH`, `SETTLED`; ledger stays at 1 |
| 9 | Void | And the other path: if the reservation expires before capture, DealTwin voids the authorization and releases the hold. A captured deposit can never be voided. | `VOIDED` (second run), `DEPOSIT_ALREADY_CAPTURED` |
| 10 | What is real | Twenty-one focused tests cover these gates, and the sandbox client refuses any host but PayPal's sandbox. To be clear: this ran the real deposit service against a fake PayPal provider, with synthetic data. No sandbox call, no live call, no real money. | `npx vitest run tests/dealtwin/payments` |
| 11 | End | PayPal moves the money. The proof decides. | Repository URL, MIT License |

## How the video was made

- Voice: Microsoft Edge neural text-to-speech; captions follow its word timings.
- Picture: a 1920×1080 canvas rendered in headless Chromium and recorded with MediaRecorder.
  No screen capture.
- The rendered file is not committed.
