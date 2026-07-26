# Master Admin Remediation — Phase 2E.2: DIMO Vehicle Integrity

**Date:** 2026-07-26  
**Status:** Analysis complete — **no code changes** in this phase  
**Scope:** Full DIMO integration integrity audit — identity, binding, import, sync, disconnect, reconnect  
**Prerequisites:** [2E.1 Tenant Boundary Validation](./tenant-boundary-validation.md) (separate branch)  
**DIMO MCP:** Unavailable in Cloud Agent runtime — analysis based on codebase + Prisma schema

---

## Executive summary

| Area | Verdict | Notes |
|------|---------|-------|
| **`dimo_vehicles` identity** | Strong | `external_id` + `token_id` globally unique |
| **`vehicles.dimo_vehicle_id` binding** | **Weak** | No unique constraint — duplicate org bindings possible |
| **`registerFromDimo`** | **Gap** | No check that DIMO vehicle is already registered |
| **Webhook / worker resolution** | **Ambiguous** | `findFirst` by `tokenId` — non-deterministic if duplicates exist |
| **Import / sync** | Good | Identity API → upsert by `externalId`; token-centric |
| **Disconnect** | Partial | Device OBD events tracked; `connectionStatus` rarely updated post-sync |
| **Reconnect** | By design | Deregister preserves `DimoVehicle`; re-register to any org |
| **Cross-org invariant** | **Not enforced** | Same DIMO token can be bound to multiple orgs simultaneously |

**Core finding:** The platform correctly models DIMO as a **global provider mirror** (`dimo_vehicles`) separate from **tenant vehicles** (`vehicles`). The binding layer (`vehicles.dimo_vehicle_id`) lacks DB and application enforcement of **1 DIMO vehicle → 1 active org registration**.

**Recommendation:** Phase **2E.3 — DIMO Integrity Remediation** — add unique partial index, registration guard, webhook ambiguity detection, deregister hardening.

---

## 1. Terminology and data model

### 1.1 Entity roles

| Entity / column | Role | Org-scoped? |
|-----------------|------|-------------|
| `dimo_vehicles` (`DimoVehicle`) | Platform mirror of DIMO Identity NFT / token | **No** — global |
| `dimo_vehicles.external_id` | DIMO identity key (sync uses `String(tokenId)`) | Global unique |
| `dimo_vehicles.token_id` | DIMO vehicle JWT / telemetry token | Global unique (nullable) |
| `vehicles.dimo_vehicle_id` | FK: SynqDrive vehicle → DIMO mirror | **Binding** to org via `vehicles.organization_id` |
| `vehicle_latest_states.dimo_token_id` | Denormalized copy for polling | Per-vehicle (1:1 with vehicle) |
| `vehicle_provider_consents` | Consent ledger for DIMO access | Per vehicle + org |
| `device_connection_webhook_inbox` | OBD plug/unplug events | Resolved to vehicle + org at processing |

### 1.2 Relationship diagram

```
DIMO Identity API (privileged vehicles)
        │
        ▼
┌───────────────────┐
│   dimo_vehicles   │  ← global mirror (1 row per DIMO token)
│  external_id (UQ) │
│  token_id (UQ)    │
└─────────┬─────────┘
          │ 0..1 (FK vehicles.dimo_vehicle_id)
          │ ⚠ NO UNIQUE on vehicles side → 0..N possible today
          ▼
┌───────────────────┐
│     vehicles      │  ← tenant-scoped (organization_id)
│  organization_id  │
│  dimo_vehicle_id  │
└─────────┬─────────┘
          │ 1:1
          ▼
┌───────────────────┐
│ vehicle_latest_   │
│ states.dimo_token │
└───────────────────┘
```

### 1.3 Comparison with High Mobility

