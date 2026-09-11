# Vehicle & Device Connectivity — Current State (Bootstrap, `AUDIT_IN_PROGRESS`)

| Field | Value |
|-------|-------|
| **Authority status** | `AUDIT_IN_PROGRESS` — **not** `AUTHORITY_ACTIVE` |
| **Repository baseline** | `origin/main` @ `adef555430eee7d53e0b3e90c4154ec5fdcd18ad` (bootstrap timestamp) |
| **Production baseline** | **Not established in Phase 0** — see [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md) |
| **Last updated** | 2026-09-11 |

## Executive summary

SynqDrive already contains **substantial connectivity-related code** spread across Vehicles, DIMO Integration, AI telemetry semantics, and rental operational projection layers. There is **no single module authority** for provider-neutral connectivity semantics until this bootstrap.

This document records **bounded discovery** only. It does **not** claim complete current-state reconstruction.

## Proposed ownership vs discovered code (preliminary)

| Concern | Proposed VDC owner | Currently implemented in (discovered) | Notes |
|---------|--------------------|--------------------------------------|-------|
| Connectivity runtime state projection | VDC | `backend/src/modules/vehicles/connectivity/**` | Domain builders, diagnostic state, legacy projection |
| Telemetry freshness / standby | VDC | `telemetry-freshness.resolver.ts`, `vehicle-state-interpreter.ts` | 15 min–24 h standby window documented in AI mapper |
| Fleet connectivity API | VDC consumes / Vehicles presents | `fleet-connectivity*.ts`, `vehicles.controller.ts` | Boundary with Vehicles TBD in full audit |
| DIMO `connectionStatus` mirror | DIMO owns field; VDC owns semantics | `dimo_vehicles.connection_status`, sync services | |
| `sourceTimestamp` / monotonic guard | VDC semantics; DIMO ingest | `vls-monotonic-merge.util.ts`, `dimo-snapshot.processor.ts` | Stale poll ≠ new source |
| Device connection episodes | DIMO owns persistence; VDC interprets | `device-connection-episode*`, webhook inbox | |
| Connectivity alerts | VDC policy semantics; DIMO implements | `connectivity-alert/*` under dimo module | **Potential boundary tension** — see VDC-CX-001 |
| Snapshot wake | Trip Detection | `backend/src/workers/snapshot-wake/**` | Not connectivity lifecycle |
| OBD plug evidence | VDC evidence class | `obdIsPluggedIn` in snapshot payload, episode resolution | |
| Physical device state (plugged, power, sleep/wake) | VDC | `physical-device-evidence*`, episode resolution | Provider-neutral interpretation only |
| Device heartbeat / periodic records | VDC | DIMO snapshot ingest, LTE_R1 profiles | DIMO Integration owns ingest |
| Hardware fault classification | VDC | `interruption-knowledge.ts`, diagnostic state | Hardware vs provider vs vehicle |

## Discovered repository surfaces (index — FULL AUDIT PENDING)

### Backend — vehicles / connectivity projection

- `backend/src/modules/vehicles/connectivity/domain/*` — provider link state, diagnostic state, physical device evidence, runtime state builder
- `backend/src/modules/vehicles/connectivity/vehicle-connectivity-runtime-*.ts`
- `backend/src/modules/vehicles/telemetry-freshness.resolver.ts`
- `backend/src/modules/vehicles/vehicle-state-interpreter.ts`
- `backend/src/modules/vehicles/fleet-connectivity*.ts`
- `backend/src/modules/vehicles/vehicles-operational.service.ts`
- `backend/src/modules/vehicles/connectivity-state-regression.spec.ts`

### Backend — DIMO (provider; VDC consumer)

- `backend/src/modules/dimo/connectivity-alert/*`
- `backend/src/modules/dimo/device-connection-*` (episodes, webhook inbox, read model)
- `backend/src/modules/dimo/dimo-connectivity-lifecycle-di.module.ts`
- `backend/src/modules/dimo/interruption-knowledge.ts`
- `backend/src/modules/dimo/vls-monotonic-merge.util.ts`
- `backend/src/workers/processors/dimo-snapshot.processor.ts`
- `backend/src/modules/dimo/queries/latest-vehicle-snapshot.query.ts`

### Backend — AI / evidence semantics

- `backend/src/modules/ai/evidence/ai-evidence-telemetry.mapper.ts` — standby heartbeat 15 min–24 h
- `backend/src/modules/ai/tools/get-vehicle-telemetry-status/*`

### Backend — workers / wake (neighbor — Trip Detection)

- `backend/src/workers/snapshot-wake/*`

### Frontend — operational projection

- `frontend/src/rental/lib/telemetryFreshness.ts`
- `frontend/src/rental/lib/operational-projection/**` (connectivity enums, presentation)
- `frontend/src/rental/lib/obd-plug-status.ts`

### Persistence (discovered models — not audited)

- `vehicle_latest_states` — `source_timestamp`, `provider_fetched_at`, `raw_payload_json`
- `dimo_vehicles` — `connection_status`, `last_signal`
- `device_connection_episodes`, `device_connection_webhook_inbox`
- `dimo_poll_logs`

## Confirmed code facts (repository only, bootstrap)

| Claim | Epistemic | Source |
|-------|-----------|--------|
| `signalsLatest.lastSeen` maps to VLS `sourceTimestamp` / `lastSeenAt` | CONFIRMED | `dimo-snapshot.processor.ts` `normalizeSnapshot` |
| Stale provider snapshot skips VLS update except `providerFetchedAt` / `syncJobRef` | CONFIRMED | `dimo-snapshot.processor.ts` monotonic guard branch |
| ClickHouse `telemetry_snapshots.recorded_at` derives from normalized `lastSeenAt` | CONFIRMED | `clickhouse-telemetry.service.ts` |
| AI mapper documents standby window 15 min–24 h | CONFIRMED | `ai-evidence-telemetry.mapper.ts` |

## Explicit non-claims

- Complete connectivity state machine across all providers
- Production-validated LTE_R1 sleep/wake intervals (pending Phase 2)
- IO174 / Ruptela 0x10 heartbeat visibility in SynqDrive ingest
- Canonical promotion of KS MX 2024 forensic numbers

## Open gaps

See [contradictions/KNOWLEDGE_GAPS.md](contradictions/KNOWLEDGE_GAPS.md) and [research/OPEN_QUESTIONS.md](research/OPEN_QUESTIONS.md).
