# Vehicle.status — Write-Path Inventory (Prompt 17/43)

**Date:** 2026-07-15  
**Mode:** Read-only audit — no production or schema changes  
**Scope:** All code paths that **write** `Vehicle.status` (Prisma `VehicleStatus`)  
**Related audits:** `vehicle-operational-status-inventory.md` (Prompt 1), `vehicle-status-ks-fh-660e-trace.md` (Prompt 2)

---

## Executive summary

| Finding | Detail |
|---------|--------|
| **Canonical operational truth** | Since Prompts 11–16, fleet **read** truth is `vehicle-operational-state.builder` (booking context + maintenance + ghost guard). `Vehicle.status` is a **persisted raw column**, not the sole source of truth. |
| **RENTED writes** | **Yes — only via** `VehicleRawStatusWriteService.applyHandoverPickup` (booking handover). **Fixed Prompt 19** — no workflow/generic/admin path. |
| **RESERVED writes** | **Blocked** in all domains. **Fixed Prompt 19** — derived only; existing DB rows diagnostic. |
| **Central write boundary** | **Fixed Prompt 19** — `VehicleRawStatusWriteService` + ActivityLog audit for all legitimate raw status changes. |
| **Dangerous paths** | ~~`PATCH .../vehicles/:vehicleId` (org + global) accept full `Prisma.VehicleUpdateInput`~~ **Fixed Prompt 18** — `VehicleGenericPatchDto` whitelist; status/relations rejected with 400. ~~Workflow/generic direct writes~~ **Fixed Prompt 19**. |
| **Raw SQL (runtime)** | **None found** that UPDATE `vehicles.status`. Migrations set `@default(AVAILABLE)` only. |

### Prisma enum (`Vehicle.status`)

```
AVAILABLE | RENTED | IN_SERVICE | OUT_OF_SERVICE | RESERVED
```

Default on create: `AVAILABLE` (`schema.prisma`).

---

## Classification legend

| Class | Meaning |
|-------|---------|
| **A** | Zulässiger Grundstatus-Write (admin/operator sets base availability or maintenance) |
| **B** | Booking-/Handover-gesteuerter Write (lifecycle side-effect) |
| **C** | Maintenance-gesteuerter Write (service / block / Wartung) |
| **D** | Unzulässiger generischer Write (bypasses guards; can create ghost states) |
| **E** | Test / Migration / Ops script |
| **F** | Historisch / dead code / no status write (listed for completeness) |

---

## Write-path register

### 1. Booking pickup handover

| Field | Value |
|-------|-------|
| **File / method** | `backend/src/modules/bookings/bookings-handover.service.ts` → `createHandover()` (kind `PICKUP`) |
| **Caller role** | Operator / rental staff via handover API |
| **HTTP** | `POST .../bookings/:id/handover` (PICKUP) |
| **Values written** | `VehicleStatus.RENTED` |
| **Domain** | Booking lifecycle — physical handover completes; booking → `ACTIVE` |
| **Guards** | Rejects if vehicle `IN_SERVICE` / `OUT_OF_SERVICE`; tenant via `organizationId` on booking |
| **Audit** | Global `AuditInterceptor` on mutating routes (`ActivityEntity.VEHICLE` when URL contains `/vehicles`; booking route may log as `BOOKING`) |
| **Class** | **B** |
| **Write still allowed?** | **Yes** (short term) — keeps DB column aligned with handover |
| **Target treatment** | Treat as **sync hint**, not canonical truth. Canonical `ACTIVE_RENTED` must come from booking + handover protocol. Consider stopping raw `RENTED` write once all readers use operational-state engine only. |

---

### 2. Booking return handover

| Field | Value |
|-------|-------|
| **File / method** | `bookings-handover.service.ts` → `createHandover()` (kind `RETURN`) |
| **Caller role** | Operator / rental staff |
| **Values written** | `VehicleStatus.AVAILABLE` (only if no other `ACTIVE` booking and not maintenance-blocked) |
| **Also** | May update `currentStationId` without status change |
| **Domain** | Booking lifecycle — booking → `COMPLETED` |
| **Guards** | Skips `AVAILABLE` when `IN_SERVICE`/`OUT_OF_SERVICE` or another `ACTIVE` booking exists |
| **Audit** | Same as pickup |
| **Class** | **B** |
| **Write still allowed?** | **Yes** (short term) |
| **Target treatment** | Release write remains useful for DB hygiene; fleet UI must not trust raw `AVAILABLE` if booking context disagrees (ghost guard). |