| Aspect | DIMO | High Mobility |
|--------|------|---------------|
| Provider record org | No (`DimoVehicle` global) | Yes (`HighMobilityVehicle.organizationId`) |
| Link to SynqDrive vehicle | `vehicles.dimo_vehicle_id` | `synqdriveVehicleId` on HM record |
| Already-linked guard | **None** in `registerFromDimo` | `ConflictException` in `registerHmOnlyVehicle` |
| `VehicleDataSourceLink` | **Not created** on DIMO register | Created on HM link |
| Registration state machine | Implicit (registered = vehicle exists) | `HmRegistrationState` enum |

---

## 2. Schema constraints audit

### 2.1 `dimo_vehicles`

```3144:3168:backend/prisma/schema.prisma
model DimoVehicle {
  id               String               @id @default(uuid())
  externalId       String               @unique @map("external_id")
  tokenId          Int?                 @unique @map("token_id")
  // ...
  registeredVehicles Vehicle[]
  @@index([vin])
  @@index([connectionStatus])
  @@map("dimo_vehicles")
}
```

| Constraint | Present? | Assessment |
|------------|----------|------------|
| `external_id` UNIQUE | Yes | Prevents duplicate mirror rows per external key |
| `token_id` UNIQUE | Yes | Prevents duplicate mirror rows per DIMO token |
| `organization_id` | **No** | Correct — mirror is platform-global |
| Reverse relation `registeredVehicles` | One-to-many | **Allows multiple vehicles per DimoVehicle** |

### 2.2 `vehicles.dimo_vehicle_id`

```2775:2843:backend/prisma/schema.prisma
  dimoVehicleId                     String?           @map("dimo_vehicle_id")
  // ...
  dimoVehicle                            DimoVehicle?                            @relation(fields: [dimoVehicleId], references: [id], onDelete: SetNull)
```

| Constraint | Present? | Assessment |
|------------|----------|------------|
| FK to `dimo_vehicles` | Yes | `ON DELETE SET NULL` |
| **UNIQUE on `dimo_vehicle_id`** | **No** | **P1 gap — multiple vehicles can share same DIMO binding** |
| Partial unique (non-null only) | **No** | Recommended remediation |

**Migration evidence** (`20260311224040_init`):

```sql
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_dimo_vehicle_id_fkey"
  FOREIGN KEY ("dimo_vehicle_id") REFERENCES "dimo_vehicles"("id") ON DELETE SET NULL;
-- No UNIQUE INDEX on vehicles.dimo_vehicle_id
```

### 2.3 `vehicle_latest_states.dimo_token_id`

- `vehicle_id` is `@unique` — one VLS row per vehicle.
- `dimo_token_id` has **no unique constraint** — correct (token is attribute, not identity).
- Risk: if two vehicles share same token via duplicate binding, both VLS rows carry same `dimo_token_id`.

---

## 3. Import logic

### 3.1 Identity API sync (primary import)

**Files:** `dimo-api-sync.service.ts`, `dimo-vehicle-sync.service.ts`

**Flow:**

1. GraphQL `vehicles(filterBy: { privileged: $clientId })` — paginated (100/page).
2. Map each node → `DimoVehicleInput` with `externalId: String(tokenId)`.
3. Enrich CONNECTED vehicles via telemetry API (odometer, VIN, battery, fuel).
4. `dimoVehicle.upsert({ where: { externalId } })` — create or update mirror row.

| Check | Result |
|-------|--------|
| Duplicate `external_id` | Prevented by upsert key |
| Duplicate `token_id` | Prevented by unique index (upsert updates same row if externalId matches) |
| `definition.id` vs `tokenId` as external key | **Uses `tokenId` only** — consistent |
| Org assignment at import | **None** — mirror is org-agnostic (correct) |
| Pagination limit | 100 per page with cursor — handles large fleets |

### 3.2 Manual admin sync

**Endpoint:** `POST /api/v1/admin/dimo/sync` (`dimo.controller.ts`, `MASTER_ADMIN`)

- Accepts optional `body.dimoVehicles[]` for manual push.
- Otherwise calls `fetchAndSyncFromDimoApi()`.
- Same upsert semantics — no org binding at sync time.

### 3.3 Scheduled sync

**File:** `dimo-vehicle-sync.scheduler.ts`

