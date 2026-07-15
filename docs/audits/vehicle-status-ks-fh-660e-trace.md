# Vehicle Status Trace — KS FH 660E (Prompt 2/43)

**Date:** 2026-07-15 (trace executed ~20:57 UTC)  
**Mode:** Read-only — no code, schema, credentials, or production data mutations  
**Vehicle ID (audit reference):** `68868291-5478-42cd-b0c4-cc77b2a78e21`  
**License plate:** KS FH 660E  
**Prior docs:** `vehicle-operational-status-inventory.md`, `vehicle-fleet-reserved-status-audit-ks-fh-660e.mrf`

---

## 1. Environment probe (this agent run)

| Check | Result |
|-------|--------|
| `DATABASE_URL` in agent env | Set (value redacted) |
| Local Postgres `localhost:5432` | **Not reachable** (`pg_isready` — no response) |
| Local backend `localhost:3000/api/v1/health` | **Not running** |
| Production `GET https://app.synqdrive.eu/api/v1/health` | **200** — `{"status":"ok","uptime":805,"timestamp":"2026-07-15T20:57:39.266Z"}` |
| Authenticated tenant API calls | **Not executed** — no Clerk/session token in agent; endpoints require `OrgScopingGuard` / roles |

**Conclusion:** Live row-level data for KS FH 660E could **not** be read in this environment. Below: repo-known identifiers, exact SQL/API recipes, and **code-derived** expected derivation for the operator-reported scenario (booking **1.8.–6.8.**).

---

## 2. Repo-known identifiers (not a live DB snapshot)

| Entity | ID / value | Source |
|--------|------------|--------|
| Vehicle | `68868291-5478-42cd-b0c4-cc77b2a78e21` | `architecture/STRIPE_CONNECT_E2E_TEST_REPORT_2026-07-14.md` |
| Organization (FMS) | `faa710c9-6d91-4079-a7d5-91fdccdec14a` | Same report + `stripe-connect-e2e-setup-booking.ts` |
| Documented E2E booking | `2c4cc4cd-2076-4650-a146-92d8c2e8ca56` | E2E report — **2026-10-01 → 2026-10-06**, status **CONFIRMED** |
| Operator-reported booking window | **2026-08-01 → 2026-08-06** | User audit (`vehicle-fleet-reserved-status-audit-ks-fh-660e.mrf`) — **booking ID unknown in repo** |

**Schema note:** There is **no** `booking_number` column. UI `bookingNumber` / `BK-…` is derived from `booking.id` (`bookingRef`: last 6 chars). There are **no** `actual_pickup_at` / `actual_return_at` on `bookings`; actual times come from `booking_handover_protocols.performed_at` and/or `bookings.completed_at`.

---

## 3. Live data — vehicle raw record

### 3.1 Observed in this trace

| Field | Value |
|-------|-------|
| All fields | **NOT OBSERVED** — DB unreachable |

### 3.2 Read-only SQL (run on production read replica or ops RO session)

```sql
-- V-1: Core vehicle row
SELECT
  id,
  organization_id,
  license_plate,
  status                    AS raw_vehicle_status,
  cleaning_status,
  health_status,
  home_station_id           AS station_id,
  current_station_id,
  expected_station_id,
  notes,
  updated_at,
  created_at
FROM vehicles
WHERE id = '68868291-5478-42cd-b0c4-cc77b2a78e21';

-- V-2: Resolve org if unknown
SELECT id, organization_id, license_plate, status, updated_at
FROM vehicles
WHERE license_plate ILIKE '%KS%FH%660E%'
   OR license_plate = 'KS FH 660E';

-- V-3: Maintenance / blocking proxies (no separate blocking column on Vehicle)
-- IN_SERVICE / OUT_OF_SERVICE → Maintenance in fleet UI
-- rental_blocked lives in RentalHealthService, not this table
SELECT status, health_status, cleaning_status, next_tuv_date, next_bokraft_date
FROM vehicles
WHERE id = '68868291-5478-42cd-b0c4-cc77b2a78e21';
```

**Expected raw `Vehicle.status` candidates for pre-pickup CONFIRMED booking (typical):** `AVAILABLE` (booking create does **not** set `RESERVED`). `RENTED` only after PICKUP handover. `RESERVED` only via workflow or unguarded PATCH (see inventory P1-3/P1-4).