---

### 3. Booking cancel

| Field | Value |
|-------|-------|
| **File / method** | `backend/src/modules/bookings/bookings.service.ts` → `cancel()` |
| **Caller role** | Operator / API consumer with org scope |
| **Values written** | `VehicleStatus.AVAILABLE` via `vehicle.updateMany` |
| **Condition** | `status NOT IN (IN_SERVICE, OUT_OF_SERVICE)` |
| **Domain** | Booking cancellation — releases vehicle for re-booking |
| **Guards** | Tenant: booking loaded with `organizationId`; vehicle matched by `booking.vehicleId` |
| **Audit** | Interceptor on booking cancel route |
| **Class** | **B** |
| **Write still allowed?** | **Yes** |
| **Target treatment** | Keep as release side-effect; operational `AVAILABLE` still derived from absence of blocking bookings. |

---

### 4. Booking no-show

| Field | Value |
|-------|-------|
| **File / method** | `bookings.service.ts` → `markNoShow()` |
| **Caller role** | Operator |
| **Values written** | `VehicleStatus.AVAILABLE` (same maintenance guard as cancel) |
| **Domain** | Booking `NO_SHOW` — vehicle never handed out |
| **Class** | **B** |
| **Write still allowed?** | **Yes** |
| **Target treatment** | Same as cancel. |

---

### 5. Dedicated status endpoint (guarded)

| Field | Value |
|-------|-------|
| **File / method** | `backend/src/modules/vehicles/vehicles.controller.ts` → `updateVehicleStatus()` |
| **Service** | `vehicles.service.ts` → `update()` |
| **HTTP** | `PATCH /organizations/:orgId/vehicles/:vehicleId/status` |
| **Caller role** | Org-scoped operator / admin (`OrgScopingGuard`) |
| **Body DTO** | `{ status?: VehicleStatus; cleaningStatus?: CleaningStatus; healthStatus?: HealthStatus }` |
| **Values allowed** | **Only** `AVAILABLE`, `IN_SERVICE`, `OUT_OF_SERVICE` (`ADMIN_WRITABLE_VEHICLE_STATES`) |
| **Values rejected** | `RENTED`, `RESERVED` — `400 BadRequest` with explicit message |
| **Domain** | Manual operational / maintenance availability |
| **Side effects** | `cleaningStatus=NEEDS_CLEANING` → `VehicleCleaningTaskService.ensureCleaningTask` |
| **Audit** | `AuditInterceptor` → `ActivityEntity.VEHICLE`, action `UPDATE` |
| **Class** | **A** (AVAILABLE) / **C** (IN_SERVICE, OUT_OF_SERVICE) |
| **Write still allowed?** | **Yes** — primary supported admin path |
| **Target treatment** | Remains the **only** intentional HTTP API for operators to set base availability/maintenance. Extend with reason codes / audit payload later; do not use for rental states. |

---

### 6. Generic org vehicle PATCH (unguarded)

| Field | Value |
|-------|-------|
| **File / method** | `vehicles.controller.ts` → `updateByOrg()` |
| **Service** | `vehicles.service.ts` → `update()` → `prisma.vehicle.update` |
| **HTTP** | `PATCH /organizations/:orgId/vehicles/:vehicleId` |
| **Caller role** | Org member (no extra status guard) |
| **Body DTO** | Full `Prisma.VehicleUpdateInput` — **`status` optional, any enum** |
| **Values possible** | All five `VehicleStatus` values including `RENTED`, `RESERVED` |
| **Domain** | General vehicle master-data edit |
| **Tenant** | `update(id, data, organizationId)` — `findFirst` with org scope before write |
| **Audit** | Interceptor |
| **Frontend usage** | `api.vehicles.update()` — Master `App.tsx` `handleUpdateVehicle` (master fields only today; **no status in payload**) |
| **Class** | **D** |
| **Write still allowed?** | **No** for `status` field — should be blocked or stripped |
| **Target treatment** | **Strip `status` from generic PATCH** or reject with 400. Force all status changes through `.../status` or domain services. |

