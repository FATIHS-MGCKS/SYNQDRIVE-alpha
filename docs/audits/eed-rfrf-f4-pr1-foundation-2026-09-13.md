# EED RFRF F4-PR1 — Foundation implementation audit

**Date:** 2026-09-13  
**Phase:** F4-PR1 only (schema + flags + capability/trust resolvers)  
**Predecessor:** PR #1628 merged (`ca16ca034809a9bad2c47a0f06f3b908f83bfaf9`)  
**Canonical boundary:** `docs/audits/eed-rfrf-f4-scope-and-runtime-boundary-2026-09-13.md` (EED-DEC-RFRF-006, EED-EV-0045)

---

## 1. Base and head SHAs

| Field | Value |
|-------|-------|
| **BASE_MAIN_SHA** | `ca16ca034809a9bad2c47a0f06f3b908f83bfaf9` (PR #1628 merge) |
| **Branch base includes** | `defe85a91` — ci(vehicle-detail): backend typecheck heap (#1629) |
| **Branch** | `cursor/eed-rfrf-f4-pr1-foundation-f21f` |
| **FINAL_HEAD** | _(set at commit — see PR)_ |

---

## 2. Scope delivered (F4-PR1)

| Item | Status |
|------|--------|
| VehicleEnergyEvent `detectionSource` enum + column | YES |
| VehicleEnergyEvent `sourceEventKey` column | YES |
| `@@unique([vehicleId, sourceEventKey])` (PostgreSQL NULL-safe) | YES |
| Additive forward-only migration | YES |
| Runtime flag/config reader (fail-closed) | YES |
| `RawFuelCapabilityResolver` | YES |
| `RawFuelSignalTrustResolver` | YES |
| Source semantics contract (types/docs) | YES |

---

## 3. Explicit non-actions (verified)

| Gate | Result |
|------|--------|
| `detectRawFuelRises()` wired in `detectEnergyEvents()` | NO |
| `RawRefuelCandidateService` from live detect path | NO |
| Fallback `VehicleEnergyEvent` creation | NO |
| F5 convergence / promotion execution | NO |
| Production deploy | NO |
| Production mutation | NO |
| Feature flags enabled in repo/env | NO |
| Historical VEE backfill | NO |
| F4-PR2 started | NO |

---

## 4. Schema changes

### Enum `VehicleEnergyEventDetectionSource`

- `DIMO_NATIVE` — future explicit native writes (F6+ deploy hygiene)
- `SYNQDRIVE_RAW_FUEL_FALLBACK` — future authorized fallback promotion (F5+)

### Columns on `vehicle_energy_events`

| Column | Type | Nullable | Semantics |
|--------|------|----------|-----------|
| `detection_source` | enum | YES | NULL = legacy native-era; never means fallback |
| `source_event_key` | VARCHAR(512) | YES | NULL for legacy/native; fallback = `candidateIdentityKey` (F5+) |

### Uniqueness

Prisma `@@unique([vehicleId, sourceEventKey])` → PostgreSQL unique index on `(vehicle_id, source_event_key)`.

PostgreSQL treats NULL as distinct in unique indexes → **multiple legacy rows with NULL `source_event_key` per vehicle remain valid**.

Non-null duplicate `(vehicle_id, source_event_key)` rejected.

Same `source_event_key` on different vehicles allowed (vehicle-scoped identity).

---

## 5. Migration

**Path:** `backend/prisma/migrations/20260913120000_rfrf_f4_pr1_vehicle_energy_event_source_identity/migration.sql`

- Additive only: enum create, two nullable columns, index on `detection_source`, unique index
- No backfill, no table rewrite, no destructive alter

### Proof status

| Gate | Result |
|------|--------|
| **F4_PR1_MIGRATION_SQL_REAL_POSTGRES** | PASS — `backend/scripts/ops/prove-rfrf-f4-pr1-migration-sql.sh` against pre-F4 baseline `ca16ca034` |
| **FULL_REPOSITORY_MIGRATION_CHAIN** | PASS on gate DB (339 migrations including F4-PR1) |

---

## 6. Feature flag / config reader

**Module:** `backend/src/config/raw-fuel-refuel-fallback.config.ts`

| Env | Semantics | Default |
|-----|-----------|---------|
| `RAW_FUEL_REFUEL_FALLBACK_ENABLED` | Master raw scan gate | false |
| `RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED` | F2 staging only — **never VEE promotion** | false |
| `RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT` | Parsed ISO; F4 does not filter evidence by cutover | null |

Malformed boolean → fail closed (false). Persist flag independent of master. `canRawFuelRefuelFallbackAuthorizeVehicleEnergyEventPromotion()` is structurally `false`.

---

## 7. Capability resolver

**Module:** `raw-fuel-capability.resolver.ts`

Authority: `Vehicle.fuelType` (required enum); optional DIMO `powertrainType` / `fuelType` strings for contradiction detection only.

| Input | Output |
|-------|--------|
| `ELECTRIC` | `NON_FUEL_CAPABLE` |
| `GASOLINE`, `DIESEL`, `HYBRID`, `PLUGIN_HYBRID` | `FUEL_CAPABLE` |
| `OTHER`, missing, contradictory metadata | `UNKNOWN` (fail closed) |

No inference from samples, segments, fleet IDs, or org hardcoding.

---

## 8. Signal trust resolver

**Module:** `raw-fuel-signal-trust.resolver.ts`

| Axis | F4-PR1 behavior |
|------|-----------------|
| `absoluteSignalTrust` | Always `UNKNOWN` — `ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE = false` |
| `relativeSignalAvailable` | Semantically valid relative % in scan window (0–100, finite) |

Does **not** derive TRUSTED from `fuelType` or sample presence alone.

---

## 9. Source semantics contract

Documented in `raw-fuel-refuel-fallback.types.ts` → `VEHICLE_ENERGY_EVENT_SOURCE_SEMANTICS`:

| Row class | detectionSource | sourceEventKey |
|-----------|-----------------|----------------|
| Legacy pre-migration | NULL | NULL |
| New native (post deploy) | DIMO_NATIVE | NULL |
| Fallback promotion (F5+) | SYNQDRIVE_RAW_FUEL_FALLBACK | candidateIdentityKey |

No runtime writes in F4-PR1.

---

## 10. Tests executed

| Suite | Result |
|-------|--------|
| `raw-fuel-refuel-fallback.config.spec.ts` | PASS |
| `raw-fuel-capability.resolver.spec.ts` | PASS |
| `raw-fuel-signal-trust.resolver.spec.ts` | PASS |
| F2 `raw-refuel-candidate*` (13 suites) | PASS |
| F3 `raw-fuel-rise-detector*` (13 suites) | PASS |
| `prisma validate` / `prisma generate` | PASS |
| `npm run build` | PASS |

---

## 11. Known limitations

- Absolute signal trust authority not yet available fleet-wide — fail closed by design.
- Synthetic `dimoSegmentId` fallback compatibility remains F5-owned / NOT_PROVEN.
- Full migration chain may fail on environments with pre-RFRF historical defect; F4-PR1 proof uses isolated pre-F4 baseline + single migration SQL.
- F4-PR2 (dark runtime wiring) not started.

---

## 12. Governance

- EED-EV-0046 added (this audit + implementation evidence)
- EED-DEC-RFRF-006 promoted **PROPOSED → VALIDATED** (human approval via PR #1628 merge)
- SynqDrive Code → Changes / Architektur updated

---

## ARCHITECTURE_GOVERNANCE

```
ARCHITECTURE_GOVERNANCE
- substantive_change: YES
- affected_modules: Energy Event Detection (EED)
- authority_updates: EED KG evidence EED-EV-0046; DEC-RFRF-006 VALIDATED; changelog; this audit
- registry_review:
 - module: Energy Event Detection (EED)
 result: UNCHANGED
 registry_status_before: AUTHORITY_ACTIVE
 registry_status_after: AUTHORITY_ACTIVE
 reason: F4-PR1 foundation implementation; no registry metadata field changes
- cross_module_authorities_reviewed: none (EED-only substrate)
- authority_validators: EED graph validator PASS
- central_registry_validator: PASS
- SynqDrive Code → Changes: entry eed-rfrf-f4-pr1-foundation-2026-09-13
- SynqDrive Code → Architektur: RFRF F4-PR1 foundation row
```
