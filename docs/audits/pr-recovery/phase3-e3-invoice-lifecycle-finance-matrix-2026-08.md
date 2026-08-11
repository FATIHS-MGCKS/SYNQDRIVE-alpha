# Phase 3 E3.1 — Invoice Lifecycle → Finance Matrix

Authority: `shared/evaluations-finance/evaluations-finance-facts.ts` (positive
allowlists). E3.1 replaces denylist semantics with explicit positive allowlists so
a newly added `OrgInvoiceStatus` can never silently become revenue or expense.

- Revenue allowlist (OUTGOING): `ISSUED, SENT, PARTIALLY_PAID, PAID, OVERDUE`
- Open-receivable allowlist (OUTGOING, outstanding>0): `ISSUED, SENT, PARTIALLY_PAID, OVERDUE`
- Expense allowlist (INCOMING): `APPROVED, BOOKED, PARTIALLY_PAID, PAID, OVERDUE`

Cashflow (paid revenue) is sourced from the confirmed payment ledger
(`OrgInvoicePayment`), not from invoice status, and is therefore status-independent
here (the client presentation proxy uses OUTGOING + `PAID` + `paidAt`).

| direction | status | revenue? | expense? | receivable? | cashflow? | reason | authority |
|---|---|---|---|---|---|---|---|
| OUTGOING | DRAFT | no | – | no | no | not a finalized commercial claim | revenue/receivable allowlist |
| OUTGOING | ISSUED | yes | – | yes (if outstanding>0) | no | finalized claim | allowlist |
| OUTGOING | SENT | yes | – | yes (if outstanding>0) | no | finalized claim | allowlist |
| OUTGOING | PARTIALLY_PAID | yes | – | yes (open remainder) | no | finalized, partly settled | allowlist |
| OUTGOING | PAID | yes | – | no | no (cash via ledger) | finalized, fully settled | allowlist (PAID excluded from open receivable) |
| OUTGOING | OVERDUE | yes | – | yes (overdue) | no | finalized, past due | allowlist |
| OUTGOING | CANCELLED | no | – | no | no | voided claim | excluded |
| OUTGOING | CREDITED | no | – | no | no | corrected via credit note | excluded |
| OUTGOING | VOID | no | – | no | no | voided | excluded |
| OUTGOING | UPLOADED/NEEDS_REVIEW/APPROVED/BOOKED/REJECTED | no | – | no | no | incoming-lifecycle states, invalid for OUTGOING | excluded |
| INCOMING | UPLOADED | – | no | no | no | intake, not a finalized payable | expense allowlist |
| INCOMING | NEEDS_REVIEW | – | no | no | no | intake/review, not finalized | expense allowlist |
| INCOMING | APPROVED | – | yes | no | no | finalized payable | expense allowlist |
| INCOMING | BOOKED | – | yes | no | no | finalized/booked payable | expense allowlist |
| INCOMING | PARTIALLY_PAID | – | yes | no | no | finalized payable, partly paid | expense allowlist |
| INCOMING | PAID | – | yes | no | no | finalized payable, paid | expense allowlist |
| INCOMING | OVERDUE | – | yes | no | no | finalized payable, overdue | expense allowlist |
| INCOMING | REJECTED | – | no | no | no | rejected intake | excluded |
| INCOMING | DRAFT/CANCELLED/VOID | – | no | no | no | not a finalized payable | excluded |
| INCOMING | ISSUED/SENT/CREDITED | – | no | no | no | outgoing-lifecycle states, invalid for INCOMING | excluded |

## Key corrections vs pre-E3.1

- `INCOMING + UPLOADED` and `INCOMING + NEEDS_REVIEW` are **no longer** counted as
  expenses (the previous denylist only excluded DRAFT/CANCELLED/VOID/REJECTED and
  therefore leaked intake states into expenses).
- `INCOMING + REJECTED` remains excluded.
- Revenue results are unchanged (the allowlist is the positive form of the prior
  revenue denylist), so `fin.mtd_issued_revenue` keeps calculationVersion `1.0.0`;
  expenses/net-result change materially → `2.0.0`.

## Evidence

- Backend: `evaluations-finance.service.spec.ts` ("excludes OUTGOING+NEEDS_REVIEW",
  "excludes INCOMING+UPLOADED and INCOMING+REJECTED", "counts APPROVED incoming").
- Shared: `evaluations-finance-calculator.spec.ts`.
- Client mirror: `business-insights/financial-insights.logic.spec.ts`
  ("expenses use the positive finalized-state allowlist (E3.1)").
