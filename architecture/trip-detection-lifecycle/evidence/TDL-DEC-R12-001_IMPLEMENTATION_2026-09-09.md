# TDL-DEC-R12-001 — Implementation record (runtime)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R12-IMPL-001 |
| **Decision** | TDL-DEC-R12-001 |
| **Status** | **CI_VALIDATED** @ `c4cd5510a…` — not deployed |
| **Motivation** | [KS_MS_661_R11_NATURAL_DRIVE_2026-09-09.md](KS_MS_661_R11_NATURAL_DRIVE_2026-09-09.md) (`TDL-EVID-KS-MS-661-R11-NATURAL-001`) — Axis E FAIL |
| **Baseline main @ task start** | `c343fab9aa8930b0023702bd4f3c31afd34393fa` (#1590 merge) |
| **PR** | #1591 |
| **First implementation head** | `f92cd1ff74035eb4730bfcac3d1275ca39f1e008` |

## CI history (auditable RED → REMEDIATED → GREEN)

| Run | Head | Workflow | Result | Notes |
|-----|------|----------|--------|-------|
| [34354237230](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/actions/runs/34354237230) | `f92cd1ff…` | Trip FSM Production Readiness CI | **FAIL** | Job `102476180546` — K1 expected ACTIVE_TRIP @ stop tick, got POSSIBLE_END (same-tick boundary/continuity); R11 Scenario J also failed |
| [34358728200](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/actions/runs/34358728200) | `c4cd5510a…` | Trip FSM Production Readiness CI | **PASS** | Remediation — all R10/R11/R12 unit + postgres/redis jobs green |

**TDL-EVID-R12-CI-PASS-001:** Remediation CI green @ `c4cd5510a…` run [34358728200](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/actions/runs/34358728200).

## Intensive review remediation (post-`f92cd1ff…`)

| Blocker | Fix |
|---------|-----|
| Same-tick boundary alters continuity | `priorStopBoundaryAt` for continuity/movement; persist new boundary for later ticks only; downgrade continuity `POSSIBLE_END` when boundary established same tick |
| Continuity POSSIBLE_END drops new boundary | `lastEvidenceSummary` uses `continuityEvidencePatch` not stale `det.lastEvidenceSummary` |
| B1 remains active end boundary after resume | `retireActiveStopBoundaryAfterMovement()` — historical `lastPauseBoundaryAt` |
| Boundary slides on repeated stationary samples | Latch earliest active boundary per stop episode |
| Boundary-backed UNKNOWN not exercised | K1 uses post-boundary stale obs T2 > B |
| Route post-boundary jitter | `hasCrediblePostBoundaryRouteMotion()` adds 25 m displacement gate |
| R12-specific idempotency | `trip-r12-lifecycle-safety.postgres-redis.integration.spec.ts` K12 |

## Root cause (R11 @ `c343fab9…`)

Proven — see first implementation record. **Liveness deadlock:** NO STOP BOUNDARY + EMPTY CORE + STALE/UNKNOWN VLS ⇒ ACTIVE_TRIP indefinitely.

## R12 design (implemented)

| Invariant | Implementation |
|-----------|----------------|
| Stop boundary ≠ end decision | Observation persisted; FSM may stay ACTIVE_TRIP on stop-observation tick |
| ACTIVE_TRIP boundary without IDLE | `resolveProviderStopBoundaryCandidate()` on ACTIVE_TICK |
| Active boundary lifecycle | Latch per episode; retire after credible movement; new B2 after resume |
| Post-boundary activity | Event-time credibility filters on core + route |
| UNKNOWN ≠ INACTIVE | `assessBoundaryBackedEmptyCoreSilence` — `vls_stale_provider_observation` only |
| Physical end boundary | `resolvePossibleEndBoundaryCandidate()` prefers active `stopBoundaryAt` |

**Non-goals preserved:** no PD-2, no 45s TTL, no 120s threshold change, no webhook, no Prisma migration.

## Forensic fields (`lastEvidenceSummary`)

Active: `stopBoundaryAt`, `stopBoundarySource`, `stopBoundaryCandidateReason`, `stopBoundaryContradictions`, `stopBoundaryEvidenceState`.

Historical after resume: `lastPauseBoundaryAt`, `lastPauseBoundarySource`, `stopBoundaryRetiredAt`, `stopBoundaryRetiredByMovementAt`.

End gate: `boundaryBackedSilenceEligible`, `innerGateReason`, `vlsEvidenceState`, `vlsProviderObservedAt`, `vlsObservationAgeMs`.

## Integration suites

- `trip-r12-ks661-production-ordering.postgres-redis.integration.spec.ts` — K1, K1-same-tick, K2, K11
- `trip-r12-lifecycle-safety.postgres-redis.integration.spec.ts` — B1-resume-without-B2, K7-orchestration, K12

## Non-claims

- Production deploy or natural-drive validation
- CI_VALIDATED until Trip FSM Production Readiness CI **SUCCESS** on final PR head — **satisfied** @ `c4cd5510a…` run 34358728200
- UNKNOWN coerced to INACTIVE (**must remain NO**)
