# Implementation Packages (Phase 4)

**Status:** PROPOSED — not implemented

| Package | Title | Readiness | Priority |
|---------|-------|-----------|----------|
| `BAT-V2-RUNTIME-PKG-01` | LV canonical assessment handoff | IMPLEMENTATION_READY | P0_ACTIVATION_BLOCKER |
| `BAT-V2-RUNTIME-PKG-02` | LV publication handoff + reconcile | IMPLEMENTATION_READY | P0_ACTIVATION_BLOCKER |
| `BAT-V2-RUNTIME-PKG-03` | Timestamp provenance model | DECISION_REQUIRED | P1 |
| `BAT-V2-RUNTIME-PKG-04` | HV SOH usable-candidate iteration | IMPLEMENTATION_READY | P2 |
| `BAT-V2-RUNTIME-PKG-05` | HEV product-policy alignment | DECISION_REQUIRED | P1 |
| `BAT-V2-RUNTIME-PKG-06` | Bridge fallback supersede/dedupe | RESEARCH_REQUIRED | P2 |
| `BAT-V2-RUNTIME-PKG-07` | Lock scope degrade policy | RESEARCH_REQUIRED | P2 |
| `BAT-V2-RUNTIME-PKG-08` | HV method eligibility cleanup | DEFERRED | P3 |
| `BAT-V2-VALIDATION-PKG-09` | Post-#1445 natural soak | PRODUCTION_VALIDATION_ONLY | P1 |

## PKG-01 — LV assessment handoff

| Field | Value |
|-------|-------|
| **Dependencies (dev)** | None hard |
| **Dependencies (enablement)** | D1 + D2 + D3 (all VALIDATED); soft: PKG-03 before Stage-2 prod if strict timestamp policy selected |
| **Modules** | `battery-rest-target-evaluate.handler`, `BatteryV2JobProducerService`, `battery-v2-reconciliation.service` |
| **DB migration** | Optional index for reconcile |
| **Feature flag (target)** | Assessment handoff is **V2 core** — no `BATTERY_V2_LV_HANDOFF_ENABLED`. `BATTERY_V2_PUBLICATION_ENABLED` = customer effect gate only. `BATTERY_V2_REST_SHADOW_ENABLED` = **temporary migration scaffold** (current runtime only — retired at M4) |
| **Job identity** | `buildAssessmentJobIdempotencyKey` → `assess:{vehicleId}:LV_HEALTH:{measurementId}` — **not** `lv-assess:` |
| **inputVersion** | **VALIDATED** — `persisted BatteryMeasurement.id` (`BAT-V2-DEC-LV-ASSESSMENT-INPUT-VERSION-001`) |
| **Configuration invariant** | **VALIDATED (D3)** — `BAT-V2-DEC-LV-SINGLE-AUTHORITY-CUTOVER-001` |
| **Readiness semantics** | `IMPLEMENTATION_READY` ≠ `ACTIVATION_READY` ≠ `CUTOVER_READY` ≠ `PRODUCTION_VALIDATED` |
| **Rollback (pre-M4)** | Disable `BATTERY_V2_PUBLICATION_ENABLED` first → legacy capture restored when REST_SHADOW ON |
| **Rollback (post-M4)** | Release rollback — not legacy env toggle (see D3) |
| **Test scope** | Handler unit + integration; concurrency/monotonic handoff tests per D2; eligibility + terminal-outcome replay |
| **Production validation** | Canary **deployment/environment**. Validate handoff enqueue/execution/policy outcome dimensions; M3 migration: legacy/canonical trigger counts, overlap/duplicate compute, queue load, no customer publication while PUBLICATION OFF |
| **Blocked by** | **None** (architecture/spec) — runtime implementation requires separate authorization |
| **Crash boundary** | **VALIDATED (D2)** — Hybrid C+ per D2 dossier |
| **Does not solve** | Publication (PKG-02), timestamp provenance, readiness, legacy/REST_SHADOW removal (M4) |

## PKG-02 — LV publication handoff

