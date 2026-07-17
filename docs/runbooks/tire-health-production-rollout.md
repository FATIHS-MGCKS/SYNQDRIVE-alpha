# Tire Health Production Rollout Runbook — July 2026

| Field | Value |
|-------|-------|
| **Runbook ID** | `tire-health-production-rollout-2026-07` |
| **Branch** | `fix/tire-health-production-readiness-2026-07` |
| **Remediation doc** | `docs/implementation/tire-health-production-readiness-remediation-2026-07.md` |
| **Post-remediation audit** | `docs/audits/tire-health-post-remediation-readiness-2026-07.md` |
| **Production data policy** | **No uncontrolled writes.** Apply paths only after staging replay + signed approval. |

---

## Preconditions (must be green)

| Gate | Command / check |
|------|-----------------|
| Prisma validate | `cd backend && npm run prisma:validate` |
| Backend typecheck | `cd backend && npx tsc --noEmit` |
| Backend build | `cd backend && npm run build` |
| Frontend typecheck | `cd frontend && npx tsc -b` |
| Frontend build | `cd frontend && npm run build` |
| Tire unit/integration | `cd backend && npm test -- --testPathPattern='tire'` |
| Regression matrix | `cd backend && npm test -- tire-health-regression-matrix` |
| Additive migrations reviewed | See §Migrations below — no destructive SQL |

---

## Migrations (additive only)

Apply in order on **staging first**, then production:

| Migration | Purpose |
|-----------|---------|
| `20260716180000_tire_evidence_ground_truth_provenance` | Evidence enums + provenance columns |
| `20260716183000_tire_lifecycle_invariants` | Partial unique ACTIVE setup; lifecycle enums |
| `20260716190000_tire_odometer_anchor` | Odometer anchor fields |
| `20260716200000_tire_odometer_anchor_backfill_event` | Backfill audit event type |
| `20260716210000_tire_trip_usage_ledger` | Canonical trip usage ledger |
| `20260716220000_tire_trip_usage_attribution` | Attribution status columns |
| `20260716230000_tire_trip_usage_replay_safety` | Replay safety indexes |
| `20260716240000_tire_recalculation_fingerprint_dedupe` | Snapshot fingerprint dedupe |
| `20260716250000_tire_prediction_versioning` | Model version on snapshots |
| `20260716260000_tire_recommended_pressure` | Recommended pressure spec fields |
| `20260716270000_tire_rental_health_review` | Rental review overrides |
| `20260716280000_tire_health_alerts` | Structured alerts + dedupe |

**Rollback note:** Schema is forward-compatible. Rollback = stop new code paths; **do not** drop tables or delete ledger/measurement/snapshot history.

---

## Rollout sequence

### 1. Production backup

- PostgreSQL: full snapshot + PITR confirmation before `migrate deploy`.
- Redis: optional BullMQ queue export if tire recalc jobs are in flight.
- Record: backup ID, timestamp, restore drill owner.

### 2. Git commit / release

- Merge `fix/tire-health-production-readiness-2026-07` → `main` after staging sign-off.
- Tag release (e.g. `tire-health-2026.07`).
- Deploy artifact = backend `dist/` + frontend `backend/public/` bundle.

### 3. Migrate status (staging, then prod)

```bash
cd backend
export DATABASE_URL="<staging-or-prod>"
npx prisma migrate status
```

Expect: all `2026071618*`–`2026071628*` pending on first deploy.

### 4. Migrate deploy

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

Verify: no failed migration rows in `_prisma_migrations`.

### 5. Backend and worker deploy

- Deploy single PM2 `synqdrive` process (API + BullMQ workers + schedulers).
- Confirm `WorkersModule` loads `TireRecalculationProcessor`.
- Confirm Redis connectivity for `dimo.tire.recalculation`.

### 6. Feature flags

| Flag / gate | Tire impact |
|-------------|-------------|
| BullMQ / Redis | Required for async recalculation |
| HM polling | Improves `TirePressureContext` coverage |
| DIMO snapshot scheduler | Odometer + kPa pressure ingest |
| ClickHouse | Optional — not on tire critical path |

No dedicated tire feature flag; behavior is code-gated via capability checks (`tire-dimo-signal-capability`).

### 7. Read-only audits (before any apply)

On **staging snapshot** or supervised production copy:

```bash
cd backend
export DATABASE_URL="..."
export TIRE_HEALTH_AUDIT_ALLOW_REMOTE=1   # if non-local
# export TIRE_HEALTH_AUDIT_ALLOW_PROD=1  # supervised prod read-only only

npx ts-node -r tsconfig-paths/register ../scripts/audits/audit-tire-health-production-readiness.ts --phase=3 --days=60 \
  --output=../docs/audits/data/tire-health-integrity-findings-post-remediation.json

npx ts-node -r tsconfig-paths/register ../scripts/audits/audit-tire-health-dimo-signals.ts

# Odometer anchor candidates (read-only)
# Use TireOdometerAnchorBackfillService.auditCandidates() via admin/ops endpoint or script

# Trip usage backfill audit (read-only)
# Use TireTripUsageBackfillService.auditHistoricalTrips()
```