- BullMQ repeat job every **24 hours**.
- Processor: `DimoVehicleSyncProcessor` → `fetchAndSyncFromDimoApi()`.
- Logs to `dimo_poll_logs` with `jobType: VEHICLE_SYNC`.

### 3.4 Registration from DIMO (tenant binding)

**Endpoint:** `POST /api/v1/organizations/:orgId/vehicles/register-from-dimo`  
**Guard:** `OrgScopingGuard` + `PermissionsGuard` (`fleet:write`)

```2070:2147:backend/src/modules/vehicles/vehicles.service.ts
  async registerFromDimo(orgId, stationId, dimoVehicleId, ...) {
    const dimoVehicle = await this.prisma.dimoVehicle.findUniqueOrThrow({
      where: { id: dimoVehicleId },
    });
    // ⚠ NO check: is dimoVehicleId already linked to another vehicle?
    const vehicle = await this.prisma.vehicle.create({
      data: {
        organization: { connect: { id: orgId } },
        dimoVehicle: { connect: { id: dimoVehicleId } },
        // ...
      },
    });
```

| Check | Present? | Risk |
|-------|----------|------|
| DimoVehicle exists | Yes (`findUniqueOrThrow`) | — |
| DimoVehicle not already registered | **No** | **P1 — cross-org duplicate binding** |
| VIN uniqueness per org | Not in this method | Separate concern |
| Creates `VehicleDataSourceLink` | **No** | P2 — snapshot processor expects link optionally |
| Records consent | Yes (`recordDimoConsent`, `DIMO_DIRECT`) | Good |
| Syncs data authorization | Yes (`ensureDimoTelemetryAuthorization`) | Good |

### 3.5 UI filter (non-enforcement)

`getNonRegisteredVehicles()` filters out `dimoVehicleId` values already present on any vehicle — **UI convenience only**. Direct API call bypasses this filter.

---

## 4. Synchronisation (ongoing)

### 4.1 Snapshot polling

**Scheduler:** `dimo-snapshot.scheduler.ts` (30s interval)  
**Processor:** `dimo-snapshot.processor.ts`

| Step | Behavior |
|------|----------|
| Vehicle selection | `dimoVehicleId NOT NULL`, status AVAILABLE/RENTED, `connectionStatus=CONNECTED`, `tokenId NOT NULL` |
| Job data | `{ vehicleId, dimoTokenId }` — org resolved from vehicle row |
| JWT | `dimoAuth.getVehicleJwt(dimoTokenId)` |
| VLS upsert | Writes `dimo_token_id`, telemetry fields, provenance |
| ClickHouse mirror | Optional async insert with `organizationId` |

**Integrity note:** Scheduler iterates **all** DIMO-connected vehicles fleet-wide. Each job is scoped by `vehicleId` — safe unless duplicate vehicles share same token (then duplicate polling waste + ambiguous data).

### 4.2 Vehicle metadata sync

- 24h Identity API sync updates `dimo_vehicles` mirror fields.
- `connectionStatus` set at sync from `aftermarketDevice || syntheticDevice` presence.
- **Not updated** on OBD unplug or org deregister — stale `CONNECTED` possible.

### 4.3 DTC polling

**Scheduler:** `dimo-dtc.scheduler.ts`  
**Processor:** `dimo-dtc.processor.ts` — per-vehicle, token from `dimoVehicle.tokenId`.

### 4.4 Triggers bootstrap

**Service:** `dimo-triggers-bootstrap.service.ts`  
- Selects vehicles with `dimoVehicleId NOT NULL` for webhook trigger registration.

---

## 5. Disconnect and reconnect

### 5.1 Physical disconnect (OBD unplug)

**Path:** DIMO webhook → `device-connection-webhook-inbox` → `DeviceConnectionWebhookProcessor`