---

## 4. Live data — bookings

### 4.1 Observed in this trace

| Field | Value |
|-------|-------|
| All booking rows | **NOT OBSERVED** |

### 4.2 Read-only SQL

```sql
-- B-1: All non-terminal bookings for vehicle
SELECT
  id,
  organization_id,
  vehicle_id,
  customer_id,
  status,
  start_date,
  end_date,
  cancelled_at,
  completed_at,
  pickup_station_id,
  return_station_id,
  actual_pickup_station_id,
  actual_return_station_id,
  created_at,
  updated_at,
  -- Derived display ref (matches frontend bookingRef)
  'BK-' || UPPER(RIGHT(id::text, 6)) AS booking_ref_display
FROM bookings
WHERE vehicle_id = '68868291-5478-42cd-b0c4-cc77b2a78e21'
  AND status NOT IN ('CANCELLED', 'NO_SHOW')
ORDER BY start_date ASC;

-- B-2: Bookings matching operator window (Aug 2026)
SELECT *
FROM bookings
WHERE vehicle_id = '68868291-5478-42cd-b0c4-cc77b2a78e21'
  AND start_date >= '2026-08-01'
  AND end_date   <= '2026-08-07'
ORDER BY start_date;

-- B-3: Rows that would populate reservedBookingId at read time (2026-07-15)
-- Logic mirror: buildBookingContextMap OR branch
SELECT
  id,
  status,
  start_date,
  end_date,
  (end_date >= NOW()) AS passes_end_date_gate,
  (start_date < NOW()) AS start_in_past,
  CASE
    WHEN status = 'ACTIVE' THEN '→ activeBookingId'
    WHEN status IN ('PENDING', 'CONFIRMED') AND end_date >= NOW() THEN '→ reservedBookingId'
    ELSE '→ ignored'
  END AS fleet_derivation_slot
FROM bookings
WHERE vehicle_id = '68868291-5478-42cd-b0c4-cc77b2a78e21'
  AND (
    status = 'ACTIVE'
    OR (status IN ('PENDING', 'CONFIRMED') AND end_date >= NOW())
  )
ORDER BY start_date ASC;
```

**Mapping for requested API fields:**

| Requested field | DB / source |
|-----------------|-------------|
| `bookingNumber` | **Not stored** — use `booking_ref_display` or API mapper |
| `actualPickupAt` | `booking_handover_protocols.performed_at` WHERE `kind = 'PICKUP'` |
| `actualReturnAt` | `booking_handover_protocols.performed_at` WHERE `kind = 'RETURN'` |

---

## 5. Live data — handover / pickup / return

### 5.1 Observed in this trace

| Protocol | Observed |
|----------|----------|
| PICKUP / RETURN | **NOT OBSERVED** |

### 5.2 Read-only SQL

```sql
-- H-1: Handover protocols for all open bookings on vehicle
SELECT
  p.id,
  p.booking_id,
  p.kind,
  p.performed_at,
  p.odometer_km,
  p.performed_by_name,
  p.created_at,
  p.updated_at,
  b.status AS booking_status,
  b.start_date,
  b.end_date
FROM booking_handover_protocols p
JOIN bookings b ON b.id = p.booking_id
WHERE p.vehicle_id = '68868291-5478-42cd-b0c4-cc77b2a78e21'
ORDER BY p.performed_at ASC;

-- H-2: Pickup existence gate (findTodaysPickups overdue logic)
SELECT
  b.id AS booking_id,
  b.status,
  b.start_date,
  EXISTS (
    SELECT 1 FROM booking_handover_protocols p
    WHERE p.booking_id = b.id AND p.kind = 'PICKUP'
  ) AS has_pickup_protocol,
  EXISTS (
    SELECT 1 FROM booking_handover_protocols p
    WHERE p.booking_id = b.id AND p.kind = 'RETURN'
  ) AS has_return_protocol
FROM bookings b
WHERE b.vehicle_id = '68868291-5478-42cd-b0c4-cc77b2a78e21'
  AND b.status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED');
```

**Completion semantics (code, not a protocol column):**

