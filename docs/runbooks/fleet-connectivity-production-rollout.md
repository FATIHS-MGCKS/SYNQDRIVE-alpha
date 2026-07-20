# Fleet Connectivity — Production Rollout Runbook

| Field | Value |
|-------|-------|
| **Owner** | Platform / Fleet Connectivity |
| **Last updated** | 2026-07-19 |
| **Remediation tracker** | `docs/implementation/fleet-connectivity-production-readiness-remediation-2026-07.md` |
| **Post-remediation audit** | `docs/audits/fleet-connectivity-post-remediation-readiness-2026-07.md` |

## Scope

Controlled rollout of fleet connectivity remediation (canonical runtime state, episode resolution, API v2 UI).
**No uncontrolled production changes.** Episode reconciliation apply requires explicit backup, operator, reason, and audit hash.

## Preconditions (all green)

```bash
cd backend && npm run prisma:validate && npm run build
cd backend && npx jest --testPathPattern='device-connection|fleet-connectivity|connectivity-recovery|connectivity-state|connectivity-consumer'
cd frontend && npm run build
cd frontend && npm test -- --run src/rental/components/fleet-connectivity
```

## Rollout sequence

### 1. Production backup

- Full PostgreSQL backup before any migrate or apply.
- Record backup id, timestamp, operator.

### 2. Release tag

- Tag release on `main` after PR merge (connectivity remediation branch).
- Record git SHA in `CONNECTIVITY_RECONCILIATION_GIT_COMMIT` for apply scripts.

### 3. Prisma migrate status

```bash
cd backend && npx prisma migrate status
```

### 4. Migrate deploy

```bash
# On target environment only — never from agent without approval
npx prisma migrate deploy
```

### 5. Backend + workers

- Deploy backend API and workers (PM2 / VPS release script).
- Verify `GET /api/v1/health` and worker heartbeats.

### 6. Webhook inbox health

- Confirm DIMO webhook endpoint reachable.
- Check metrics: `synqdrive_connectivity_webhook_received_total`, processing failures, dead-letter counters.
- Alerts: `ConnectivityWebhookProcessingFailures`, `ConnectivityWebhookDeadLetterGrowth`.

### 7. Read-only episode audit

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/audit-device-connection-episode-reconciliation.ts \
  --organization-id=<ORG_UUID> --format=json > /tmp/episode-audit.json
```

Also run fleet production-readiness audit phases 1–4:

```bash
npx ts-node scripts/audits/audit-fleet-connectivity-production-readiness.ts --phase=4
```

### 8. Small reconciliation batches (staging first)

```bash
npx ts-node -r tsconfig-paths/register scripts/ops/apply-device-connection-episode-reconciliation.ts \
  --organization-id=<ORG_UUID> \
  --audit-report-hash=<sha256-of-readonly-json> \
  --expected-git-commit=<release-sha> \
  --operator="<name>" \
  --reason="staging controlled apply batch 1" \
  --batch-size=5 \
  --output=/tmp/episode-apply-batch-1.json
```

**Apply (staging only):**

```bash
CONNECTIVITY_RECONCILIATION_STAGING_CONFIRMED=1 \
npx ts-node -r tsconfig-paths/register scripts/ops/apply-device-connection-episode-reconciliation.ts \
  --organization-id=<ORG_UUID> \
  --audit-report-hash=<sha256> \
  --expected-git-commit=<sha> \
  --operator="<name>" \
  --reason="staging apply" \
  --batch-size=5 \
  --apply --backup-confirmed --allow-remote-db
