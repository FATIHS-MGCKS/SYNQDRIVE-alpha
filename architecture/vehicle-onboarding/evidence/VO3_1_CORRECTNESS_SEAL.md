# VO-3.1 — Orchestrator correctness & fail-closed seal

| Field | Value |
|-------|-------|
| **PR** | #1854 |
| **Scope** | Security/correctness hardening only — no public cutover |

## Fixes

- HM mirror tenant isolation + global mirror platform-trusted adoption gate
- DIMO platform-source adoption authority (developer-license scoped mirrors)
- Composite VIN validation from canonical draft + each sealed source snapshot
- Activation source-set invariant (≤1 DIMO vehicle, ≤1 HM vehicle)
- Production readiness DI only — no `VO3_TEST_READINESS`, no caller override, no exported test seal on case service
- Versioned JSON contract validation before activation
- Strict fuel type + plausible year resolution
- HM link `consentId` binding + canonical status history
- Classified `attachSourceRef` P2002 handling
- Idempotency key semantic mismatch detection
- Activation idempotency authority = `onboardingCaseId`
- Outbox duplicate semantic verification
