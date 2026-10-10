# EXP-021 S4F-7AX.3 — Trusted dispatch provenance closure

**Date:** 2026-10-09  
**PR:** #1955  
**Scope:** Gate-6 live OPEN operator — cryptographic binding between Ed25519 human approval, privileged dispatch issuance record, and `live-open-authorized`.

## Problem closed

Self-issued dispatch tokens with per-token HMAC sidecars could satisfy MAC checks without proving issuance under an independently verified human approval on the privileged production path.

## Change summary

| Layer | Behavior |
|-------|----------|
| **Issuance (`issue-dispatch-token`)** | After approval verify + atomic consumption + token issue, writes `gate6-dispatch-issuance.{nonce}.json` in the issuance register MAC’d by a **separate** issuance MAC key (not the per-token sidecar). |
| **Live OPEN (`live-open-authorized`)** | Before `PrismaClient`: re-verifies Ed25519-v2 approval against pinned public key; checks approval consumption marker; validates issuance record MAC + token digest + pin parity; consumes dispatch token; atomically spends issuance nonce via `gate6-dispatch-issuance.{nonce}.live-open-spent`. |
| **Paths (production)** | `/opt/synqdrive/shared/gate6-live-open-dispatch-issuance` + `gate6-live-open-dispatch-issuance-mac.key` (no env override on production surface). |

## Negative coverage (operator tests)

- Self-issued token + sidecar, no issuance record → blocked  
- Wrong approval id vs token → blocked  
- Approval not consumed in register → blocked  
- Wrong signing key on approval file → blocked  
- Tampered issuance record MAC → blocked  
- Second live-open spend on same nonce → blocked  
- Concurrent issuance spend → one winner  
- Expired approval window → blocked  

## Validation

```bash
cd backend && npm run test:di:s4f7as:gate6-open-rekill-operator
```

**Result:** 71 tests PASS (includes prior 60 regressions + S4F-7AX.3 negatives).

## Non-effects

- No production mutation, deploy, live OPEN, or key provisioning in this slice.  
- EMERGENCY_REKILL path unchanged.  
- GLOBAL_KILL remains KILLED on production.