Artifacts to archive:

- Odometer anchor candidate report (EXACT / HIGH / MEDIUM / LOW / CONFLICT)
- Trip usage ledger backfill audit
- Integrity findings JSON
- Ground-truth classification CSV
- DIMO signal coverage CSV
- Duplicate snapshot / wear data point counts

### 8. Odometer apply — small batches

**Staging only first.** Production requires explicit batch approval.

- Apply **EXACT** and **HIGH_CONFIDENCE** candidates only.
- Batch size: ≤ 10 setups per batch.
- Service: `TireOdometerAnchorBackfillService.applyApprovedCandidates()`.
- After each batch: verify `installedOdometerKm`, `odometerAnchorStatus`, `TireEvent` audit row.

### 9. Ledger backfill — small batches

- Replay canonical finalized trips not yet in `TireTripUsageLedger`.
- Batch size: ≤ 50 trips per vehicle per run.
- Service: `TireTripUsageBackfillService.applyHistoricalBackfill()`.
- Idempotency: ledger unique constraints + advisory locks.

### 10. Reconciliation

```bash
# TireTripUsageLedgerReconciliationService.reconcileVehicle(vehicleId)
```

Check:

- `totalKmOnSet` == sum(active ledger rows) ± tolerance
- No duplicate active ledger rows per `(tripId, tireSetupId)`
- No km double-count vs pre-ledger baseline snapshot

### 11. Limited recalculation

- Enqueue recalculation **only for affected vehicle IDs** (not full fleet blindly).
- Use `TireHealthService.recalculate(vehicleId)` or hourly scheduler (natural dedupe via fingerprint).
- Monitor: `synqdrive_tire_recalculation_total`, `_failed_total`, `_deduplicated_total`.

### 12. Integrity audit

Re-run Phase 3 audit. **Acceptance: 0 open P0** in integrity register.

Checks:

- `synthetic_points` count = 0
- `wear_points` > 0 only after anchors + GT measurements
- No `abs(actual - predicted) < 0.001` without measurement ID
- Pressure values in bar band (0.5–6.0) for DIMO ingest

### 13. Monitoring

| Metric / alert | Threshold |
|----------------|-----------|
| `synqdrive_tire_recalculation_failed_total` | > 0 sustained 15m |
| `synqdrive_queue_lag_seconds{queue="dimo.tire.recalculation"}` | p95 > 300s |
| `synqdrive_tire_usage_mapping_conflict_total` | investigate any spike |
| `synqdrive_tire_rental_block_total{level="HARD_BLOCK"}` | dashboard only — no auto-action |
| Rental health gate 5xx | page on-call |

Logs: JSON `component=tire_*` — no vehicleId/tripId/VIN in structured fields.

### 14. Pilot vehicles

- Select 2–3 vehicles with: measured tread, odometer anchor, HM or DIMO pressure, completed trips.
- Validate UI: measured vs estimated vs default labels; rental gate; alerts deduped.
- Hold 48h before fleet rollout.

### 15. Fleet rollout

- Enable hourly recalculation scheduler (already on if workers running).
- Run ledger backfill fleet-wide in off-peak windows.
- Open manual measurement campaign (see remediation doc).

---

## Rollback procedure

1. **Stop new processing:** pause tire recalculation scheduler or scale workers to 0 for tire queue only.
2. **Do not delete:** ledger rows, measurements, snapshots, wear data points, alert history.
3. **Drain jobs:** inspect BullMQ `dimo.tire.recalculation` waiting/active; let in-flight jobs complete or move to failed (retained 7d).
4. **Schema:** remain on migrated schema — old code may not boot if rolled back binary-only without schema compatibility check.
5. **No DB restore as default** — restore only for catastrophic migration failure with DBA approval.
6. **Rental gate:** if blocking regressions, use `TireRentalHealthReviewService` time-boxed overrides (audited).

---

## Staging verification checklist (Prompt 24)

| Step | Status in agent CI | Operator action |
|------|-------------------|-----------------|
| DB backup / snapshot | ⚠️ Not available | Ops: snapshot staging DB |
| `prisma migrate deploy` empty DB | ⚠️ No Docker | CI job with Postgres service |
| `prisma migrate deploy` fixture DB | ⚠️ No Docker | Use fleet anonymized fixture |
| Read-only audits | ⚠️ Needs DATABASE_URL | Run scripts on staging |
| Controlled apply | **NOT RUN** | Staging only, batched |
| Replay / negative tests | ✅ Unit matrix (84+ tests) | Optional staging replay |
| Post-fix backtest | ⚠️ Needs DB | `audit-tire-health-backtest.ts` |

---

## Contacts & references

- Audit baseline: `5280a83` (`audit/tire-health-production-readiness-2026-07`)
- Implementation: `fix/tire-health-production-readiness-2026-07`
- Test matrix: `docs/audits/data/tire-health-test-coverage-2026-07.csv`
- Prometheus metrics prefix: `synqdrive_tire_*`
