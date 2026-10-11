# R1 — GraphQL query registry (Q001–Q027 re-validation)

| Audit head | `0633d08311803b1473c6e7a274e5074e4cb69a08` |
| Historical registry | `docs/audits/dimo-phase-2a-current-query-surface-audit-2026-08-31.md` |

## R1 verdict

| Check | Result |
|-------|--------|
| Registry IDs Q001–Q027 still valid taxonomy | **CONFIRMED** — builder file mapping unchanged at R1 head |
| New production query builders since Phase 2A | **NONE** in `backend/src/modules/dimo/queries/*.query.ts` (still **16** files) |
| Recharge segments | Still split: `energy-event-segments.query.ts` + `recharge-segments/dimo-recharge-segments.query.ts` (Q023/Q025) |
| Phase 2A scaling numbers | **HISTORICAL** — recompute only after confirming Production tier env overrides |

## Builder → registry map (CONFIRMED_FROM_CODE @ R1)

| ID | Builder module | GraphQL root | JWT |
|----|----------------|--------------|-----|
| Q001 | `latest-vehicle-snapshot.query.ts` | `signalsLatest` | Vehicle |
| Q002 | `last-seen-location.query.ts` | `signalsLatest` (subset) | Vehicle |
| Q003 | `data-summary.query.ts` / telemetry helpers | `dataSummary` | Vehicle |
| Q004 | identity callers (vehicles service) | Identity GraphQL | Developer/Vehicle |
| Q005 | `latest-dtc.query.ts` | `signalsLatest` | Vehicle |
| Q006 | `trip-detection-core.query.ts` | `signals` windowed | Vehicle |
| Q007 | `route-enrichment.query.ts` | `signals` | Vehicle |
| Q008 | `performance.query.ts` | `signals` | Vehicle |
| Q009 | `high-frequency.query.ts` | `signals` (fine buckets) | Vehicle |
| Q010 | `environment-temperature.query.ts` | `signals` | Vehicle |
| Q011 | `tire-pressure-history.query.ts` | **DEFINED_BUT_UNUSED** | Vehicle |
| Q012 | `battery-crank.query.ts` | `signals` | Vehicle |
| Q013 | `trip-segments.query.ts` / fuel inline | `segments` / signals | Vehicle |
| Q014 | invocation context | reuses Q013 | — |
| Q015 | `driving-events.query.ts` | `events` | Vehicle |
| Q016 | safety filter context | reuses Q015 builder | — |
| Q017 | `data-summary.query.ts` (event domain) | `dataSummary` | Vehicle |
| Q018 | `data-summary.query.ts` | `dataSummary` | Vehicle |
| Q019 | `available-signals.query.ts` | `availableSignals` | Vehicle |
| Q020 | `battery-capability-preflight.query.ts` | `availableSignals` + `signalsLatest` + `segments` | Vehicle |
| Q021 | recharge probe | `segments(mechanism: recharge)` | Vehicle |
| Q022 | `trip-segments.query.ts` | `segments` | Vehicle |
| Q023 | `energy-event-segments.query.ts` | `segments(refuel)` | Vehicle |
| Q024 | legacy recharge context | superseded by Q025 in prod path | — |
| Q025 | `recharge-segments/dimo-recharge-segments.query.ts` | `segments(recharge)` | Vehicle |
| Q026 | shadow detector | reuses Q009+Q022 | — |
| Q027 | event context HF | reuses Q009 | — |

## Time semantics (mandatory separation)

| Term | Meaning in SynqDrive |
|------|---------------------|
| **Scheduler tick** | `DimoSnapshotScheduler` @ default **30s** (`WORKER_SNAPSHOT_INTERVAL_MS`) |
| **Tier poll interval** | Per-vehicle eligibility: ACTIVE_DRIVING **30s**, RECENTLY_ACTIVE **60s**, RESTING_STANDBY **5m**, LONG_IDLE **30m** (`worker.config.ts` defaults) |
| **GraphQL aggregation interval** | Bucket size inside `signals(...)` queries (e.g. HF **1s** request — not hardware cadence) |
| **Provider ingest cadence** | Hardware/OEM dependent — **UNKNOWN** without runtime probe |
| **SynqDrive persistence time** | `providerFetchedAt`, bucket timestamps, VLS monotonic merge |

## Invocation gateway

All productive GraphQL posts funnel through `DimoTelemetryService` / `DimoProviderGatewayService` with `DimoRequestExecutor` (category + priority + budget). See [`PROVIDER_BUDGET_AND_FAILURES.md`](PROVIDER_BUDGET_AND_FAILURES.md).

## Schema drift / 422

Validated by `validate-dimo-segments-query.ts` and fixtures in `fixtures/dimo-telemetry-segments.schema.fixture.ts`. Queries passing invalid `segments(...)` args → HTTP **422** (**CONFIRMED_FROM_CODE** + historical audits).

**Swallowed errors:** Driving-events fetch failures documented as DIM-GAP-007 (DI authority) — may return empty arrays vs FAILED.

## Machine evidence

- Query builder list: `evidence/R1_REPOSITORY_INVENTORY.json`
- Full per-query tables: Phase 2A doc §3 (retain as **HISTORICAL** detail; update only on builder diffs)
