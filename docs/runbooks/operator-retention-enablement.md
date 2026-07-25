# Operator / Platform — Retention Enablement Runbook

| Field | Value |
|-------|-------|
| **Purpose** | Close Gate 12 — enable document/legal/IAM retention (exit dryRun) |
| **Owner** | `[PLACEHOLDER — DPO / Platform Ops]` |
| **Risk** | Irreversible data purge when dryRun=false |
| **Last updated** | 2026-07-25 |

## Current state (VPS audit F-042-005)

Logs indicate: `Document/Legal/IAM retention DISABLED — dryRun=true`

Telemetry table retention may run separately via `DataRetentionScheduler`.

## Pre-enablement checklist

1. **Backup:** Run VPS deploy backup step or manual `pg_dump` before changes
2. **Policy review:** Confirm retention periods with DPO (documents, legal, IAM audit)
3. **Staging:** Enable on staging mirror first if available
4. **Notify:** Inform tenant admins of purge schedule if required by contract

## Enablement (high level)

1. Set retention env flags in `backend.env` per platform retention module docs
2. Set `dryRun=false` only after backup confirmation
3. Restart PM2: `pm2 restart synqdrive`
4. Monitor first scheduled purge cycle in logs
5. Verify `legal_document_retention_purge_runs` / document retention metrics

## Rollback

- Set `dryRun=true` immediately if unexpected purges occur
- Restore from backup if data loss — see VPS rollback in `docs/releases/operator-app-production-gate-2026-07.md`

## Operator impact

- Handover protocols and uploaded documents follow document retention policy
- No Operator-specific retention bypass — uses shared Document Intake V2 architecture