---

### 7. Generic global vehicle PATCH (unguarded)

| Field | Value |
|-------|-------|
| **File / method** | `vehicles.controller.ts` → `update()` |
| **HTTP** | `PATCH /vehicles/:vehicleId` |
| **Guard** | `VehicleOwnershipGuard` (org from JWT; `MASTER_ADMIN` bypass) |
| **Body** | Full `Prisma.VehicleUpdateInput` |
| **Values possible** | Any `VehicleStatus` |
| **Class** | **D** |
| **Target treatment** | Same as §6 — block `status` on generic PATCH. |

---

### 8. Workflow action `vehicle.status.update`

| Field | Value |
|-------|-------|
| **File / method** | `backend/src/modules/workflows/workflow-action-executor.service.ts` → `execVehicleStatusUpdate()` |
| **Normalizer** | `workflows/vehicle-status.util.ts` → `normalizeVehicleStatusForPrisma()` |
| **Caller role** | System / workflow automation (tenant-scoped) |
| **Values possible** | **All** enum values — maps UI labels (`Maintenance` → `IN_SERVICE`, `Active Rented` → `RENTED`, `Reserviert` → `RESERVED`, etc.) |
| **Domain** | Workflow automation |
| **Tenant** | `vehicle.findFirst({ id, organizationId })` |
| **Audit** | Workflow run logs; not a dedicated vehicle-status audit row |
| **Validator** | `workflow-definition.validator.ts` — requires valid status at definition time |
| **Class** | **D** (for `RENTED`/`RESERVED`) / **A** or **C** (for `AVAILABLE`/`IN_SERVICE`/`OUT_OF_SERVICE`) |
| **Write still allowed?** | **Partially** — maintenance/available yes; **rental states no** |
| **Target treatment** | Restrict workflow allowlist to `AVAILABLE`, `IN_SERVICE`, `OUT_OF_SERVICE`. Remove `RENTED`/`RESERVED` from `LABEL_MAP`. |

---

### 9. Vehicle registration — DIMO

| Field | Value |
|-------|-------|
| **File / method** | `vehicles.service.ts` → `registerFromDimo()` → `prisma.vehicle.create` |
| **HTTP** | `POST /organizations/:orgId/vehicles/register-from-dimo` |
| **Caller role** | Operator / admin registering from DIMO |
| **Values written** | Default `AVAILABLE` (schema) unless `extraData.status` passed through |
| **Risk** | `extraData` spread into `createData` — client **could** supply `status` |
| **Class** | **A** (default) / **D** if client passes `RENTED`/`RESERVED` |
| **Target treatment** | Strip `status` from `extraData` on create; always `AVAILABLE`. |

---

### 10. Vehicle registration — generic create

| Field | Value |
|-------|-------|
| **File / method** | `vehicles.service.ts` → `create()` |
| **HTTP** | `POST /organizations/:orgId/vehicles` |
| **Body** | `Omit<Prisma.VehicleCreateInput, 'organization'>` |
| **Values** | Schema default `AVAILABLE` or any explicit `status` in body |
| **Class** | **A** / **D** if rental statuses passed |
| **Target treatment** | Allow only `AVAILABLE` on create (or omit → default). |

---

### 11. Vehicle registration — High Mobility (HM_ONLY)

| Field | Value |
|-------|-------|
| **File / method** | `high-mobility/high-mobility-registration.service.ts` → `registerHmOnlyVehicle()` |
| **Values written** | Explicit `status: 'AVAILABLE'` on `tx.vehicle.create` |
| **Class** | **A** |
| **Target treatment** | Keep. |

---

### 12. Prisma passthrough service method

| Field | Value |
|-------|-------|
| **File / method** | `vehicles.service.ts` → `update(id, data, organizationId?)` |
| **Prisma** | `prisma.vehicle.update({ where, data })` |
| **Note** | All HTTP PATCH paths and future internal callers funnel here. **No status validation inside service.** |
| **Class** | Infrastructure — risk depends on caller |
| **Target treatment** | Optional central guard: reject `data.status` unless caller is allowlisted domain service. |