| Event | Booking.status after | Vehicle.status after |
|-------|----------------------|----------------------|
| PICKUP handover recorded | `ACTIVE` | `RENTED` (unless IN_SERVICE/OUT_OF_SERVICE) |
| RETURN handover recorded | `COMPLETED` | `AVAILABLE` if no other ACTIVE booking |
| No handover | stays `CONFIRMED` | typically stays `AVAILABLE` in DB |

---

## 6. API outputs — recipes and expected shape

Replace `{ORG_ID}` with `organization_id` from V-1 (likely `faa710c9-6d91-4079-a7d5-91fdccdec14a`). Requires authenticated session (Clerk) with org membership.

### 6.1 Fleet map (canonical rental read model)

```http
GET https://app.synqdrive.eu/api/v1/organizations/{ORG_ID}/fleet-map
Authorization: Bearer <clerk_jwt>
```

```bash
# Extract KS FH 660E slice
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://app.synqdrive.eu/api/v1/organizations/$ORG_ID/fleet-map" \
| jq '.[] | select(.id=="68868291-5478-42cd-b0c4-cc77b2a78e21") | {
    id, licensePlate, status,
    reservedBookingId, reservedPickupAt, reservedReturnAt, reservedIsOverdue,
    activeBookingId, activeStartAt, activeReturnAt,
    maintenanceReason, maintenanceReasonCode
  }'
```

| Field | Source in backend |
|-------|-------------------|
| `status` | `deriveFleetStatusContext` → **booking-derived** |
| `reservedBookingId` | `buildBookingContextMap` |
| Redis cache | Key `fleet-map:{orgId}:v1`, TTL **5s** |

**Observed in this trace:** **NOT EXECUTED** (no token).

### 6.2 Vehicle list

```http
GET https://app.synqdrive.eu/api/v1/organizations/{ORG_ID}/vehicles?limit=500
```

Same `mapToVehicleData` derivation as fleet-map for `status` + booking fields (paginated).

**Observed:** **NOT EXECUTED**.

### 6.3 Vehicle detail (org-scoped)

```http
GET https://app.synqdrive.eu/api/v1/organizations/{ORG_ID}/vehicles/68868291-5478-42cd-b0c4-cc77b2a78e21
```

Uses `findOne` → same `deriveFleetStatusContext` path as list item.

**Observed:** **NOT EXECUTED**.

### 6.4 Dashboard / runtime (frontend-only layer)

No dedicated backend “runtime” endpoint. Runtime is built client-side from fleet-map payload:

| Step | Input | Output |
|------|-------|--------|
| `useFleetMapStore.mapFleetVehicle` | API `status`, booking ids | `VehicleData.status` (after `normalizeStatus`) |
| `buildVehicleRuntimeStates` | `VehicleData.status` | `operationalStatus`, `rentalReadiness` |
| `buildDashboardRuntimeModel` | runtime states | KPI slices `ready-to-rent`, `active-rented`, … |

**Observed:** **NOT EXECUTED** (requires browser session + fleet-map response).

### 6.5 Admin / master

```http
GET https://app.synqdrive.eu/api/v1/admin/vehicles/68868291-5478-42cd-b0c4-cc77b2a78e21
Authorization: Bearer <master_admin_jwt>
```

Returns `mapToRegisteredVehicle`: **`status` = raw DB** via `VEHICLE_STATUS_MAP` (not booking-derived); `operationalStatus: ''` placeholder.

**Observed:** **NOT EXECUTED**.

---

## 7. Derivation trace by layer (code replay)

**Trace reference time:** `2026-07-15T20:57:39Z` (production health timestamp)  
**Operator scenario:** One booking **2026-08-01 → 2026-08-06**, status **CONFIRMED**, no PICKUP protocol, `Vehicle.status` **AVAILABLE** (typical).

### 7.1 Layer A — Database raw

| Input | Derived output | Reason / source | Booking ID | Derivation time |
|-------|----------------|-----------------|------------|-----------------|
| `Vehicle.status = AVAILABLE` | (stored) | Default / never handover-rented | — | last `updated_at` (unknown) |
| `Booking.status = CONFIRMED`, `start_date = 2026-08-01`, `end_date = 2026-08-06` | (stored) | Wizard/create path | `?` (unknown) | booking `updated_at` (unknown) |
| No `booking_handover_protocols` PICKUP row | — | Handover not done | — | — |

