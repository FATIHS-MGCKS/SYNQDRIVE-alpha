# Bookings — Decision Register

Graph nodes: `BKG-DEC-*`. Statuses must match `graph/nodes.yaml`.

## BKG-DEC-PAYMENT-INTENT-001

| Field | Value |
|-------|-------|
| **TITLE** | Payment intent does not imply PAID invoice |
| **STATUS** | VALIDATED |
| **EPISTEMIC** | CONFIRMED |
| **BEFORE** | Wizard `card` path could mark invoice PAID without Stripe proof |
| **CHANGE** | Invoice stays open until real payment recording |
| **EVIDENCE** | `BKG-EVID-ARCH-PAYMENT-INTENT-001`, `BKG-TEST-WIZARD-001` |

## BKG-DEC-RETROACTIVITY-001

| Field | Value |
|-------|-------|
| **TITLE** | Eligibility rule retroactivity |
| **STATUS** | VALIDATED |
| **EPISTEMIC** | CONFIRMED |
| **BEFORE** | Rule changes could implicitly affect confirmed contracts |
| **CHANGE** | Snapshot + recheck policies; no silent auto-cancel on publish |
| **EVIDENCE** | `BKG-EVID-ARCH-RETROACTIVITY-001`, `BKG-TEST-ELIGIBILITY-001` |

## BKG-DEC-P6-PRODUCT-LICENSE-001

| Field | Value |
|-------|-------|
| **TITLE** | RENTAL ACTIVE product license on BookingsController |
| **STATUS** | VALIDATED |
| **EPISTEMIC** | CONFIRMED on origin/main; UNKNOWN on current Production SHA |
| **SOURCE** | architecture/platform-product-catalog/CHANGE_RECORD_P6_PR3_2026-11-19.md |
| **EVIDENCE** | BKG-TEST-GUARD-STACK-001 |