| Step | Resolution |
|------|------------|
| Webhook auth | Verification token / optional HMAC |
| Token extraction | `payload.tokenId` |
| Vehicle lookup | `findVehicleByTokenId(tokenId)` → `vehicle.findFirst({ dimoVehicle: { tokenId } })` |
| Org stamp | `organizationId` from resolved vehicle |
| Domain | `DeviceConnectionWebhookService` — plug state machine, episode resolution |

**Disconnect semantics:** OBD unplug events update connectivity episodes and may emit `DEVICE_UNPLUGGED` notifications. They do **not** clear `vehicles.dimo_vehicle_id` or `dimo_vehicles.connectionStatus`.

### 5.2 Platform disconnect (deregister)

**Endpoint:** `POST /api/v1/admin/vehicles/:vehicleId/deregister`  
**Service:** `vehicles.service.deregister()`

| Behavior | Detail |
|----------|--------|
| Deletes `vehicles` row | Cascades operational data |
| Preserves `dimo_vehicles` | FK `ON DELETE SET NULL` from vehicle side (vehicle deleted, mirror remains) |
| DIMO re-available | Appears in `getNonRegisteredVehicles()` |
| Revokes consent | **No** — `revokeByProvider` not called |
| Deactivates triggers | **Not explicit** in deregister |
| Guard | `RolesGuard` on controller — **no `@Roles` decorator** → any authenticated user (P1, see R6) |

### 5.3 Reconnect

**Intended flow:**

1. Org A deregisters vehicle → `DimoVehicle` mirror preserved.
2. Org B (or A) calls `registerFromDimo` with same `dimoVehicleId`.
3. New `vehicles` row created with new `organizationId`.

**Gap:** Steps 1–3 work even if Org A **did not** deregister — Org B can register same DIMO vehicle in parallel (P1).

### 5.4 Integration disconnect (org-level)

`integrations.service.disconnect()` — disconnects `OrganizationIntegration` records (e.g. WhatsApp), **not** DIMO vehicle bindings.

---

## 6. Cross-org invariant validation

### 6.1 Required invariant

> **A DIMO vehicle (token) must never belong to more than one organization simultaneously.**

### 6.2 Enforcement layers today

| Layer | Enforces invariant? |
|-------|---------------------|
| DIMO Identity API | Privilege is developer-license scoped, not SynqDrive-org scoped |
| `dimo_vehicles` unique indexes | One mirror row per token — **does not bind org** |
| `vehicles.dimo_vehicle_id` unique | **Missing** |
| `registerFromDimo` pre-check | **Missing** |
| `getNonRegisteredVehicles` | UI filter only |
| Webhook `findFirst` | Picks arbitrary vehicle if duplicates |
| Snapshot scheduler | Polls **all** bindings — duplicate waste |

### 6.3 Failure scenarios

| Scenario | Possible today? | Impact |
|----------|-----------------|--------|
| Org A + Org B register same `dimoVehicleId` | **Yes** | Telemetry, trips, webhooks ambiguous |
| Same org registers same DIMO twice | **Yes** | Duplicate fleet entries, double billing risk |
| Re-register after deregister to different org | **Yes (by design)** | Acceptable if prior deregistered |
| Re-register while prior binding exists | **Yes** | **Violation** |
| Admin manual sync creates duplicate mirror | **No** | Upsert prevents |
| Race: two concurrent `registerFromDimo` | **Yes** | Both may succeed without transaction lock |

---

## 7. Reference resolution paths

All paths resolve DIMO token → SynqDrive vehicle via `dimoVehicle.tokenId`:

| Consumer | Query pattern | Ambiguity risk |
|----------|---------------|----------------|
| `dimo-webhook.controller.ts` | `findFirst({ dimoVehicle: { tokenId } })` | **P1** if duplicates |
| `device-connection-webhook-inbox.repository.ts` | Same | **P1** |
| `dimo-snapshot.scheduler.ts` | `findMany` all linked vehicles | Polls all duplicates |
| `data-authorizations.service.ts` | `dimoVehicleId: { not: null }` per org | OK at org level |
| `vehicle-specs.controller.ts` | Public — resolves DimoVehicle by id/token | Metadata only, no tenant data leak |