---

## Paths that touch `vehicle.update` but do **not** write `status`

| File / method | Fields updated | Class |
|---------------|----------------|-------|
| `vehicles.service.ts` → `updateCleaningStatus` | `cleaningStatus` only | **F** |
| `vehicles.service.ts` → `updateHealthStatus` | `healthStatus` only (deprecated column) | **F** |
| `service-events.service.ts` → `refreshVehicleHistoryDenorm` | `lastServiceDate`, oil change denorm | **F** |
| `document-extraction-apply.service.ts` | TÜV/BOKraft/service/oil dates | **F** |
| `stations.service.ts` → `assignVehicleToStation`, `updateVehicleCurrentStation`, `setStationVehicles` | `homeStationId`, `currentStationId`, `expectedStationId` | **F** |
| `rental-rules.service.ts` → `assignCategoryVehicles` | `rentalCategoryId` only | **F** |
| `vehicle-intelligence.controller.ts` → `updateHardwareType` | `hardwareType` only | **F** |
| `platform-admin.controller.ts` → `backfillHardwareType` | `hardwareType` via `updateMany` | **F** |
| `bookings-handover.service.ts` RETURN branch | Sometimes **only** `currentStationId` | **F** (partial) |

---

## Raw SQL & migrations

| Location | Writes `vehicles.status`? | Class |
|----------|---------------------------|-------|
| `prisma/migrations/20260311224040_init/migration.sql` | Defines column `DEFAULT 'AVAILABLE'` | **E** |
| All other migrations searched | Indexes on other tables' `status`; no runtime UPDATE on `vehicles.status` | **E** |
| Application `$executeRaw` / `$queryRaw` | **No matches** updating `vehicles.status` | — |

---

## Tests & fixtures

| Location | Writes DB `Vehicle.status`? | Class |
|----------|----------------------------|-------|
| `vehicle-operational-state.*.spec.ts` | In-memory fixtures only | **E** |
| `vehicle-raw-status.guard.spec.ts` | In-memory | **E** |
| `vehicles.service.spec.ts` | Mocked Prisma / builder output | **E** |
| `service-events.service.spec.ts` | Asserts `vehicle.update` without `status` | **E** |
| `workflows.service.spec.ts` | Validates workflow defs incl. `OUT_OF_SERVICE` | **E** |
| `vehicle-status.util.spec.ts` | Normalizer unit tests | **E** |
| Frontend dashboard `*.test.ts` fixtures | `status ?? 'Available'` in **test data only** | **E** |

---

## Ops / E2E scripts

| Script | Status write? | Class |
|--------|---------------|-------|
| `scripts/ops/stripe-connect-e2e-setup-booking.ts` | **Read** filter `status: 'AVAILABLE'` — no write | **E** |
| Other `backend/scripts/**` searched | No `vehicle.update` with status | **E** |

---

## Frontend write surfaces (call backend)

| Surface | API | Writes `Vehicle.status`? |
|---------|-----|--------------------------|
| Rental `App.tsx` | `api.vehicles.updateOperationalStatus` | Only if `status` in body — **currently sends `cleaningStatus` only** |
| Master `App.tsx` | `api.vehicles.update` | Master data fields — **no status today** |
| Operator handover UI | Booking handover API | Indirect via §1–2 |
| Booking cancel / no-show UI | Bookings API | Indirect via §3–4 |

---

## Explicit answers (Prompt 17)

### Wird `RESERVED` überhaupt noch dauerhaft benötigt?

| Layer | Answer |
|-------|--------|
| **DB column value** | **Not required** for correct fleet UI since booking-derived operational state (Prompt 11–15). No current booking/handover path **sets** `RESERVED`. |
| **Operational label `Reserved`** | **Yes** — derived from `reservationWindowBooking` (CONFIRMED/PENDING in pickup window), not from persisting `Vehicle.status=RESERVED`. |
| **Enum retention** | Keep enum value for **backward compatibility** with legacy rows and workflow configs until data migration + write lockdown. |
| **Recommendation** | Stop **new** `RESERVED` writes; migrate legacy `RESERVED` rows to `AVAILABLE` where booking context supports it; derive Reserved in read-model only. |