### 7.2 Layer B — `buildBookingContextMap` (backend read)

| Input | Output field | Value (expected) | Reason |
|-------|--------------|------------------|--------|
| `status IN (PENDING, CONFIRMED)`, `end_date >= now` | `reservedBookingId` | **booking UUID** | Matches OR branch; **no `start_date` filter** |
| `start_date > now` (Aug 1 > Jul 15) | still reserved slot | **included** | **startDate NOT compared to now** for slot assignment |
| `status = ACTIVE` | `activeBookingId` | `null` | CONFIRMED only |
| `start_date < now` | `reservedIsOverdue` | `false` | Only true when `start_date < now` |

**Code reference:** `vehicles.service.ts` — `buildBookingContextMap` lines ~311–318 (query OR), ~425–444 (reserved assignment), ~441–443 (`reservedIsOverdue`).

### 7.3 Layer C — `deriveFleetStatusContext`

| Input | `status` (API string) | Reason |
|-------|----------------------|--------|
| `Vehicle.status = AVAILABLE`, `reservedBookingId` set, not Maintenance | **`Reserved`** | `bookingDerived = 'Reserved'` wins over DB |
| `Vehicle.status = RENTED`, no `activeBookingId` | `Available` + warn | Ghost guard (not this scenario) |

### 7.4 Layer D — API endpoints (fleet-map / vehicles / detail)

| Endpoint | `status` | `reservedBookingId` | Same as Layer C? |
|----------|----------|---------------------|------------------|
| `/fleet-map` | `Reserved` | set | Yes (cached ≤5s) |
| `/vehicles` | `Reserved` | set | Yes |
| `/vehicles/:id` | `Reserved` | set | Yes |
| `/admin/vehicles/:id` | `Available` (if DB AVAILABLE) | **not exposed** | **No — raw DB** |

### 7.5 Layer E — Frontend store (`useFleetMapStore`)

| Input | Output | Notes |
|-------|--------|-------|
| API `status: "Reserved"` | `VehicleData.status = 'Reserved'` | `normalizeStatus` substring match |
| API `reservedBookingId` | preserved | mapped |
| API `reservedReturnAt`, `activeStartAt` | **dropped** | **not in `mapFleetVehicle`** (inventory P0-4) |

### 7.6 Layer F — `deriveFleetVisualState` / Fleet Command tab

| Input | Visual / tab | Notes |
|-------|--------------|-------|
| `status = Reserved`, `reservedBookingId` set | tab **Reserved**, visual `reserved` | `deriveRentalStatus` |
| `status = Reserved`, `reservedBookingId` **null** (mapping bug) | visual **`available`** | Demotion in `deriveRentalStatus` |

### 7.7 Layer G — Dashboard runtime (`vehicleRuntimeStateBuilder`)

| Input | `operationalStatus` | `rentalReadiness` | KPI |
|-------|---------------------|-------------------|-----|
| `VehicleData.status = Reserved` | `reserved` | `not_ready` or `blocked` (health/cleaning) | **Not** in “Ready for Renting”; **not** “Today's Operations” unless `bookingState` from tiles |

---

## 8. Required answers (explicit)

### 8.1 Is raw `Vehicle.status` AVAILABLE, RESERVED, or RENTED?

| Answer | Confidence |
|--------|------------|
| **Not verified live.** For a **CONFIRMED** future booking **without pickup handover**, code path expects **`AVAILABLE`** in DB. | High (code); **live row unconfirmed** |

### 8.2 Which booking causes `reservedBookingId`?

| Answer | Confidence |
|--------|------------|
| The **earliest** open booking with `status IN (PENDING, CONFIRMED)` and `end_date >= now` for this `vehicle_id`. For operator window **1.8.–6.8.**, that booking **would** populate the slot — **exact UUID unknown** without SQL B-1/B-3. | High (logic); **ID unconfirmed** |

If both `2c4cc4cd-…` (Oct) and an Aug booking exist and are CONFIRMED, **earliest `start_date` wins** among reserved candidates (no active booking).

### 8.3 Is `startDate` checked against `now`?

