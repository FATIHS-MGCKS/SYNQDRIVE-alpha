# Consumer Audit V1 — Findings Register (DS4 migration traceability)

| Field | Value |
|-------|-------|
| **Audit** | Driver Score & Rental Driving Analysis Consumer Audit V1 |
| **Mode** | STRICT READ_ONLY |
| **Production SHA** | `51adb23499653d0f2c7774d98737a34bd615b262` |
| **Preserved in** | [`design/DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md`](../design/DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md) |

---

## P1 findings

| ID | Finding | Acceptance criteria (remediation PR-1 unless noted) |
|----|---------|------------------------------------------------------|
| **P1-1** | `TripDrivingImpact` rows with `analysisStatus=STALE` carry numeric scores and are consumed as valid (`DriverScoreService`, rolling `updateRollingCurrent`) | Aggregators and rolling writer filter `analysisStatus IN (COMPLETE, PARTIAL)` only; STALE excluded from distance-weighted stress; unit specs assert 7 production STALE rows would be excluded |
| **P1-2** | `RentalDrivingAnalysisService` loads TDI without `analysisStatus` filter; gates on `VehicleTrip.drivingImpactStatus` only | TDI query filters COMPLETE\|PARTIAL; rental `assessmentStatus` reflects uncovered trips; specs for PARTIAL TDI |
| **P1-3** | Legacy fallback `impact?.drivingStressScore ?? trip.drivingScore` in rental aggregation and canonical mapper | No `trip.drivingScore` fallback when TDI row exists; `scoreSource` documents compat only for pre-authority trips |
| **P1-4** | `DriverScoreService` publishes numeric `drivingStressScore` when `hasEnoughData=false` | API returns explicit `INSUFFICIENT_EVIDENCE` / null score contract; customers map respects gate |

---

## P2 findings

| ID | Finding | Acceptance criteria |
|----|---------|---------------------|
| **P2-1** | `RentalStressAnalysisCard` shows stress without `assessmentStatus` / TDI quality hints | PR-6: status props + i18n hints all 9 locales |
| **P2-2** | `bookings.service.findDetail` exposes `usage.drivingStressScore` without assessment gate | PR-6: expose `assessmentStatus` or null score when not COMPLETE\|PARTIAL |
| **P2-3** | `return-needs-inspection.detector` uses `drivingScore` / payload stress without assessment gate | PR-6: gate strong signals on `assessmentStatus === COMPLETE` |
| **P2-4** | LEGACY_GAP: COMPLETED trips `drivingImpactStatus=READY` without `trip_driving_impact` row (19 / 90d at audit) | Reconciliation marks status consistent; no fabricated scores; ops backfill owner-only (Scope D) |

---

## Addendum findings

| ID | Relates | Finding | Acceptance criteria |
|----|---------|---------|---------------------|
| **ADDENDUM-1** | P1-1 | `updateRollingCurrent` `findMany` has no status filter; `selectRollingCohort` does not exclude STALE | Same as P1-1 for `VehicleDrivingImpactCurrent` |
| **ADDENDUM-2** | P2-2 | Backend mirror of rental UI gap on bookings detail usage field | Same as P2-2 |

---

## Fail-closed alignment

All findings above violate or risk violating **FC-1..FC-4** in `DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md`. PR-1 remediates on the **legacy path** before DS4 authority switch (PR-5+).
