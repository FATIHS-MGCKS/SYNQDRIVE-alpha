# EXP-021 C1D.10A — P2 triage and new findings

**Date:** 2026-09-27 · **Source:** C1D.10 S4 design review (result `NEEDS_CLOSURE`, 4 P1 + 11 P2) · **Graph:** DI-EVID-EXP021-C1D10A-001 · **Design:** [S4A_CONTRACT_DESIGN.md](../design/s4a/S4A_CONTRACT_DESIGN.md)

> READ-ONLY AUDIT · DESIGN ONLY · NO RUNTIME CHANGE

> **AMENDED BY** [EXP021_C1D10C_AUTHORITY_CLOSURE.md §9](EXP021_C1D10C_AUTHORITY_CLOSURE.md) (C1D.10C, 2026-09-27): P2 items reconciled with the C1D.10B findings under the classes CLOSED / OPEN_ACCEPTED_FOR_S4A / PROMOTED_P1 / NOT_APPLICABLE. The "CLOSED_AT_CONTRACT_LEVEL" results for P1-2 below were re-opened by C1D.10B (P1-A, P1-B) and closed again in contract v2. Text below is preserved as written.

Classes: `CLOSED` · `MUST_BE_DESIGNED_IN_S4A` (frozen in the contract; implemented in S4A) · `MUST_CLOSE_BEFORE_TINY_ACTIVATION` · `CAN_REMAIN_DOCUMENTED_P2` · `PROMOTED_TO_P1`.

## 1. P1 closure

| P1 | Topic | Result | Where |
|----|-------|--------|-------|
| P1-1 | S2 migration authority | **CLOSED** (authority corrected; A/B/C/D separated) | [authority correction §2](EXP021_C1D10A_AUTHORITY_CORRECTION.md) |
| P1-2 | logical identity / idempotency / fencing | **CLOSED_AT_CONTRACT_LEVEL** | [identity and fencing](../design/s4a/S4A_IDENTITY_AND_FENCING.md), [threat model](../design/s4a/S4A_THREAT_MODEL.md) |
| P1-3 | native readiness | **CLOSED_AT_CONTRACT_LEVEL_FAIL_CLOSED** (the prerequisite gap stays open) | [channel model §3](../design/s4a/S4A_CHANNEL_OUTCOME_MODEL.md), DI-GAP-S4-NATIVE-READINESS-001 |
| P1-4 | settlement | **CLOSED_AT_CONTRACT_LEVEL** (24 h quiet anchor + 10 d drift) | [contract design §5](../design/s4a/S4A_CONTRACT_DESIGN.md) |
| P1-5 (promoted P2-5) | replay evidence | **CLOSED_AT_CONTRACT_LEVEL** (the deserializer gap stays open) | [replay](../design/s4a/S4A_REPLAY_AND_EVIDENCE_PINNING.md), DI-GAP-S4-REPLAY-DESERIALIZER-001 |

## 2. P2 triage (11 items)