| Gate | `startDate` vs `now`? |
|------|------------------------|
| **Reserved slot assignment** | **No** — only `endDate >= now` |
| **`reservedIsOverdue` flag** | **Yes** — `startDate < now` |
| **Overlap / calendar block** | Interval overlap only — not “pickup day only” |

### 8.4 Which surface shows which status? (expected for scenario)

| Surface | Expected status | Source layer |
|---------|-----------------|--------------|
| Fleet map / fleet list / vehicle detail (rental API) | **Reserved** | B → C → D |
| Fleet Command tab | **Reserved** | `vehicle.status` string |
| Fleet map marker tone | **reserved** (unless health/block overrides) | `deriveFleetVisualState` |
| Dashboard KPI “Ready for Renting” | **not counted as ready** | runtime `operationalStatus !== available` |
| Dashboard KPI “Today's Operations” | **not active rented** (unless pickup/return tiles) | runtime slices |
| Master admin vehicle row | **Available** (if DB AVAILABLE) | raw DB — **diverges** |
| Org stats `reserved` count | **0** (if DB never RESERVED) | raw DB `groupBy` — **diverges** |

### 8.5 Data error or derivation logic?

| Verdict | Evidence |
|---------|----------|
| **Derivation logic** (not a corrupt row), **unless** live SQL disproves assumptions | If live data matches: CONFIRMED + future `end_date` + no ACTIVE → Reserved is **mandated** by `buildBookingContextMap` since V4.6.70 |
| **Possible data anomalies to rule out with SQL** | Wrong `booking.status` (ACTIVE without handover); stale `Vehicle.status = RENTED` without ACTIVE booking (ghost); workflow wrote `RESERVED`; second overlapping booking |

### 8.6 Missing evidence (blocked in this environment)

1. Live `vehicles` row: `status`, `organization_id`, `updated_at`
2. Live `bookings` rows for Aug 2026 window (id, status, dates)
3. Live `booking_handover_protocols` rows
4. Authenticated API JSON for fleet-map / vehicles / detail at trace time
5. Browser runtime state snapshot (`operationalStatus`, `rentalReadiness`)
6. Confirmation whether Aug booking is the **only** open CONFIRMED booking or competes with Oct E2E booking `2c4cc4cd-…`
7. Org timezone for pickup-day interpretation (`resolveOrgTimezone`, default `Europe/Berlin`)

---

## 9. Decision tree (operator checklist)

```
Live: SELECT status FROM vehicles WHERE id = '68868291-…'
│
├─ IN_SERVICE / OUT_OF_SERVICE → Fleet UI: Maintenance (booking ctx dropped)
│
└─ AVAILABLE | RENTED | RESERVED
   │
   Live: B-3 fleet_derivation_slot
   │
   ├─ ACTIVE booking → API status: Active Rented, activeBookingId set
   │
   ├─ CONFIRMED/PENDING, end_date >= now, no ACTIVE
   │     → API status: Reserved, reservedBookingId set
   │     → start_date in future? STILL Reserved (no startDate gate)
   │
   └─ no matching booking → API status: Available (or ghost demotion if DB RENTED/RESERVED)
```

---

## 10. Comparison: operator report vs E2E doc booking

| Aspect | Operator (Aug 1–6) | E2E report (Oct 1–6) |
|--------|--------------------|----------------------|
| Booking ID | Unknown | `2c4cc4cd-2076-4650-a146-92d8c2e8ca56` |
| Vehicle | Same KS FH 660E | Same |
| At 2026-07-15 | Would show **Reserved** if CONFIRMED | Would **also** show **Reserved** if CONFIRMED |
| Earliest wins | If both exist, **Aug booking** gets `reservedBookingId` | Would only win if no earlier CONFIRMED booking |

---

## 11. Next step (Prompt 3+)

Run SQL **V-1, B-1, B-3, H-1** on production read-only + one authenticated `fleet-map` jq extract. Paste results into section 3–6 “Observed” tables to convert this trace from **code replay** to **evidence-backed**.

---

## Changes / Architektur

| Document | Updated |
|----------|---------|
| `docs/audits/vehicle-status-ks-fh-660e-trace.md` | **Created** (this file) |
| `ChangesView` / `ArchitekturView` | Not updated (read-only trace prompt) |

---

*End of Prompt 2/43 trace.*
