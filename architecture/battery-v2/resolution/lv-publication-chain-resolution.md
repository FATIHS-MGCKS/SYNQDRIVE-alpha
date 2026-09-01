# LV Publication Chain — Resolution Dossier (Phase 4)

**Gaps:** `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001`, `BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001`, `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001`  
**Priority:** P0  
**Readiness:** IMPLEMENTATION_READY (design PROPOSED — not VALIDATED)  
**Proposed decision:** `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001` (PROPOSED)

## CURRENT STATE

Canonical REST measurement persists to `BatteryMeasurement` but does not enqueue `BATTERY_ASSESSMENT_RECOMPUTE`. Assessment completion does not enqueue `BATTERY_PUBLICATION_UPDATE`. Stage 2+ disables legacy snapshot capture → **cutover trap**. `reconcilePendingAssessments()` scans stale `batteryFeatures`, not canonical measurements.

## EVIDENCE

- `battery-rest-target-evaluate.handler.ts` — no assessment enqueue
- `battery-assessment-recompute.handler.ts` — no publication enqueue
- `battery-v2-reconciliation.service.ts` — legacy feature selection
- `BAT-V2-EVID-AUDIT-PUBLICATION-ENQUEUE-ABSENCE-001`
- Phase 3 reachability matrix

## CODE REACHABILITY

CONFIRMED broken handoffs when `BATTERY_V2_REST_SHADOW_ENABLED` + `BATTERY_V2_PUBLICATION_ENABLED` ON.

## USER / SYSTEM IMPACT

- No automatic LV publication maturity progression from canonical REST
- Operators may believe Stage 2 is live when only ingestion works
- Readiness remains decoupled until Stage 3

## TARGET STATE

End-to-end deterministic path:

```
REST target COMPLETED + measurement persisted
  → assessment job enqueued (idempotent)
  → assessment persisted
  → publication job enqueued when eligible (idempotent)
  → battery_publications row when policy passes
  → canonical.lv reflects publication maturity
```

Plus reconciliation safety net for crash boundaries.

## OPTIONS — Assessment handoff

| Option | Summary | Idempotency | Crash boundary | BullMQ | Verdict |
|--------|---------|-------------|----------------|--------|---------|
| **A** Direct enqueue from REST handler | Simplest | Job idempotency key on vehicle+anchor | Handler commit → enqueue gap | Standard retry | Good normal path |
| **B** Domain event on measurement create | Decoupled | Event outbox pattern | Needs outbox or txn | Consumer workers | Higher complexity |
| **C** Reconciliation-only | No direct enqueue | Reconcile scans measurements | Delayed | Batch | Too slow alone |
| **D Hybrid** A + C | Direct + nightly reconcile | Both paths idempotent | Reconcile repairs misses | Mixed | **RECOMMENDED** |

## OPTIONS — Publication handoff

| Option | Summary | Verdict |
|--------|---------|---------|
| **A** Direct enqueue post-assessment | Mirror assessment pattern | **RECOMMENDED primary** |
| **B** Publication reconciliation | Scan publishable assessments | **RECOMMENDED safety net** |
| **C** Hybrid A+B | Normal + repair | **RECOMMENDED** |

## RECOMMENDED OPTION

**Assessment:** Option D — `battery-rest-target-evaluate.handler` enqueues `BATTERY_ASSESSMENT_RECOMPUTE` with idempotency `lv-assess:{vehicleId}:{restTargetId}` after successful measurement persist. Extend `reconcilePendingAssessments()` to include canonical REST measurements without recent assessment.

**Publication:** Option C — `battery-assessment-recompute.handler` enqueues `BATTERY_PUBLICATION_UPDATE` when `publicationEligible` assessment + flag ON. Add `reconcilePendingPublications()` for stale eligible assessments.

## REJECTED OPTIONS

- Reconciliation-only (C alone) — unacceptable latency for Stage 2 cutover
- Legacy snapshot re-enable — contradicts cutover model

## WHY

Minimal surgical extension of existing job topology; preserves #1445 idempotency patterns; matches DEC-1383/1445 liveness philosophy (direct path + reconcile repair).

## IMPLEMENTATION SURFACE

| Module | Change |
|--------|--------|
| `battery-rest-target-evaluate.handler.ts` | Enqueue assessment |
| `battery-assessment-recompute.handler.ts` | Enqueue publication |
| `battery-v2-reconciliation.service.ts` | Canonical measurement scan |
| `battery-v2-lv-assessment.producer.ts` | Idempotency keys |
| `battery-publication.producer.ts` | New wrapper if missing |
| Tests | Handler + reconcile specs |

## MIGRATION IMPACT

Optional index on `BatteryMeasurement` (type, vehicleId, createdAt) for reconcile — not strictly required if query bounded.

## FEATURE FLAG PLAN

1. `BATTERY_V2_REST_SHADOW_ENABLED` — ingestion (existing)
2. `BATTERY_V2_PUBLICATION_ENABLED` — publication persist (existing)
3. New optional `BATTERY_V2_LV_HANDOFF_ENABLED` — shadow handoffs before default ON (recommended)

## TEST PLAN

- Unit: enqueue called once per REST completion (idempotent replay)
- Integration: REST → assess → pub with flags ON
- Negative: flag OFF → no publication enqueue
- Reconcile: kill worker after measurement → reconcile recovers

## PRODUCTION VALIDATION PLAN

Stage 2 canary: 1–2 orgs, observe assessment + publication rows within 24h of natural REST. No backfill.

## ROLLBACK PLAN

Disable handoff flag; revert to manual/reconcile-only; publication rows unchanged (append-only).

## OBSERVABILITY

Metrics: `battery_lv_handoff_assessment_enqueued`, `battery_lv_handoff_publication_enqueued`, reconcile repair counts.

## RISKS

- Duplicate assessments if idempotency wrong → mitigated by existing keys
- Publication before evidence gates pass → policy layer unchanged

## NON-EFFECTS

Does not enable readiness; does not fix timestamp provenance; does not fix HEV authority.

## OPEN QUESTIONS

- Exact reconcile cadence vs #1445 reconciliation load
- Whether handoff flag merges into publication flag after soak

## GRAPH IDS

Gaps remain open until runtime merged. Proposed: `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001`.
