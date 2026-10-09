# Operator runbook — R4.2B-P1 authorized production Phase-A read-only execution (future)

**Status:** procedure definition only — **do not execute** until change management completes P0 offline readiness and a separate human authorizes P1.

> **READY ≠ GO:** Passing `npm run battery:hv-h4:a3-phase-a-production-operational-readiness` means offline contracts align. It does **not** grant production database access or permit Phase-A SQL execution.

## 1. Human change approval (before any technical step)

1. Open/approve change ticket with bounded maintenance window (UTC).
2. Record approving authority in R4.2A approval JSON (`DOCUMENTED_HUMAN_APPROVAL`).
3. Obtain **independent** verification (different person than approval author) and record in GO/NO-GO JSON (`independentAuthorizationVerification`).
4. Provision dedicated read-only **audit** credentials (not application `DATABASE_URL`, not migration owner, not attestation issuer pool).
5. Confirm authorization limits: **no** schema migrations, **no** issuer activation, **no** hybrid loader activation, **no** attestation INSERT/UPDATE, **no** application runtime flag changes.

## 2. Pre-execution validation (offline — no PostgreSQL)

1. Pin exact release SHA in GO/NO-GO record **and** set `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUTHORIZED_RELEASE_SHA` to the same 40-character lowercase hex commit (configuration consistency only — not proof of deployed executable).
2. Set env: GO/NO-GO record, approval record, target spec JSON, consumption store path (pre-provisioned marker), production audit URL (secret — verify-full + `sslrootcert` only).
3. Run:
   ```bash
   cd backend && npm run battery:hv-h4:a3-phase-a-production-operational-readiness
   ```
4. Require `decision=READY` and `productionNetworkAccessAttempted=false`. If `NO_GO`, stop — do not proceed to P1.
5. Archive sanitized JSON report to `evidenceStorageDestination` from GO/NO-GO record.

## 3. Target and credential verification (authorized production access only)

Only after org policy grants read access:

1. Confirm URL host/port/database/login match target spec and approval `approvedTargetKey`.
2. Confirm TLS verify-full handshake and hostname validation using org CA bundle (out-of-band `psql` or org tooling if permitted).
3. Confirm session is non-superuser and lacks `rolcreaterole` / `rolcreatedb` / `rolbypassrls`.
4. Do **not** use SSH port-forward to loopback while spec names production hostname.

## 4. Controlled one-time read-only execution (P1)

1. Set `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED=1`.
2. Deliberate execute binding:
   - `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_ACK=1`
   - `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_APPROVAL_ID` / `EXECUTE_NONCE` matching approval record.
3. Run **once**:
   ```bash
   cd backend && npm run battery:hv-h4:a3-phase-a-production-preflight
   ```
4. Expect consumption marker write — replay with same approval id must fail.

## 5. Evidence capture and independent review

1. Store redacted JSON report only (`databaseTargetRedacted`).
2. Attach `productionAdmissionEvidence` (ticket, approval id, authority — no secrets).
3. Second reviewer validates evidence against change ticket (independent from executor).
4. Mark `PRODUCTION_CERTIFICATION=NOT_CERTIFIED` — Phase A is discovery only.

## 6. Safe shutdown and credential cleanup

1. Unset all Phase-A production env vars from shell and automation.
2. Revoke short-lived audit credentials per org policy.
3. Archive consumption store entry with ticket; do not delete marker without audit trail.

## 7. NO-GO and failure handling

| Condition | Action |
|-----------|--------|
| Offline readiness `NO_GO` | Do not connect; fix contracts/credentials/window |
| TLS identity not certified | Stop; no manifest SQL |
| Superuser or elevated role | Stop; incident per GO/NO-GO `incidentHandling` |
| Partial discovery (`ERROR` checks) | Do not certify Phase B; preserve logs |
| Approval consume / replay anomaly | Stop; security review; new approval id required |
| Wrong target | Invalidate evidence; new ticket |

## Rollback

Phase A is read-only — no schema rollback. Wrong-target execution: invalidate evidence, do not reuse approval id.