```

Auto-applicable classifications only:

- `RESOLVED_EXPLICIT` (open episode + explicit plug event)
- `SHOULD_RESOLVE_BY_SNAPSHOT_SIGNAL` (HIGH confidence)
- `SHOULD_RESOLVE_BY_TELEMETRY` (HIGH confidence)
- `SUPERSEDED_BY_BINDING_CHANGE` (clear binding change)

Never auto-apply: `CONFLICTING_DATA`, `NOT_ENOUGH_DATA`, OEM/synthetic-only, missing binding history.

### 9. Runtime state rebuild

- Resolution paths call `VehicleConnectivityRuntimeProjectionService.projectForVehicle` after episode close.
- Optional org-scoped batch: fleet connectivity list refresh triggers projection on read.

### 10. Alert resolution

- Verify `ConnectivityAlertService` closes DEVICE_UNPLUGGED alerts on recovery.
- Check `synqdrive_connectivity_alert_resolved_total`.

### 11. Incident vehicle verification

- Replay INCIDENT_VEHICLE_001 fixture (phase 3 audit).
- Expect: episode RESOLVED, `TELEMETRY_ACTIVE`, `attentionState NONE`, unplug alert closed, single reconnect info.

### 12. Fleet Connectivity UI

- Fleet Hub → Connectivity tab: 4 KPIs, reduced table, mobile cards, detail drawer.
- Verify DE/EN labels, no OBD/webhook/readiness columns.

### 13. Monitoring

- Grafana/Prometheus: connectivity counters, episode open/resolve, state conflicts.
- Alerts listed in `backend/monitoring/prometheus/alerts.yml` → `synqdrive_connectivity`.

### 14. Gradual org rollout

- Enable per organization after staging sign-off.
- Start with lowest-risk org; expand after 24h clean metrics.

### 15. Recovery kill switch (episode auto-recovery)

| Env | Default | Scope |
|-----|---------|-------|
| `CONNECTIVITY_EPISODE_RECOVERY_ENABLED` | `true` | Automatic episode open/resolve, resolution outbox processing, reconnected notifications |
| `CONNECTIVITY_RECONCILIATION_APPLY_ENABLED` | `false` | Controlled reconciliation `--apply` script + `DeviceConnectionEpisodeReconciliationApplyService` |

**Affected workers/services**

- `DeviceConnectionWebhookService` — persists webhooks always; skips episode sync when recovery off
- `DeviceConnectionEpisodeResolutionService` — snapshot/telemetry resolution returns `recovery_disabled`
- `DeviceConnectionEpisodeResolutionOutboxProcessorService` — skips pending outbox rows when recovery off
- `DeviceConnectionEpisodeService.reconcileBindingDrift` — no-op when recovery off
- `dimo-snapshot.processor` — snapshots still ingested; resolution gated by recovery flag
- `apply-device-connection-episode-reconciliation.ts` — requires `CONNECTIVITY_RECONCILIATION_APPLY_ENABLED=1` for `--apply`

**Disable recovery (incident / rollback)**

1. Set `CONNECTIVITY_EPISODE_RECOVERY_ENABLED=false` in `backend.env` on VPS
2. Restart API + workers: `pm2 restart synqdrive-api synqdrive-worker`
3. Verify: webhooks still land in `dimo_device_connection_events`; snapshots in `vehicle_latest_states`
4. Verify: open episodes unchanged; no new `DEVICE_RECONNECTED` notifications

**Re-enable recovery**

1. Set `CONNECTIVITY_EPISODE_RECOVERY_ENABLED=true`
2. Restart API + workers
3. Stale resolution outbox rows resume on next poll (no data loss)
4. Monitor `synqdrive_connectivity_recovery_*` counters and alert resolution metrics

**Reconciliation apply remains off** unless explicitly set — never enable in production without staging dry-run + audit hash.

## Rollback

| Action | Safe? | Notes |
|--------|-------|-------|
| Disable new recovery processing | Yes | Feature flag / worker pause — raw webhooks preserved |
| Stop reconciliation apply jobs | Yes | Read-only audits remain valid |
| Legacy API fallback | Temporary | `vehicles[]` deprecated field — expand-contract only |
| Database restore | Last resort | Never standard rollback; episodes/events are audit trail |
| Delete webhook/episode history | **Never** | Violates operational safety |

## Staging validation checklist

- [ ] DB backup taken
- [ ] `prisma migrate deploy` success
- [ ] Health + metrics endpoints OK
- [ ] Read-only audits documented
- [ ] Apply dry-run reviewed
- [ ] Staging apply batch (if needed) with hash + operator
- [ ] Incident replay green
- [ ] Cross-surface consistency audit green
- [ ] UI smoke (desktop/tablet/mobile, light/dark)

## Production actions **not** performed by default

- No production `migrate deploy` without operator approval
- No production `--apply` without backup confirmation + audit hash
- No production org-wide reconciliation without phased rollout
- No deletion of webhook or episode data
