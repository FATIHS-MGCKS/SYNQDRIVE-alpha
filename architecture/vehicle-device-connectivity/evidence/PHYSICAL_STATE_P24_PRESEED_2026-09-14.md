# VDC RB-019 Phase 2 P2.4 — Physical-State Pre-Seed Tooling

| Field | Value |
|-------|-------|
| **Date** | 2026-09-14 |
| **Authority** | Vehicle & Device Connectivity (`AUDIT_IN_PROGRESS`) |
| **Baseline main** | `84ef68944c403c0b042cd9cec0076296fe085bd0` (post-#1640; includes EED F5-PR1 #1643) |
| **Epistemic** | **P2_4_MICRO_CLOSURE_COMPLETE** — pre-cutover; flags default OFF |
| **Production** | **NOT_DEPLOYED / NOT_ENABLED** |

## Explicit non-claims

- P2.5 authority cutover = NO
- `AUTHORITY_MODE_IN_PRODUCTION` = LEGACY / UNCHANGED
- Feature flags enabled = NO
- Side effects executed = NO
- Production mutated = NO
- P2.5 implementation = NOT STARTED

## BEFORE

P2.3 established webhook/snapshot evidence writers and STATEFUL_SHADOW proof, but no operator tooling existed to **establish missing physical projections** from persisted evidence before authority cutover.

## WHY

P2.5 requires pre-seeded projections for active bindings. P2.4 provides deterministic, idempotent, zero-side-effect establishment using canonical evidence timestamps — without performing cutover or enabling live writers.

## IMPLEMENTATION

| Component | Path |
|-----------|------|
| Types | `physical-state-preseed.types.ts` |
| Evidence discovery | `physical-state-preseed-evidence.discovery.ts` |
| Planner (pure) | `physical-state-preseed.planner.ts` |
| Service (dry-run + apply) | `physical-state-preseed.service.ts` |
| Metrics | `physical-state-preseed.metrics.ts` |
| PG proof | `physical-state-preseed.postgres.integration.spec.ts` |

Apply path uses `PhysicalStateReconcileCoordinator.reconcileInOuterTransaction()` with `sideEffectsEnabled: false`, `requireLegacyAuthorityForPreseed: true`, and **no** `webhookEventUpsert`.

### Pre-cutover authority guard (P2.4 micro-closure)

Before reconcile mutates projection state, coordinator acquires:

1. `pg_advisory_xact_lock` on vehicle/provider authority scope (`buildPhysicalStateAuthorityLockKey`)
2. `SELECT authority_mode … FOR UPDATE` on existing authority row (missing row = LEGACY)

If authority mode ≠ LEGACY → `SKIP_NON_LEGACY_AUTHORITY` with **zero** projection/transition/episode/alert/outbox/event-history/authority writes. P2.4 never calls `ensureAuthorityRow` on apply.

### Metrics DI (P2.4 micro-closure)

`PhysicalStatePreseedService` requires runtime-injected `TripMetricsService` (no `import type` + `@Optional`). Unit proof: `physical-state-preseed.service.spec.ts` asserts `connectivityPhysicalStatePreseedTotal.inc({ result, provider, dry_run })`.

## EVIDENCE SOURCES (admissible)

| Source | Provenance | Physical state | `evidenceObservedAt` | Admissible when |
|--------|------------|----------------|----------------------|-----------------|
| `dimo_device_connection_events` | `dimo_webhook_event` | PLUGGED/UNPLUGGED from `OBD_DEVICE_*` | `observedAt` | `tokenId` matches scope binding; valid timestamp |
| `vehicle_latest_states.raw_payload_json` | `vehicle_latest_state_obd` | via `extractObdIsPluggedInEvidence` | per-signal `obdIsPluggedIn.timestamp` | `dimoTokenId` matches scope `tokenId`; valid OBD node |

**Not admissible:** `providerFetchedAt`, poll/receipt time, `createdAt`, wall clock, sources without trustworthy observed time, events on a different `tokenId`/binding.

## TIMESTAMP SELECTION RULE

```
PRESEED_WINNER = candidate with greatest canonical evidenceObservedAt
```

- Source type **never** overrides time
- Equal timestamp + same state → lexicographic `evidenceReferenceId` tie-break (metadata only)
- Equal timestamp + opposing states → `AMBIGUOUS_EQUAL_TIME_CONFLICT` (fail closed)

## BINDING RULE

- Projection remains binding-scoped via `buildBindingScopeFromToken` / `buildDeviceConnectionBindingKey`
- Candidates must match scope `bindingKey`
- Different-token persisted events are excluded (preserves P2.3 CASE A semantics)
- No `legacyBindingKey ?? physicalBindingKey` fallback

## DRY-RUN CONTRACT

`dryRunPhysicalStatePreseed(scope)` executes discovery + planning only.

Reports per scope: candidate count, selected candidate, `evidenceObservedAt`, state, `bindingKey`, provenance, decision, skip reason, and write intents:

- `WOULD_WRITE_OUTBOX = NO`
- `WOULD_TOUCH_EPISODE = NO`
- `WOULD_TOUCH_ALERT = NO`
- `WOULD_CHANGE_AUTHORITY_MODE = NO`

## IDEMPOTENCY CONTRACT

- Missing projection + admissible winner → `ESTABLISHED` (stateVersion=1)
- Rerun with existing projection → `SKIP_EXISTING_PROJECTION` (no overwrite, no APPLIED)
- Concurrent duplicate attempts → one projection row; no duplicate lifecycle effects

## ZERO-SIDE-EFFECT CONTRACT

Successful establishment asserts:

- `episodeAction = none`
- `alertAction = none`
- no outbox rows
- no episode/alert mutations
- no fabricated DIMO event history
- authority latch unchanged (`LEGACY`)

## PG RESULTS

Cases P24-A through P24-L in `physical-state-preseed.postgres.integration.spec.ts`:

| Case | Intent |
|------|--------|
| P24-A | Initial ESTABLISHED |
| P24-B | Exact rerun idempotent |
| P24-C | Repeated dry-run zero mutation |
| P24-D | Existing projection noop |
| P24-E | Newer snapshot over older webhook |
| P24-F | Newer webhook over older snapshot |
| P24-G | Equal-time opposing fail closed |
| P24-H | Equal-time same state establishes once |
| P24-I | Unknown binding / insufficient |
| P24-J | Master off; authority LEGACY |
| P24-K | Concurrent duplicate seed |
| P24-L | Authority already PHYSICAL → SKIP_NON_LEGACY_AUTHORITY / zero writes |

Full physical-state PG suite must remain green (prior 66 + 12 P2.4 = 78 expected).

## CI RUN IDs

| Field | Value |
|-------|-------|
| **Final HEAD** | `21f60a834e0dfb0b86df321ba29e16357e3fa8e5` |
| **Vehicle Detail CI** | `34879276955` (CI gate PASS) |
| **Physical-state PG** | **78/78 PASS** (`test:boundary-repair:postgres`) |
| **Module registry** | `34879277104` PASS |
| **Deploy** | NO |
| **Flags** | OFF |
| **Production authority** | LEGACY (unchanged) |

## KNOWN LIMITATIONS

- Open-episode vs pre-seed baseline mismatch recovery deferred (VDC-Q-018)
- No Production batch CLI operator UX in this PR (service API + PG proof only)
- Mixed-replica gate not proven in this PR

## P2.5 ENTRY STATUS

P2.4 provides pre-seed tooling only. **P2.5 requires:** pre-seed dry-run PASS at scale, UNEXPLAINED correctness-critical divergences = 0, mixed-replica gate PASS — **NOT STARTED**.
