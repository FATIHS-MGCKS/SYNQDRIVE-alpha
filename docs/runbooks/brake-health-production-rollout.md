# Runbook: Brake Health Production Rollout

| Field | Value |
|-------|-------|
| **Valid from** | `fix/brake-health-production-readiness-2026-07` @ Prompt 26 |
| **Implementation branch** | `fix/brake-health-production-readiness-2026-07` |
| **Baseline audit** | `docs/audits/brake-health-production-readiness-2026-07.md` |
| **Post-remediation verdict** | `docs/audits/brake-health-post-remediation-readiness-2026-07.md` |
| **Measurement campaign** | [`brake-health-measurement-campaign.md`](./brake-health-measurement-campaign.md) |
| **Baseline backfill** | [`brake-health-component-baseline-backfill.md`](./brake-health-component-baseline-backfill.md) |

> **Principle:** No uncontrolled production writes. Staging / production DB copy first. Shadow mode before customer-facing hard blocks from predicted wear.

---

## 0. Preconditions (must be green)

| Gate | Command / check |
|------|-----------------|
| Prisma validate | `cd backend && npm run prisma:validate` |
| Backend build | `cd backend && npm run build` |
| Frontend build | `cd frontend && npm run build` |
| Unit tests | `cd backend && npm test -- --testPathPattern='brakes/'` |
| Regression matrix | `npm test -- brake-health-regression-matrix` |
| Migrations reviewed | `20260717140000` … `20260717270000` (14 brake migrations) |
| Backup runbook | Section 12 below |
| Observability | Prometheus `synqdrive_brake_*` + alerts in `backend/monitoring/prometheus/alerts.yml` |

---

## 1. Production backup

```bash
# Example — adjust for your host / pg_dump policy
pg_dump "$DATABASE_URL" -Fc -f "synqdrive-pre-brake-rollout-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Verify backup restore on isolated instance before any apply.

**Not executed in Prompt 26 agent environment** — operator responsibility on staging/prod.

---

## 2. Release tag

```bash
git tag -a brake-health-remediation-2026-07-rc1 f11a70c5
git push origin brake-health-remediation-2026-07-rc1
```

Deploy **same tag** to backend, workers, frontend.

---

## 3. Migrate status

```bash
cd backend
npx prisma migrate status
```

Expected pending (if not yet applied): `20260717140000` through `20260717270000`.

---

## 4. Migrate deploy

**Staging / production DB copy only** — never first on live prod without staging proof.

```bash
cd backend
npm run prisma:migrate:deploy
npx prisma generate
```

Restart API + workers after deploy.

---

## 5. Backend + worker deploy

| Component | Notes |
|-----------|-------|
| API | `synqdrive-backend` with workers enabled per env |
| Workers | `BRAKE_RECALCULATION`, `DRIVING_IMPACT_COMPUTE`, DIMO snapshot |
| Redis | Required for recalc lock + queue dedupe |
| Frontend | Canonical brake evidence UI (`BrakeEvidencePanel`) |

### Queue / worker health

```bash
# BullMQ queue names
# dimo.brake.recalculation
# driving-impact.compute

# Prometheus
# synqdrive_queue_lag_seconds{queue="dimo.brake.recalculation"}
# synqdrive_queue_failed_jobs
# synqdrive_brake_recalculation_total
```

Alerts: `BrakeRecalculationQueueBacklog`, `BrakeRecalculationFailureRateHigh`, `QueueFailedJobsHigh`.

---

## 6. Read-only audits (Phase A)

Run **before any write** on target database:

```bash
cd backend

# Baseline candidates
BRAKE_HEALTH_AUDIT_ALLOW_REMOTE=1 \
  npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts \
  --organization-id=<ORG> --limit=500

# Legacy enrichment jobs (read-only)
npx ts-node -r tsconfig-paths/register scripts/ops/diagnose-brake-enrichment-jobs.ts

# Production readiness phases (read-only)
BRAKE_HEALTH_AUDIT_ALLOW_REMOTE=1 \
  npx ts-node -r tsconfig-paths/register ../scripts/audits/audit-brake-health-production-readiness.ts \
  --phase=3 --days=60 --output-dir=../docs/audits/data
```

Document per audit:

- Vehicles total / initialized `BrakeHealthCurrent`
- Baseline candidate classes (`EXACT_MEASURED`, `SPEC_ONLY`, `CONFLICTING_DATA`, …)
- TDI coverage %, overcoverage rows
- DIMO braking event intake counts
- DTC brake evidence active vs cleared
- Duplicate alert / fingerprint collisions

---

## 7. Small baseline backfill batches

```bash
cd backend
BRAKE_BASELINE_BACKFILL_APPLY_ALLOW_REMOTE=1 \
  npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts \
  --organization-id=<ORG> \
  --max-batch-size=10 \
  --confirm-git-ref=$(git rev-parse HEAD) \
  --confirm-schema-version=20260717140000_brake_component_installation_lifecycle \
  --confirm-backup \
  --operator=ops@synqdrive \
  --reason=staging-rollout-batch-1
  # Add --apply --expected-report-hash=<hash> only after dry-run review
