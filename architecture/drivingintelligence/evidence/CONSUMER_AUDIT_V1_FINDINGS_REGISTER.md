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

---

## P6 remediation records (append-only)

Historical P1/P2 tables above are **unchanged**. This section records consumer-path remediation on the Alpha monorepo only.

| Finding | Remediation PR | Recorded branch HEAD | merge_status | Remediation summary | Residual / notes |
|---------|----------------|----------------------|--------------|---------------------|------------------|
| **P1-2** | [#2439](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2439) | `afd3b52eca5faf2eaf6810b8a67525fe0acb0490` (code); governance docs on same PR | **OPEN** (draft) | `RentalDrivingAnalysisService` loads **all** `TripDrivingImpact` rows per assigned trip (no query status filter) so missing vs inadmissible rows are distinguished; **only** `analysisStatus` **COMPLETE** \| **PARTIAL** contribute admissible stress via `resolveRentalTripStressScore`; settlement uses `tdiAnalysisStatus` (`isRentalTripImpactSettledForAssessment`, `isRentalTripWithAdmissibleTdiImpact`); specs in `rental-driving-analysis.tdi-quality.spec.ts`, `assessment.spec.ts`, recompute/versioning | **P1-1**, **P1-4**, canonical mapper, DriverScore paths **unchanged** on this PR |
| **P1-3** | [#2439](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2439) | `afd3b52eca5faf2eaf6810b8a67525fe0acb0490` (code); governance docs on same PR | **OPEN** (draft) | Rental aggregation uses `resolveRentalTripStressScore`: no `trip.drivingScore` when a TDI row exists; `vehicle_trip_compat` only when **no TDI row** and `drivingImpactStatus === PENDING` (F3 — not SKIPPED/FAILED/READY); READY without TDI fail-closed (F1) | `trip-analytics-canonical.service` compat path **not** modified in #2439; **LEGACY_GAP** backfill still owner scope (P2-4) |

**Governance closeout:** `architecture/rental-driving-analysis/CURRENT_STATE.md` aligned; platform ledger rows **P6-PR1-MERGED**, **P6-PR2-DRAFT** (2026-11-19).
