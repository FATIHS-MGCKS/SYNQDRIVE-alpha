# USR-P2E E3 — Audit accountability final seal (PR #2534, P2-R24)

**Status:** E3 **PASS** on disposable PostgreSQL (E3 spec + full usr-p2 gate; P1A certification retained).

## P2-R24 operation replay contract

| Case | Behavior |
|------|----------|
| Replay same `securityOperationId` after SUCCESS | Return `revoked: true` (original outcome) |
| Replay same id after NO_OP | Return `revoked: false` |
| New operation on already-revoked session | Distinct id → NO_OP + durable audit |
| Revoke-all replay | Return stored `revokedSessionCount`, not fresh-session count |
| Operation id bound to actor/target/session via outbox metadata | Mismatch → no replay, no cross-target mutation |

## Implementation notes

- `SecurityGovernanceSessionAuditService`: session write locks before outbox read; prior-outbox replay restores boolean outcome; post-txn authoritative read from outbox.
- `fallbackSingleSessionRevocation`: family active-head probe (not predecessor `revokedAt` alone); canonical `revokeSessionById` family semantics.

## PostgreSQL evidence

| ID | Spec |
|----|------|
| E3-A01–A07 | `usr-p2e-e3-audit-accountability.postgres.integration.spec.ts` |
| P1A_B replay | `usr-p1a-session-audit-certification.postgres.integration.spec.ts` (updated replay expects `revoked: true`) |
| Admin password actor | `usr-p2d-mfa-audit-accountability.postgres.integration.spec.ts` (`ADMIN_PASSWORD_ACTOR`) |

## E5 bounded residuals (not repaired in E3)

- E1 org offboarding vs issuance/refresh contention (representative vehicle lifecycle).
- E2 grant scope null/org edge cases under concurrent reset/challenge (documented only if gate still green).
- CI: Vehicle Onboarding workflow run `45927800476`; Product Catalog run `45927800425` — may relate to step-up binding contract changes; not classified as unrelated flakes.

**R-008:** OPEN — program closeout not claimed.