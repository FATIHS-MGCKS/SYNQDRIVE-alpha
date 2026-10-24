# Tires Health — Agent Contract

**Effective:** 2026-10-24 · **Scope:** every agent touching `backend/src/modules/vehicle-intelligence/tires/`, `backend/src/workers/{schedulers,processors}/tire-recalculation.*`, `backend/src/modules/rental-health/tire-rental-health.*`, tire Prisma models, tire REST routes, tire frontend surfaces, or any future DS4 → tire shadow adapter.

## Mandatory rule

> Any substantive Tires Health change **must** update this authority (graph, decisions, evidence, ledger) in the **same workstream/PR**. While the registry status is `AUDIT_IN_PROGRESS`, agents must also re-read [`AUDIT_MANIFEST.md`](AUDIT_MANIFEST.md) and must **not** promote to `AUTHORITY_ACTIVE` without the standard's gate.

## What counts as substantive

- Any change to `tire-health.config.ts` values, V2 factor formulas, clamps, anchors, model version.
- Lifecycle transitions, single-ACTIVE invariant, odometer anchor semantics.
- Ledger schema, fingerprint/idempotency, attribution trigger, replay/backfill guards.
- Queue name, scheduler cadence, leader guard, processor semantics.
- Snapshot dedupe, alert generation, `TireHealthSummary` shape.
- Rental-health tire policy / hard block / review overrides.
- REST contract or frontend tire presentation of status/uncertainty.
- Any new consumer of Driving-Impact or DS4 motion data on the tire side.

**Not substantive (usually):** refactors without behaviour change, comment-only edits, test-only coverage.

## Shadow-only rule (owner decision `TIRE-DEC-DS4-FUTURE-LOAD-BASIS-SHADOW-ONLY-001`)

1. DS4-derived values live in a dedicated shadow store; productive paths (`TireHealthService`, snapshots, alerts, `TireHealthSummary`, rental policy) must not read it. Prove by negative test.
2. Admission follows `TIRE-DEC-DS4-CONSERVATIVE-ADMISSION-POLICY-001`; never use `peakAccel1sMps2`; intensities ordinal only.
3. One acceleration/braking source per factor (`TIRE-DEC-NO-DOUBLE-COUNTING-001`).
4. Neutral fallback for missing/non-admissible data (`TIRE-INV-NEUTRAL-FALLBACK-001`).
5. Every shadow row carries DS4 run/input identity: `diV0MotionCoreShadowRunId`, `combinedInputIdentity`, `pinnedSnapshotHash`, `shadowBundleVersion`, `speedAuthority`, `eventsAlgorithmVersion`, `adapterVersion`, `organizationId`, plus `tireTripUsageLedgerId` / `tireSetupId` / `tripId`. Idempotent upsert on `(tireTripUsageLedgerId, diV0MotionCoreShadowRunId, adapterVersion)`; DS4 replays create new rows, never silent overwrite.
6. The DS4 → tire path is an **asynchronous, retry-capable consumer** (queue + processor). **No synchronous call** from trip canonical finalization, ledger write, or productive recalculation. `readForTrip` statuses `PENDING` / not-yet-`SUCCEEDED` → backoff retry; work must not be dropped because DS4 is still running. Honor `newerFailedRunId` semantics from `readForTrip` (see `integration/DS4_MOTION_INTEGRATION_AUDIT.md` §4.1).
7. Tenant scope resolved from the vehicle; use the org-scoped `readForTrip` interface; no DI module changes without updating the Driving Intelligence authority.

## Validation levels (`decision_status`)

| Status | Definition |
|--------|------------|
| PROPOSED | Intent recorded; not implemented |
| EXPERIMENTAL | Implemented behind flag / shadow only |
| VALIDATED | Code + focused tests confirm implementation |
| PRODUCTION_VALIDATED | Post-change production evidence proves EXPECTED_EFFECT (for tires: comparison against **tread measurements**, never against V2 output) |
| REJECTED / SUPERSEDED | Not adopted / replaced |

## Required scientific record per substantive change

BEFORE · WHY · CHANGE · EXPECTED_EFFECT · VALIDATION · OBSERVED_EFFECT · NON_EFFECTS · TRADEOFFS · REMAINING_GAPS · STATUS · EVIDENCE (`TIRE-EVID-*` / `TIRE-TEST-*` only; exactly one EVIDENCE row per decision).

## Prohibited silent changes

Config weights/anchors/clamps; model version; ledger idempotency; single-ACTIVE invariant; rental hard-block policy; any DS4 → productive leakage; any new wear formula; disabling or widening DS4 allowlists from the tire side.

## Relation semantics (graph)

`input_to` data feeds component · `consumed_by` output used by · `persists` writes table · `enqueues`/`processes` queue flow · `governs` policy over component/table · `gates` admission/validation gate · `projects_to` read projection · `supports` evidence → node · `tested_by` node → test evidence · `contradicts` contradiction → node · `rejected_in_favour_of` rejected approach → decision · `depends_on` decision → external dependency · `must_not_influence` decision → protected component · `owned_by` reserved for future ownership edges.

## Epistemic legend

CONFIRMED (code + tests or read-only production evidence) · INFERRED (reasoned, not re-verified) · HISTORICAL (superseded context) · UNKNOWN (not reconstructed) · CONTRADICTED (conflicting evidence recorded).
