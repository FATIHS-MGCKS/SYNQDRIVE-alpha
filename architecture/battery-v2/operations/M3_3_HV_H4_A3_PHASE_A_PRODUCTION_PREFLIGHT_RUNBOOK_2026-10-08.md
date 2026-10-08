# Operator runbook — Authorized production Phase-A read-only preflight (O2-R4.2A)

**Status:** preparation slice in repository — **do not execute against production** until change management completes R4.2B operational gate review.

## Preconditions

1. Change ticket approved (record id in approval JSON).
2. Security officer (or delegated authority) documented in approval record — **human approval, not cryptographic signature**.
3. Dedicated read-only **audit login** provisioned out-of-band (not `DATABASE_URL`, not issuer pool).
4. Target spec matches real hostname, port, database, and audit login.
5. TLS: production URL uses `sslmode=verify-full` (or `verify-ca` with CA pinned in URL) when identity verification is required.
6. No SSH port-forward of production PostgreSQL to local loopback during Phase A.
7. R4.1 isolated-test harness env vars **unset** in operator shell.

## Obtain audit credentials (no display)

- Load URL from secret manager / `backend.env` fragment with **audit-only** key — never paste into tickets or chat.
- Verify login name only: `psql "$URL" -c 'SELECT current_user, current_database()'` (read-only sanity) — **only when already authorized** for production read access per org policy.
- This runbook does not grant production access; it describes checks after access exists.

## Target identity checks (before Phase A)

1. Parse expected target spec JSON (hostname, port, database, audit login).
2. Confirm URL host/port/database/login match spec (tooling: `evaluatePhaseAPreflightProductionAdmissionV1` dry path via config parse).
3. Confirm URL is **not** identical canonical target to application `DATABASE_URL` or issuer URL.
4. Confirm `sslmode` meets policy (no `disable`).

## One-time authorized execution workflow

1. Author creates approval record JSON (validity window ≤ approved change window).
2. Store record in secure path; set env:
   - `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED=1`
   - `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL` (secret)
   - `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_PATH`
   - `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON`
   - `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR` (empty writable dir)
3. Operator **deliberate execute** (separate step):
   - `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_ACK=1`
   - `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_APPROVAL_ID=<id>`
   - `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_NONCE=<nonce from record>`
4. Run once:
   ```bash
   cd backend && npm run battery:hv-h4:a3-phase-a-production-preflight
   ```
5. Consumption file written — **replay blocked** for same approval id.

## Evidence and audit record

- Retain redacted JSON report (`databaseTargetRedacted` only).
- Attach `productionAdmissionEvidence` block (approval id, change ticket, authority — no passwords).
- Mark `PRODUCTION_CERTIFICATION=NOT_CERTIFIED` in evidence — Phase A is discovery only.
- Store operator id, UTC timestamp, and ticket reference in change system.

## Partial / failure handling

| Condition | Action |
|-----------|--------|
| Connection failure | Stop; do not retry with different credentials; investigate network/TLS |
| `ERROR` check / aborted transaction | Treat discovery incomplete; do not proceed to provisioning |
| Denied SELECT on catalog | Fail-closed classification in report; stop |
| Missing roles | Expected `NOT_PROVISIONED` — not a pass for Phase B |

## Immediate stop

- Superuser session when `forbidSuperuserSession` required
- Tunnel / host mismatch errors
- Any mutation success outside READ ONLY probe
- Unexpected approval consumption / replay

## Post-execution cleanup

- Unset production env vars from shell (`DATABASE_URL`, approval path, execute ack).
- Revoke short-lived credentials per org policy.
- Archive consumption marker with change ticket.

## Rollback

Phase A is read-only — no schema rollback required. If wrong target was used, invalidate change evidence and re-open ticket; **do not** re-run with same approval id (consumed).