---

## 8. Consent and authorization

| Component | Behavior |
|-----------|----------|
| `VehicleProviderConsentService.recordDimoConsent` | Creates `DIMO_DIRECT` grant on register |
| `revokeByProvider` | Exists but **not called** on deregister |
| `data-authorizations` | `DIMO_TELEMETRY` system authorization scoped to org's connected vehicles |
| `DIMO_OAUTH` grant type | Defined in schema — **not used** in code (always `DIMO_DIRECT`) |

**Gap (P2):** Stale ACTIVE consent records after deregister — consent history diverges from fleet state.

---

## 9. Risk register

| ID | Severity | Finding | Location | Remediation |
|----|----------|---------|----------|-------------|
| **D1** | **P1** | No UNIQUE on `vehicles.dimo_vehicle_id` — multiple vehicles can bind same DIMO | `schema.prisma`, init migration | Partial unique index `WHERE dimo_vehicle_id IS NOT NULL` |
| **D2** | **P1** | `registerFromDimo` lacks already-registered check | `vehicles.service.ts` | `findFirst({ dimoVehicleId })` → `ConflictException` |
| **D3** | **P1** | Webhook/token resolution uses `findFirst` — non-deterministic with duplicates | `dimo-webhook.controller.ts`, `device-connection-webhook-inbox.repository.ts` | Enforce D1/D2; add duplicate detection metric |
| **D4** | **P1** | Concurrent register race — no serializable transaction | `registerFromDimo` | DB unique constraint + retry handling |
| **D5** | P2 | No `VehicleDataSourceLink` on DIMO register (unlike HM) | `registerFromDimo` | Create DIMO link row for provenance |
| **D6** | P2 | `deregister` does not revoke DIMO consent | `vehicles.service.deregister` | Call `revokeByProvider({ provider: 'DIMO' })` |
| **D7** | P2 | `dimo_vehicles.connectionStatus` stale after OBD unplug | Sync-only update | Update from device-connection events |
| **D8** | P2 | `DIMO_OAUTH` grant type unused | `vehicle-provider-consent.service.ts` | Implement or remove enum value |
| **D9** | P2 | `externalId = String(tokenId)` — if DIMO adds non-token external IDs, mapping may break | `dimo-api-sync.service.ts` | Document + prefer `definition.id` if available |
| **D10** | P2 | HM has `synqdriveVehicleId` back-link; DIMO mirror has no `registeredVehicleId` | Schema design | Optional denormalized link for admin visibility |
| **D11** | **P1** | `deregister` endpoint missing `@Roles('MASTER_ADMIN')` | `vehicles.controller.ts:417` | Add role decorator |
| **D12** | P3 | Public `vehicle-specs` endpoints resolve DimoVehicle without org | `vehicle-specs.controller.ts` | Accept — metadata only, public by design |

### Severity definitions

| Level | Meaning |
|-------|---------|
| **P0** | Active cross-org data corruption or unauthorized fleet mutation |
| **P1** | Invariant violable or ambiguous resolution under normal operations |
| **P2** | Design debt, stale state, or incomplete lifecycle |
| **P3** | Acceptable or low-impact |

**No P0** confirmed in static analysis — D11 approaches P0 if exploited (any user deregistering any vehicle).

---

## 10. Duplicate detection queries (operator audit)

Run on production PostgreSQL (read-only):