```

**Batch size:** ≤ 10 vehicles first batch; expand after integrity audit.

---

## 8. TDI backfill

If trips lack `trip_driving_impact`:

- Run trip enrichment / driving-impact compute for 60-day window.
- Monitor `synqdrive_brake_trip_missing_impact_total`.
- Re-run TDI coverage audit; target reducing missing-impact spike.

---

## 9. DIMO event backfill

For vehicles with DIMO `behavior.harshBraking` / `behavior.extremeBraking`:

- Ensure DIMO snapshot worker running.
- Verify `dimo_braking_event_intake` rows linked to trips.
- Run `BrakingEventLedgerService.reconcileTrip()` per trip batch (via enrichment pipeline).
- Monitor `synqdrive_brake_event_ingested_total` / `synqdrive_brake_event_duplicate_prevented_total`.

---

## 10. Shadow recalculation

### Shadow mode definition (Prompt 26)

| Behavior | Shadow ON |
|----------|-----------|
| Recalculation runs | ✓ |
| Snapshots persisted | ✓ |
| Honest UI (ESTIMATED / MEASURED labels) | ✓ |
| Hard block from **estimated** wear only | ✗ (`MEASUREMENT_REQUIRED`) |
| Hard block from **measured** critical wear | ✓ (policy) |
| Safety DTC evidence | ✓ per policy |
| Data quality (coverage gap) | ✓ — not wear escalation |

Enqueue recalc in small batches:

```bash
# Via orchestrator / admin tool — max 25 vehicles per hour bucket
# trigger: backfill | manual
```

Verify:

- `input_fingerprint` dedupe (`synqdrive_brake_recalculation_deduplicated_total`)
- Snapshot dedupe (`synqdrive_brake_snapshot_total{result="deduplicated"}`)
- No temporal leakage (replay as-of tests)
- Coverage gap alerts ≠ wear alerts

---

## 11. Integrity audit (post-shadow)

Re-run read-only audits from step 6. Compare to pre-apply baseline.

Checklist:

- [ ] No full reset on partial service
- [ ] No spec-only labeled as MEASURED
- [ ] Component installations match scope
- [ ] No duplicate braking events
- [ ] Overcoverage does not inflate wear
- [ ] Estimated critical → no false hard block
- [ ] `COVERAGE_GAP` category = DATA_QUALITY
- [ ] Queue dedupe under parallel workers

---

## 12. Pilot vehicles

Execute [`brake-health-measurement-campaign.md`](./brake-health-measurement-campaign.md) on 3–5 pilots **before** fleet-wide hard-block enablement.

---

## 13. Monitoring

| Alert | Action |
|-------|--------|
| `BrakeInitializationFailureRateHigh` | Stop apply; check registration workflow |
| `BrakeRecalculationQueueBacklog` | Scale workers; inspect lock contention |
| `BrakeMissingTdiSpike` | TDI pipeline / enrichment |
| `BrakeTripOvercoverage` | Coverage reconciliation |
| `BrakeBackfillConflict` | Manual review queue |
| `BrakeHealthCurrentMissingAfterRegistration` | Init regression |

Dashboards: `synqdrive_brake_*` family (no vehicleId labels).

---

## 14. Gradual rollout

| Stage | Scope | Customer impact |
|-------|-------|-----------------|
| 1 Shadow | Staging + pilot org | Internal only |
| 2 Observability | Prod compute, no new blocks | UI shows honest labels |
| 3 Pilot hard blocks | Measured critical only | Booking gate for pilots |
| 4 Fleet | After measurement campaign + backtest review | Full policy |

---

## Rollback procedure

**Do:**

1. Disable new brake processing (stop workers or pause schedulers).
2. Stop baseline backfill / batch recalc jobs.
3. Keep schema — tables are additive and backward compatible.
4. Preserve all `brake_component_installations`, `brake_evidence`, `brake_health_snapshots`, `braking_event_ledger` history.
5. Revert application image to previous tag if API regression.
6. Verify `prisma migrate status` — **do not** run destructive down migrations in prod.

**Do not:**

- Delete component, evidence, snapshot, or event history as “rollback”.
- Use database restore as normal rollback (restore = disaster recovery only).
- Re-enable legacy `brakePadPercent` as product truth.

**Schema compatibility:** Migrations `20260717140000`–`20260717270000` are additive. Older app versions may ignore new tables; new app on old schema will fail at migrate — always deploy migrate before app.

---

## Staging validation log (Prompt 26)

| Step | Status in agent env | Operator staging |
|------|---------------------|------------------|
| DB backup | **NOT EXECUTED** | Required |
| Migrate deploy | **NOT EXECUTED** (no `DATABASE_URL`) | Required |
| Read-only audits | Fixtures + unit tests only | Required on DB copy |
| Controlled apply | **NOT EXECUTED** | Required |
| Shadow replay 60d | **NOT EXECUTED** | Required |
| Production deploy | **NOT EXECUTED** | Blocked until staging sign-off |