| # | C1D.10 P2 | Class | Resolution |
|---|-----------|-------|------------|
| 1 | R1 `ABSENT` at the label level is ambiguous (not read vs. read-empty) | MUST_BE_DESIGNED_IN_S4A | R1 `PRESENT_SPARSE` vs `SOURCE_FAILURE` / `NOT_APPLICABLE` / `DISABLED` in the channel model; manifest pins the snapshot |
| 2 | DIMO transport priority / category for S4 reads | MUST_CLOSE_BEFORE_TINY_ACTIVATION | S4C wraps every read in `runWithDimoRequestContext({category:'POST_TRIP_ENRICHMENT', priority:'BACKGROUND'})` (ALS read by `DimoTelemetryService`; no DIMO runtime change). A dedicated `DI_V0_SHADOW` category is optional before scale-up |
| 3 | Window mismatch (position 12 h vs R1 8 h) | MUST_BE_DESIGNED_IN_S4A | one hard limit of 28 800 s for all channels; longer trips `SKIPPED_INELIGIBLE` (`WINDOW_EXCEEDS_MAX_8H`); 0 Production trips affected |
| 4 | DISABLED vs NOT_APPLICABLE collapsed into `NOT_AVAILABLE` | MUST_BE_DESIGNED_IN_S4A | combined input identity V0_3 (separate hashes; validator cases) |
| 5 | Replay evidence not pinned | **PROMOTED_TO_P1** (P1-5) | a crash after acquisition would otherwise silently change the input, so it is correctness, not optimization. Contract closed; S4D deserializer before tiny activation |
| 6 | Cascade behavior of shadow tables | MUST_BE_DESIGNED_IN_S4A | CASCADE only; invariant `NO_CONSTRAINT_THAT_CAN_FAIL_A_CANONICAL_WRITE_OR_DELETE`; the audit loss remains as P2 DI-GAP-S4-SHADOW-DELETION-AUDIT-001 |
| 7 | Location data retention | MUST_CLOSE_BEFORE_TINY_ACTIVATION | 90-day default + purge (S4F) + governance note; no legal conclusion; privacy review before scale-up (DI-GAP-S4-LOCATION-RETENTION-001) |
| 8 | V2 flag wording ("default OFF" read as "OFF in Production") | CLOSED | `CURRENT_STATE.md` now says code default OFF, Production ON |
| 9 | Gear signal not used | CAN_REMAIN_DOCUMENTED_P2 | outside V0; no S4 effect |
| 10 | Multi-sample AVG aggregation in the 1 s location query | CAN_REMAIN_DOCUMENTED_P2 | versioned by `positionQuerySpecId`; S4F metric for multi-sample buckets |
| 11 | Provider schema unversioned | CAN_REMAIN_DOCUMENTED_P2 | `MALFORMED` fails closed (terminal); periodic schema introspection check before scale-up |

`P2_FINDING_COUNT=11` · `P2_PROMOTED_TO_P1=1` (#5) · `P2_BLOCKS_S4A_IMPLEMENTATION=0` (items 1, 3, 4, 6 are designed and implemented *in* S4A; items 2, 5, 7 block tiny activation only).

## 3. New findings (C1D.10A adversarial pass)

| Id | Finding | Severity | Resolution |
|----|---------|----------|------------|
| N1 | Native provider failures are swallowed to `[]` (`fetchDrivingEventsChunkWithRetry`, `fetchEventDataSummary`) | P1 input to P1-3 | fail-closed contract; DI-GAP-S4-NATIVE-READINESS-001 (owner: native ingest / DIMO) |
| N2 | V2 `NATIVE_EVENTS` stage `COMPLETED` is not proof of ingestion | P1 input to P1-3 | never an attestation |
| N3 | S2 `createOrGetRun` catch-and-reread is unusable inside a transaction | P2 → designed | `INSERT … ON CONFLICT DO NOTHING` in T06; DI-GAP-S2-IN-TX-CREATE-RACE-001 |
| N4 | Calibration label can alias bundle content | P2 → designed | `calibrationBundleHash` in the pvk |
| N5 | Tesla routed as `hardwareType=LTE_R1` | existing | DI family governs (`API_SYNTHETIC` → native/R1 `NOT_APPLICABLE`); DI-CONTRA-HARDWARE-TYPE-INTEGRATION-001 |
| N6 | Late-mutation distribution far wider than C1D.10 assumed (max ~6.4 d, not ~682 min) | P1 input to P1-4 | 24 h quiet anchor + 10 d drift |
| N7 | `VehicleTrip` has no `updatedAt` | P2 → designed | drift detection re-hashes fingerprints |
| N8 | FK creation locks canonical tables, and Prisma migrations are not transactional | P2 → designed | `lock_timeout 5s`, explicit BEGIN/COMMIT |
| N9 | S2 tenant integrity is repository-only | P2 → designed | S2 scope-guard triggers + composite unique in the S4A migration |
| N10 | Mixed-version replicas during a rolling restart could complete another pvk's item | P2 → designed | `PIPELINE_VERSION_MATCH` guard (race P, validator) |