| Field | Value |
|-------|-------|
| **Dependencies (dev)** | PKG-01 code may proceed in parallel for handler wiring; e2e needs both |
| **Dependencies (enablement)** | PKG-01 assessment persist path; **assessment-track selection authority (D4 VALIDATED)**; **publicationVersion contract (D5 VALIDATED)**; `BATTERY_V2_PUBLICATION_ENABLED` |
| **Modules** | `battery-assessment-recompute.handler`, `BatteryV2JobProducerService`, `battery-v2-reconciliation.service`, `BatteryPublicationUpdateHandler`, `BatteryPublicationService` |
| **DB migration** | No |
| **Feature flag** | `BATTERY_V2_PUBLICATION_ENABLED` — customer/publication **effect gate** (D3). No separate HANDOFF flag |
| **Job identity** | `buildPublicationJobIdempotencyKey` → `pub:{assessmentId}:v{publicationVersion}` |
| **Handoff** | Publication enqueue after deterministic assessment selection; policy in `BatteryPublicationService` only — **not** “enqueue every persistedAssessmentId” |
| **Assessment-track authority** | **VALIDATED (D4)** — freshness-conditional `WORKSHOP_OVERRIDE > TELEMETRY` within D4 authority epoch; cross-track stabilization epoch + retention≠fallback; previous-track observability required at implementation |
| **publicationVersion** | **VALIDATED (D5)** — `LV_PUBLICATION_CONTRACT_VERSION = 1`; canonical producers must explicitly supply before enqueue; repository `?? 1` is compatibility fallback only |
| **PKG-02 runtime note** | `IMPLEMENTATION_READY` — must implement full D4 contract + D5 explicit contract version + strict publication payload validation; runtime gaps remain open |
| **Configuration invariant** | **VALIDATED (D3)** — resolved for PKG-02 |
| **Rollback (pre-M4)** | Disable `BATTERY_V2_PUBLICATION_ENABLED` first (restores legacy capture when REST_SHADOW ON) |
| **Test scope** | E2E REST→assess→pub with multi-track scenarios |
| **Production validation** | Canary **deployment/environment**. Validate publication handoff enqueue/execution/policy outcome |
| **Blocked by** | PKG-01 runtime enablement only (architecture spec complete) |
| **Does not solve** | HV publication, readiness auto-enable |

## PKG-03 — Timestamp provenance

| Field | Value |
|-------|-------|
| **Dependencies (dev)** | Does **not** block PKG-01/02 development |
| **Dependencies (enablement)** | Must precede production Stage-2 if strict measurement provenance policy selected |
| **Modules** | Mapper, ingestion, REST eval, Prisma `BatteryMeasurement` |
| **DB migration** | Yes — provenance enum on measurement carrier |
| **Feature flag** | Strict mode flag |
| **Rollback** | Flag OFF preserves legacy accept |
| **Blocked by** | DECISION on provenance table |
| **Does not solve** | LV handoffs; does not gate primary REST session opening |

## PKG-04 — HV SOH iteration

| Field | Value |
|-------|-------|
| **Dependencies** | Independent |
| **Modules** | `canonical-battery-health.service.ts`, `battery-evidence-strength.policy.ts` |
| **DB migration** | No |
| **Feature flag** | Optional behavior flag |
| **Blocked by** | None |
| **Does not solve** | SOH gate shadow path, naming debt |

## PKG-05 — HEV authority

| Field | Value |
|-------|-------|
| **Dependencies** | Product workshop; blocks `hvPipelineAllowed` decision |
| **Modules** | Ingestion gates, policy materialization, possibly snapshot service |
| **Blocked by** | Fleet audit; DECISION_NOT_READY |
| **Does not solve** | PHEV paths |

## PKG-09 — Post-#1445 soak

| Field | Value |
|-------|-------|
| **Dependencies** | None |
| **Runtime change** | NO |
| **Blocked by** | Natural trip volume |
| **Does not solve** | Publication chain |
| **Evidence strength** | Initial smoke only — not strong statistical validation |
