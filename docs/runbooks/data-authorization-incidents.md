# Data Authorization — Incident Runbook

Operational response for Prometheus alerts in group `synqdrive_data_auth`.

## Severity guide

| Severity | Response |
|----------|----------|
| **critical** | Page on-call; block deploy until mitigated |
| **warning** | Investigate within business hours; may block release |
| **info** | Track in compliance backlog |

Alert deduplication: Prometheus `for` windows and `clear_condition` annotations define when an alert clears. Do not silence without documenting root cause.

---

## audit-outbox-dlq

**Alerts:** `DataAuthAuditOutboxDeadLetter`, `DataAuthAuditOutboxRetrySustained`

1. Check `data_auth_audit_outbox_pending_total` and backend logs for `data-auth audit outbox`.
2. Inspect `data_authorization_audit_outbox` rows with status `DEAD_LETTER` or high `attempts`.
3. Fix underlying DB constraint or payload validation; replay dead-letter rows only after root-cause fix.
4. Verify `increase(data_auth_audit_dead_letter_total[15m])` stops.

---

## dev-bypass

**Alert:** `DataAuthDevBypassEnabledInProduction`

1. Set `DATA_AUTH_DECISION_DEV_BYPASS=false` in production `backend.env`.
2. Restart API + workers.
3. Confirm `data_auth_dev_bypass_enabled == 0`.

---

## enforcement-disabled

**Alert:** `DataAuthEnforcementDisabledInProduction`

1. Set `DATA_AUTH_DECISION_ENFORCEMENT_ENABLED=true`.
2. Restart services; verify protected paths enforce DENY without policy.

---

## global-deny

**Alert:** `DataAuthGlobalDenySwitchActive`

1. Confirm intentional incident response; if not, set `DATA_AUTH_DECISION_GLOBAL_DENY=false`.
2. Check per-scope deny switches in `deny_switch_entries`.

---

## resolver-errors

**Alert:** `DataAuthResolverErrorsElevated`

1. Check PostgreSQL health and slow queries on policy resolver tables.
2. Review recent migrations on privacy domain tables.
3. Inspect `data_auth_decision_total{reason_category="resolver_error"}`.

---

## deny-spike

**Alert:** `DataAuthDenyRateSpike`

1. Correlate with policy lifecycle changes, revocations, or deny-switch activations.
2. Sample audit log via hub UI (no PII in metrics).
3. Distinguish expected revocation wave vs misconfiguration.

---

## decision-latency

**Alert:** `DataAuthDecisionLatencyHigh`

1. Check `data_auth_policy_cache_entries` and cache TTL config.
2. Review resolver query plans; scale DB if sustained.

---

## unregistered-paths

**Alert:** `DataAuthUnregisteredProductivePaths`

1. Run `npm run test:data-auth:coverage` locally.
2. Update `enforcement-coverage-catalog.ts` and baseline CSV.
3. **Do not deploy** until `data_auth_unregistered_path_total == 0`.

---

## worker-version

**Alert:** `DataAuthWorkerVersionMismatch`

1. Compare `WORKER_POLICY_ENGINE_VERSION` with running worker build.
2. Deploy coordinated API + worker release.

---

## revocation-failed

**Alert:** `DataAuthRevocationFailed`

1. Inspect `data_authorization_revocation_workflows` with status `REVOCATION_FAILED`.
2. Check provider revocation step errors and queue cancellation.

---

## revocation-in-progress

**Alert:** `DataAuthRevocationInProgressElevated`

1. Verify orchestrator scheduler is running.
2. Check stuck workflows past `maxAttempts`.

---

## overdue-reviews / overdue-dpia / expired-policies

1. Use Data Processing Hub compliance gauges.
2. Schedule review workflow or policy expiry job investigation.

---

## retention-failures

**Alert:** `DataAuthRetentionJobFailures`

1. Review `processing_activity_deletion_jobs` with `PARTIAL_FAILURE`.
2. Confirm legal holds before retry; never force-delete under hold.

---

## deny-switch-propagation

**Alert:** `DataAuthDenySwitchPropagationSlow`

1. Check Redis connectivity and deny-switch pub/sub channel.
2. Verify reconciliation loop `DATA_AUTH_DENY_SWITCH_RECONCILE_ENABLED`.

---

## Local reproduction

```bash
cd backend
npm ci && npx prisma generate
npm test -- --testPathPattern='data-auth-metrics.service.spec'
bash scripts/test/verify-data-auth-monitoring.sh
bash scripts/test/data-auth-production-safety-check.sh

# With PostgreSQL:
DATA_AUTH_POSTGRES_INTEGRATION=1 DATABASE_URL=... npm run test:data-auth:postgres
bash scripts/test/data-auth-migration-test.sh all
```

Metrics endpoint (requires bearer token in production):

```bash
curl -s -H "Authorization: Bearer $METRICS_BEARER_TOKEN" https://app.synqdrive.eu/api/v1/metrics | rg '^data_auth_'
```
