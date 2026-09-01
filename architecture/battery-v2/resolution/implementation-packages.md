# Implementation Packages (Phase 4)

**Status:** PROPOSED — not implemented

| Package | Title | Readiness | Priority |
|---------|-------|-----------|----------|
| `BAT-V2-RUNTIME-PKG-01` | LV canonical assessment handoff | IMPLEMENTATION_SPEC_REQUIRED | P0_ACTIVATION_BLOCKER |
| `BAT-V2-RUNTIME-PKG-02` | LV publication handoff + reconcile | IMPLEMENTATION_SPEC_REQUIRED | P0_ACTIVATION_BLOCKER |
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
| **Dependencies (enablement)** | D1 `inputVersion` + D2 crash-boundary (both VALIDATED); soft: PKG-03 before Stage-2 prod if strict timestamp policy selected |
| **Modules** | `battery-rest-target-evaluate.handler`, `BatteryV2JobProducerService`, `battery-v2-reconciliation.service` |
| **DB migration** | Optional index for reconcile |
| **Feature flag** | `BATTERY_V2_LV_HANDOFF_ENABLED` (recommended, PROPOSED) + `BATTERY_V2_REST_SHADOW_ENABLED` — **deployment-scoped process.env only** |
| **Job identity** | `buildAssessmentJobIdempotencyKey` → `assess:{vehicleId}:LV_HEALTH:{measurementId}` — **not** `lv-assess:` |
| **inputVersion** | **VALIDATED** — `persisted BatteryMeasurement.id` (`BAT-V2-DEC-LV-ASSESSMENT-INPUT-VERSION-001`) |
| **Rollback** | **Safe order (current runtime):** disable `BATTERY_V2_PUBLICATION_ENABLED` first → verify legacy capture restored → then disable handoff flag. `HANDOFF OFF` alone unsafe while `PUBLICATION` ON |
| **Test scope** | Handler unit + integration |
| **Production validation** | Canary **deployment/environment** (not per-org flags). Validate `HANDOFF_ENQUEUE` + `HANDOFF_EXECUTION` + `ASSESSMENT_POLICY_OUTCOME`; `ASSESSMENT_ROW` only when policy requires persist. Observation window for correlation — **not** PASS/FAIL SLA |
| **Blocked by** | `CONFIGURATION_INVARIANT_SPEC_REQUIRED` only |
| **Crash boundary** | **VALIDATED (D2)** — Hybrid C+: direct normal + direct retry repair (`ensureAssessmentHandoff` on `hasMeasurement`) + reconciliation safety net + durable target-scoped handoff metadata |
| **Does not solve** | Publication, timestamp provenance, readiness |

## PKG-02 — LV publication handoff

| Field | Value |
|-------|-------|
| **Dependencies (dev)** | PKG-01 code may proceed in parallel for handler wiring; e2e needs both |
| **Dependencies (enablement)** | PKG-01 assessment persist path; **assessment-track selection authority**; `publicationVersion` spec; `BATTERY_V2_PUBLICATION_ENABLED` |
| **Modules** | `battery-assessment-recompute.handler`, `BatteryV2JobProducerService`, `battery-v2-reconciliation.service`, `BatteryPublicationUpdateHandler`, `BatteryPublicationService` |
| **DB migration** | No |
| **Feature flag** | `BATTERY_V2_PUBLICATION_ENABLED` + handoff flag — **deployment-scoped; no org allowlist in runtime** |
| **Job identity** | `buildPublicationJobIdempotencyKey` → `pub:{assessmentId}:v{publicationVersion}` |
| **Handoff** | Publication enqueue after deterministic assessment selection; policy in `BatteryPublicationService` only — **not** “enqueue every persistedAssessmentId” |
| **Assessment-track authority** | **SPEC REQUIRED** — AUTO may persist WORKSHOP_OVERRIDE + TELEMETRY; publication policy has no track ordering |
| **publicationVersion** | **SPEC REQUIRED** — current default `1` in repository if omitted |
| **Rollback** | **Safe order (current runtime):** disable `BATTERY_V2_PUBLICATION_ENABLED` first (restores legacy capture) → verify → then disable handoff. `HANDOFF OFF` alone unsafe while `PUBLICATION` ON |
| **Test scope** | E2E REST→assess→pub with multi-track scenarios |
| **Production validation** | Canary **deployment/environment**. Validate `PUBLICATION_HANDOFF_ENQUEUE` + `PUBLICATION_HANDOFF_EXECUTION` + `PUBLICATION_POLICY_OUTCOME`; `PUBLICATION_ROW` only when `shouldPersistPublication`. `ok: true` + `persistedPublicationId: null` is valid policy skip |
| **Blocked by** | PKG-01 enablement + assessment-selection authority + publicationVersion authority + `CONFIGURATION_INVARIANT_SPEC_REQUIRED` |
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
