# TDL-DEC-R12-001 — Implementation record (runtime)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R12-IMPL-001 |
| **Decision** | TDL-DEC-R12-001 |
| **Status** | **CI_VALIDATED** — not deployed |
| **Motivation** | [KS_MS_661_R11_NATURAL_DRIVE_2026-09-09.md](KS_MS_661_R11_NATURAL_DRIVE_2026-09-09.md) (`TDL-EVID-KS-MS-661-R11-NATURAL-001`) — Axis E FAIL: no `stopBoundaryAt`, 0× POSSIBLE_END on trip `3b26019d…` |
| **Baseline main @ task start** | `c343fab9aa8930b0023702bd4f3c31afd34393fa` (#1590 merge) |
| **Branch** | `cursor/trip-fsm-r12-stop-boundary-end-liveness-64c8` |

## Production post-audit addendum (read-only @ 2026-09-09T12:52Z)

Trip `3b26019d-ddf1-4961-863b-769e5d72f73f` completed via **`STALE_ONGOING` repair** @ `2026-09-09T06:51:54.158Z` — not normal FSM end. Original audit observation @ `2026-09-09T05:17:34Z` (ONGOING, ACTIVE_TRIP, `stopBoundaryAt` null) preserved.

## Root cause (R11 @ `c343fab9…`)

| Claim | Verdict |
|-------|---------|
| A — `stopBoundaryAt` primarily from IDLE + `resolveIdleStopBoundaryAt()` | **TRUE** |
| B — ACTIVE_TRIP may see stationary provider evidence without boundary | **TRUE** |
| C — `assessSuccessfulEmptyCoreEndEligibility` rejects VLS UNKNOWN | **TRUE** |
| D — `vls_stale_provider_observation` blocks POSSIBLE_END when boundary absent | **TRUE** |
| E — R11 Scenario J requires IDLE first; not KS MS 661 Production ordering | **TRUE** |

**Liveness deadlock:** NO STOP BOUNDARY + EMPTY CORE + STALE/UNKNOWN VLS ⇒ ACTIVE_TRIP indefinitely.

## R12 design (implemented)

| Invariant | Implementation |
|-----------|----------------|
| Stop boundary ≠ end decision | `resolveProviderStopBoundaryCandidate()` + `mergeProviderStopBoundaryCandidate()` persist provider-time boundary while FSM stays ACTIVE_TRIP / IDLE_WITHIN_TRIP |
| ACTIVE_TRIP may acquire boundary without IDLE | Orchestration applies candidate on ACTIVE_TICK (core + empty-core VLS refresh) |
| Monotonic refreshable boundaries | Later provider-time candidate supersedes earlier; never moves backwards |
| Post-boundary activity = credible event-time movement | `continuityImpliesCrediblePostBoundaryMovement()`, `hasCrediblePostBoundaryRouteMotion()` |
| UNKNOWN ≠ INACTIVE | `classifyEmptyCoreVlsInactivity` unchanged; `assessBoundaryBackedEmptyCoreSilence` for **`vls_stale_provider_observation` only** |
| Fresh contradiction wins | Route/performance/post-boundary movement blocks boundary-backed silence |
| POSSIBLE_END uncertainty buffer | Normal chain preserved; R10 finalize guards unchanged |
| Physical end boundary ≠ worker time | `resolvePossibleEndBoundaryCandidate()` prefers `stopBoundaryAt` |

**Explicit non-goals preserved:** no PD-2, no 45s TTL, no 120s threshold change, no Ignition-OFF webhook, no Prisma migration.

## Forensic fields (`lastEvidenceSummary`)

`stopBoundaryAt`, `stopBoundarySource`, `stopBoundaryCandidateReason`, `stopBoundaryContradictions`, `pauseDetectedAt`, `boundaryBackedSilenceEligible`, `innerGateReason`, `postBoundaryMovementAt`, `operationalInactiveMs`, `vlsEvidenceState`, `vlsProviderObservedAt`, `vlsObservationAgeMs`.

## RED → GREEN reproduction

| Stage | K1 Production ordering (unit + integration) |
|-------|---------------------------------------------|
| **RED (R11 behaviour)** | ACTIVE_TRIP stuck; no boundary without IDLE; UNKNOWN blocks end |
| **GREEN (R12)** | Provider stationary shutdown → boundary persisted; stale UNKNOWN + ≥120s silence → `boundary_backed_provider_silence` → POSSIBLE_END |

Integration: `trip-r12-ks661-production-ordering.postgres-redis.integration.spec.ts` (K1, K2, K11).

## Scenario matrix

| ID | Description | Suite | Result |
|----|-------------|-------|--------|
| K1 | KS661 Production ordering → POSSIBLE_END | unit + postgres-redis | **PASS** (unit); integration CI-gated |
| K2 | 92s pause — same trip, boundary + pause evidence | unit + postgres-redis | **PASS** (unit); integration CI-gated |
| K3 | True resume — credible post-boundary movement | unit | **PASS** |
| K4 | Final stop B2 > B1 monotonic | unit | **PASS** |
| K5 | Stale UNKNOWN without boundary — KEEP_OPEN | unit | **PASS** |
| K6 | Fresh route contradiction blocks silence | unit | **PASS** |
| K7 | EngineLoad contradiction blocks until stale | unit | **PASS** |
| K8 | Pre-boundary replay must not rejuvenate | unit | **PASS** |
| K9 | True post-boundary movement detected | unit | **PASS** |
| K10 | FETCH_ERROR not SUCCESS_EMPTY | R11 H regression | **PASS** |
| K11 | Normal R10 finalize chain | postgres-redis integration | CI-gated |
| K12 | Cross-job idempotency | R10 finalize + R11 I regressions | **PASS** (existing suites) |

## CI commands

```bash
cd backend && npm run test:trip-r12:unit
cd backend && npm run test:trip-r12:postgres-redis:ci
cd backend && npm run test:trip-r11:unit
cd backend && npm run test:trip-r11:postgres-redis:ci
npm test -- --testPathPattern="trip-fsm-motor-off-pause-r10|trip-end-cycle-reset|trip-end-validation-r5|trip-terminal-resting-recovery-r7"
bash architecture/scripts/validate-module-registry.sh
bash architecture/trip-detection-lifecycle/scripts/validate-graph.sh
```

## Non-claims

- Production deploy or natural-drive validation
- Pause detection structured proof on Production (R11 Axis C was INCONCLUSIVE)
- UNKNOWN coerced to INACTIVE (**must remain NO**)
