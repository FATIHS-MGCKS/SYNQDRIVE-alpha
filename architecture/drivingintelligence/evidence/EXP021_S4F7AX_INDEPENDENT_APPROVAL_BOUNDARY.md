# EXP-021 S4F-7AX — Gate-6 independent approval boundary (engineering)

**Date:** 2026-10-09  
**Baseline operator SHA:** `0e93232def5f6820b1b43740082734fb5a440a27`  
**Scope:** Repository-only — Ed25519 verify-only + approvalId single-use register. **No** Production mutation, deploy, dry-run, live OPEN, or signed approval issuance on Production.

## Signer / verifier separation

| Control | Implementation |
|--------|----------------|
| Offline signer | `signGate6HumanApprovalRecordV2` (engineering / operator signing env only) |
| Production verify | `verifyGate6HumanApprovalRecordV2` + `DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE` or `/opt/synqdrive/shared/gate6-live-open-approval-public.pem` |
| Canonical Production | **Ed25519 v2 only** — HMAC v1 rejected (`HUMAN_APPROVAL_HMAC_FORBIDDEN_ON_CANONICAL_PRODUCTION`) even if HMAC root key file exists |
| No HMAC fallback | Missing/invalid Ed25519 verification does not fall back to root-key MAC |
| HMAC root key (S4F-7AW) | Not read on canonical Production OPEN issuance path; not deleted or overwritten by this change |

Payload binds: `approvalId`, actor, reason, `requiredSha`, `requiredReleaseId`, `requiredEnvSha256`, `validFromMs`, `validUntilMs` (v2).

## ApprovalId single-use

- `reserveApprovalIdForDispatch` before `issueLiveOpenDispatchToken` in CLI `issue-dispatch-token`.
- Register: `DI_S4_GATE6_APPROVAL_CONSUMPTION_REGISTER_DIR` or `/opt/synqdrive/shared/gate6-live-open-approval-consumption`.
- Fail-closed on stale `.claiming.*` markers; no auto re-issue.
- Dispatch token one-shot (v2 HMAC sidecar) unchanged.

## EMERGENCY_REKILL

Unchanged — no Ed25519 requirement; no OPEN readiness coupling (`live-rekill` CLI path).

## Validation

```bash
cd backend && npm run test:di:s4f7as:gate6-open-rekill-operator
```

**Operator tests:** 52 (includes Ed25519 positive/negative, consumption replay, concurrent claiming block, CLI copied-approval replay).

**Postgres:** `npm run test:di:s4f7as:gate6-kill-transition:postgres` (requires `DATABASE_URL`; CI S4A job).

## Production posture (this workstream)

- `PRODUCTION_MUTATION=NO`
- `SIGNED_APPROVAL_CREATED=NO`
- `GATE6_GRANTED=NO`
- Ed25519 public key on Production: **not provisioned** in S4F-7AX
