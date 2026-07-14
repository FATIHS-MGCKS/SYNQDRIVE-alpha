# Fake-PAID Card Audit — Read-Only Historical Detection (2026-07-14)

## Purpose

Identify `OrgInvoicePayment` rows on booking invoices that may have been marked paid solely because checkout selected `paymentMethod = card` (pre V4.9.432 bug), without Stripe PaymentIntent, Charge, or manual payment proof.

**This audit never mutates data.**

## Invocation

```bash
cd backend

# All orgs, JSON output
npx ts-node -r tsconfig-paths/register scripts/ops/audit-fake-paid-card-invoices.ts

# Single org
npx ts-node -r tsconfig-paths/register scripts/ops/audit-fake-paid-card-invoices.ts --organization-id=<uuid>
ORG_ID=<uuid> npx ts-node -r tsconfig-paths/register scripts/ops/audit-fake-paid-card-invoices.ts

# Date range (payment createdAt)
npx ts-node -r tsconfig-paths/register scripts/ops/audit-fake-paid-card-invoices.ts --from=2026-01-01 --to=2026-12-31

# Human-readable summary
npx ts-node -r tsconfig-paths/register scripts/ops/audit-fake-paid-card-invoices.ts --human
```

Exit codes: `0` = no candidates; `1` = MEDIUM/LOW candidates; `2` = HIGH candidates found.

## Data sources

| Model | Usage |
|-------|--------|
| `OrgInvoicePayment` | method, reference, note, createdAt |
| `OrgInvoice` | OUTGOING_BOOKING, bookingId, invoiceNumberDisplay |
| `Booking` | updatedAt for confirmation timing |
| `ActivityLog` | manual `POST .../payments` or `PATCH .../pay` near payment time |

**Not used:** Stripe API (no live data required). `modules/billing` Stripe tables are subscription billing only — not end-customer rental payments.

**Note:** `Booking` does not persist checkout `paymentMethod`; detection uses payment row signatures and timing.

## Suspicion criteria

A payment is scanned when:

- `method` is `CARD` or `STRIPE`
- Invoice `type = OUTGOING_BOOKING` with `bookingId`

Excluded from candidacy:

- `reference` matches Stripe patterns (`pi_`, `ch_`, `cs_`, etc.)
- `method` is `CASH`, `BANK_TRANSFER`, or `OTHER`

Confidence scoring:

| Level | Signals |
|-------|---------|
| **HIGH** | Auto note `Buchungsbestätigung — Vorauszahlung` + payment within 5 min of booking `updatedAt` + no manual payment ActivityLog |
| **MEDIUM** | Auto note OR timing correlation, without manual audit conflict |
| **LOW** | Card-like without proof but conflicting signals (manual API log, custom note, weak timing) |

## Output fields (no PII)

`organizationId`, `bookingId`, `invoiceId`, `invoiceNumber`, `paymentId`, `amountCents`, `currency`, `paymentMethod`, `createdAt`, `reasons[]`, `confidence`.

## Limits

- Cannot prove checkout selected `card` — only correlates with known auto-payment signatures.
- Legitimate manual card recordings via Invoices UI may appear as LOW if timing coincides.
- Repair-script auto-pays with `BANK_TRANSFER` are out of scope for this card-specific audit.
- No automatic remediation — review only.

## Implementation

- `FakePaidCardAuditService` — Nest service (read-only queries)
- `fake-paid-card-audit.util.ts` — pure evaluation logic + unit tests
- `scripts/ops/audit-fake-paid-card-invoices.ts` — ops entrypoint