### Wird `RENTED` als Rohstatus weiterhin geschrieben?

**Yes.**

| Writer | When |
|--------|------|
| `BookingsHandoverService` PICKUP | Every successful pickup handover |
| Workflow `vehicle.status.update` | When configured |
| Unguarded `PATCH .../vehicles/:id` | If client sends `status: RENTED` |

Pickup handover is the **only intended production writer** today. Ghost `RENTED` without `ACTIVE` booking is flagged `UNKNOWN` at read time (Prompt 15).

### Welche Kompatibilität benötigt bestehender Code?

| Consumer | Depends on raw `Vehicle.status` |
|----------|--------------------------------|
| `organizations.service.ts` stats (`groupBy status`) | **Yes** — raw counts |
| `stations.service.ts` station metrics | **Yes** — `AVAILABLE`/`RENTED` counts |
| `dimo-snapshot.scheduler.ts` | **Yes** — polls `AVAILABLE` + `RENTED` |
| Business insights detectors (6×) | **Yes** — `status IN (...)` often includes `RESERVED` |
| `billable-vehicles.service.ts` | **Yes** — excludes `OUT_OF_SERVICE` |
| Fleet rental API (`/vehicles`, `/fleet-map`) | **No** — operational-state builder + legacy string |
| Frontend Prompt 16 normalizer | **No** — fail-closed `Unknown` |

Migration strategy: keep column + enum; tighten writers; migrate stats/schedulers to operational-state or booking queries over time.

### Welche Writes können vorerst bleiben, aber nicht als kanonische Wahrheit gelten?

| Write | Keep temporarily? | Canonical truth |
|-------|-------------------|-----------------|
| Handover → `RENTED` | Yes | `Booking.status=ACTIVE` + pickup protocol |
| Handover / cancel / no-show → `AVAILABLE` | Yes | No blocking booking + not maintenance |
| Admin `.../status` → `AVAILABLE` / `IN_SERVICE` / `OUT_OF_SERVICE` | Yes | Operator intent for base availability / maintenance |
| Workflow → maintenance states | Yes, after allowlist trim | Operator/workflow intent |
| Workflow → `RENTED`/`RESERVED` | **No** | Booking/handover only |
| Generic PATCH → any status | **No** | — |
| Booking create → `RESERVED` | Never existed in current code | Booking row |

---

## Recommended write lockdown order (future prompts)

1. **Strip `status` from generic PATCH** (`updateByOrg`, `PATCH /vehicles/:id`) and from `registerFromDimo` `extraData`.
2. **Restrict workflow** `vehicle.status.update` to `AVAILABLE`, `IN_SERVICE`, `OUT_OF_SERVICE`.
3. **Add service-layer guard** in `VehiclesService.update()` for defense in depth.
4. **Optional:** Stop persisting `RENTED` on handover once all downstream consumers use operational-state only (larger migration).
5. **Data migration:** Normalize legacy `RESERVED`/`RENTED` ghosts; document in ops runbook.

---

## Search methodology (reproducible)

```bash
# Prisma vehicle mutations
rg 'prisma\.vehicle\.(update|updateMany|create)' backend --glob '*.ts'

# Explicit VehicleStatus writes
rg "VehicleStatus\.(AVAILABLE|RENTED|RESERVED|IN_SERVICE|OUT_OF_SERVICE)|status:\s*['\"]AVAILABLE" backend --glob '*.ts'

# Handover / booking
rg 'vehicle\.update|tx\.vehicle\.update' backend/src/modules/bookings --glob '*.ts'

# Workflows
rg 'execVehicleStatusUpdate|vehicle\.status\.update' backend --glob '*.ts'

# HTTP status endpoints
rg 'updateVehicleStatus|ADMIN_WRITABLE_VEHICLE_STATES' backend --glob '*.ts'

# Raw SQL
rg 'UPDATE.*vehicles|vehicles.*status' backend/prisma --glob '*.sql'

# Frontend callers
rg 'updateOperationalStatus|vehicles\.update' frontend/src --glob '*.{ts,tsx}'
```

---

## Document status

- **Changes:** not updated (read-only audit per Prompt 17)
- **Architektur:** not updated (read-only audit per Prompt 17)