```sql
-- D1: Multiple vehicles sharing same dimo_vehicle_id
SELECT dimo_vehicle_id, COUNT(*) AS vehicle_count,
       array_agg(id) AS vehicle_ids,
       array_agg(organization_id) AS org_ids
FROM vehicles
WHERE dimo_vehicle_id IS NOT NULL
GROUP BY dimo_vehicle_id
HAVING COUNT(*) > 1;

-- Token collision across vehicles (via join)
SELECT dv.token_id, COUNT(v.id) AS vehicle_count,
       array_agg(v.organization_id) AS org_ids
FROM dimo_vehicles dv
JOIN vehicles v ON v.dimo_vehicle_id = dv.id
WHERE dv.token_id IS NOT NULL
GROUP BY dv.token_id
HAVING COUNT(v.id) > 1;

-- Orphan mirrors (no vehicle binding) — expected for unregistered fleet
SELECT dv.id, dv.token_id, dv.vin, dv.connection_status
FROM dimo_vehicles dv
LEFT JOIN vehicles v ON v.dimo_vehicle_id = dv.id
WHERE v.id IS NULL;

-- Stale consent after deregister (vehicles deleted but consent ACTIVE)
SELECT vpc.id, vpc.vehicle_id, vpc.organization_id, vpc.status
FROM vehicle_provider_consents vpc
LEFT JOIN vehicles v ON v.id = vpc.vehicle_id
WHERE vpc.provider = 'DIMO'
  AND vpc.status = 'ACTIVE'
  AND v.id IS NULL;
```

---

## 11. Recommendations for Phase 2E.3

### Immediate (P1)

1. **D1:** Add migration — `CREATE UNIQUE INDEX ... ON vehicles (dimo_vehicle_id) WHERE dimo_vehicle_id IS NOT NULL`.
2. **D2 + D4:** Guard in `registerFromDimo` before create; handle unique violation gracefully.
3. **D3:** After D1, add assertion/logging if `findFirst` ever returns ambiguous (defensive).
4. **D11:** Add `@Roles('MASTER_ADMIN')` to deregister endpoint.

### Short-term (P2)

5. **D5:** Create `VehicleDataSourceLink` on DIMO registration (parity with HM).
6. **D6:** Revoke DIMO consent on deregister.
7. **D7:** Propagate OBD disconnect to `dimo_vehicles.connectionStatus` or document as derived-only.
8. Operator script: `vps-dimo-vehicle-integrity-audit.sh` wrapping SQL above.

### Long-term (P3)

9. **D10:** Optional `DimoVehicle.registeredVehicleId` or materialized view for admin dashboard.
10. **D8:** OAuth flow implementation if product requires `DIMO_OAUTH` grant type.

---

## 12. File inventory

| Area | Key files |
|------|-----------|
| Schema | `backend/prisma/schema.prisma` (`DimoVehicle`, `Vehicle`, `VehicleLatestState`) |
| Import / sync | `dimo-api-sync.service.ts`, `dimo-vehicle-sync.service.ts`, `dimo-vehicle-sync.processor.ts` |
| Admin API | `dimo.controller.ts` |
| Registration | `vehicles.service.ts` (`registerFromDimo`, `deregister`), `vehicles.controller.ts` |
| Polling | `dimo-snapshot.scheduler.ts`, `dimo-snapshot.processor.ts` |
| Auth / JWT | `dimo-auth.service.ts` |
| Webhooks | `dimo-webhook.controller.ts`, `device-connection-webhook-*.ts` |
| Consent | `vehicle-provider-consent.service.ts` |
| Data auth | `data-authorizations.service.ts` |
| Connectivity | `device-connection-query.service.ts`, `fleet-connectivity.util.ts` |

---

## 13. Verdict

| Question | Answer |
|----------|--------|
| Can a DIMO vehicle belong to multiple orgs simultaneously? | **Yes — today, via missing unique constraint and registration guard** |
| Is `dimo_vehicles` identity sound? | **Yes** — `external_id` + `token_id` unique |
| Is import/sync sound? | **Yes** — upsert-by-external-id, paginated Identity API |
| Is disconnect/reconnect lifecycle complete? | **Partial** — deregister works; consent/trigger cleanup incomplete |
| Are webhooks safe with current binding? | **Yes if 1:1 binding holds** — breaks under D1/D2 violation |

**Phase 2E.2 status:** Analysis complete. Ready for **Phase 2E.3 — DIMO Integrity Remediation**.

---

*Generated by Master Admin Remediation Phase 2E.2. No runtime or schema changes applied. DIMO MCP unavailable — verify Identity API field semantics against DIMO console when MCP is restored.*
