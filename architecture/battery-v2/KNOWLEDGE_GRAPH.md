# Battery V2 — Knowledge Graph (Human View)

**Last updated:** 2026-09-02 (D3 single-authority cutover decision)  
**Maturity:** Phase 2+3 substantially reconstructed — open gaps remain  
Machine-readable source: [graph/nodes.yaml](./graph/nodes.yaml), [graph/edges.yaml](./graph/edges.yaml)

This Human View is a high-level projection of current machine authority. It must not contradict `CURRENT_STATE.md`, the reachability matrix, or the machine graph.

## LV canonical chain (substantially reconstructed)

```
[Trip finalization]  BAT-V2-AUTH-TRIP-END-001
        │
        ▼
[Canonical LV REST session arming]  ← reconciliation self-heal
        │
        ▼
[REST_60M / REST_6H targets]  → metadata + Bull evaluate jobs
        │
        ▼
[LIVE_VOLTAGE in target window]  BAT-V2-AUTH-LV-MEASURE-001
        │
        ▼
[BATTERY_REST_TARGET_EVALUATE]
        │
        ▼
[BatteryMeasurement]  ── BAT-V2-POL-NO-FABRICATE-001
        │
        ╳  MISSING automatic handoff  BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001
        │
        ▼
[BatteryAssessment]  (when assessment job runs — legacy/reconcile paths)
        │
        ╳  MISSING automatic handoff  BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001
        │
        ▼
[BatteryPublication]  (when flag on + updateLvPublication invoked)
        │
        ▼
[Canonical read]  BAT-V2-AUTH-CANONICAL-READ-001
        │
        ▼
[Consumers]  rental health, API, tasks, insights
```

**Umbrella gap:** `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` — canonical REST → assessment → publication is **not e2e reachable** today. Phase 4 PROPOSED target: `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001` (hybrid handoff; `assess:`/`pub:` keys). **PKG-01 IMPLEMENTATION_READY** (D1/D2/D3 VALIDATED); **PKG-02 IMPLEMENTATION_SPEC_REQUIRED** (D4 assessment-track + D5 `publicationVersion` only). Target architecture (D3): V2 core mandatory; PUBLICATION = effect gate; REST_SHADOW + legacy = temporary scaffolds; **no** HANDOFF flag. Gap remains open; P0_ACTIVATION_BLOCKER only.

**Flag note (current runtime):** `BATTERY_V2_REST_SHADOW_ENABLED` gates canonical REST (temporary migration scaffold per D3). `BATTERY_V2_PUBLICATION_ENABLED` = customer publication effect gate. **No** `BATTERY_V2_LV_HANDOFF_ENABLED` (D3 rejected).

## HV branch (implemented paths + remaining gaps)

```
[DIMO HV signals]  BAT-V2-SIG-HV-*
        │
        ▼
[Capability preflight + HV method profile]  BAT-V2-AUTH-HV-METHOD-PROFILE-001
        │
        ├── M2 shadow ──► hv_capacity_observations
        ├── M3 validation (VALIDATION_ONLY)
        ├── Native recharge segments ──► HvChargeSession
        └── Cross-session capacity (≥3 sessions) ──► battery_assessments
        │
        ▼
[HV SOH evidence conflict]  BAT-V2-AUTH-HV-SOH-CONFLICT-001
        │
        ├── Selected SOH ──────────► canonical.hv.providerSoh ──┐
        └── SOH gate assessment ─► canonical.hv.sohAssessment ┼──► [Canonical read]  canonical.hv  →  consumers
                                                               │
        ┌── publication-intent metadata (lateral; does NOT gate canonical read)
        └── BAT-V2-PUB-HV-SOH-001 — BATTERY_V2_HV_SOH_PUBLICATION_ENABLED
            (publicationEligible=false always; no HV customer publication path)
```

**Remaining gaps (not reconstructed as working paths):**

- `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` — SESSION_CHARGE_CAPACITY compute missing
- `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001` — GROSS_CAPACITY compute missing
- `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` — HEV write/side-effect/read divergence
- `BAT-V2-GAP-PUB-READINESS-001` — HV SOH execution vs publication-intent flags traced; no HV customer publication carrier; production enablement UNKNOWN

**PHEV:** parallel **implemented** LV + HV paths when flags and capabilities pass; not all advertised HV methods have compute.

## HEV write / side-effect / read (separate gates)

| Gate layer | HEV (`HYBRID`) behavior |
|------------|-------------------------|
| **BatteryMeasurement HV writes (Layer A)** | ICE policy → `UNSUPPORTED_PROFILE` |
| **HV snapshot/evidence (Layer D1)** | `recordSnapshot` when `evSoc` present — observation-driven; not fuelType gated |
| **HV charge sessions (Layer D2)** | Recharge/fallback feature flags + method/capability conditions |
| **HV capacity shadow (Layer D3)** | `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED` + eligible completed session |
| **Canonical read (Layer E)** | `HYBRID` excluded → `canonical.hv` absent |

Gap: `BAT-V2-GAP-HEV-SIDE-EFFECT-READ-DIVERGENCE-001`

## Opening vs measurement (parallel authorities)

```
                    ┌── BAT-V2-AUTH-LV-OPEN-001 (opening gate)
[DIMO / latest state] ──┤     isEngineOffForRestWindowOpening
                    └── BAT-V2-AUTH-LV-MEASURE-001 (measurement quality)
```

## Liveness subgraph (REST targets)

```
ENQUEUED ──► hasLiveJob()? ──no──► PENDING_EVALUATION ──► recovery
RUNNING ──► read as already-scheduled (no audited writer)
SKIPPED ──► enum only (no audited writer)
```

## Decision lineage (matches machine graph)

```
BAT-V2-EVID-PROD-61715ECD-001
    ├── supports ──► BAT-V2-DEC-1383-001
    └── supports ──► BAT-V2-DEC-1393-001

BAT-V2-EVID-PROD-EA7696B6-001
    └── supports ──► BAT-V2-DEC-1445-001

BAT-V2-EVID-PROD-4D2BEF5F-001
    └── supports ──► BAT-V2-DEC-1445-001

BAT-V2-DEC-LV-ASSESSMENT-INPUT-VERSION-001 (D1)
    └── refines ──► BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001
    └── refines ──► BAT-V2-DEC-PH4-LV-PUB-CHAIN-001

BAT-V2-DEC-LV-ASSESSMENT-CRASH-BOUNDARY-001 (D2)
    └── refines ──► BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001
    └── refines ──► BAT-V2-DEC-PH4-LV-PUB-CHAIN-001
    └── refines ──► BAT-V2-DEC-LV-ASSESSMENT-INPUT-VERSION-001

BAT-V2-DEC-LV-SINGLE-AUTHORITY-CUTOVER-001 (D3)
    └── refines ──► BAT-V2-DEC-PH4-LV-PUB-CHAIN-001
    └── refines ──► BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001
    └── refines ──► BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001
    └── refines ──► BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001
    └── target: V2 core mandatory; PUBLICATION effect gate; REST_SHADOW/legacy temporary; HANDOFF flag rejected
```

## Still open (use `BAT-V2-GAP-*` — do not invent detail)

- Bridge anchor identity risk (`BAT-V2-GAP-BRIDGE-FALLBACK-001`)
- LV timestamp fallback production frequency (`BAT-V2-GAP-TIMESTAMP-FALLBACK-001`, `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001`)
- Threshold calibration rationale (`BAT-V2-GAP-THRESHOLD-PROVENANCE-001`)
- Redis lock fail-open rationale (`BAT-V2-GAP-LOCK-FAILOPEN-001`)
- Remaining consumer surfaces (`BAT-V2-GAP-CONSUMER-READ-001`)
- Post-#1445 production soak (`BAT-V2-HYP-POST-1445-SOAK-001`)

## Substantially reconstructed (no longer "NOT YET RECONSTRUCTED")

- HV signals, methods (implemented paths), persistence, canonical read model
- Publication/readiness **policy** and flag wiring (enablement UNKNOWN)
- Primary consumer mapping (rental health, API, tasks)
- LV timestamp fallback **code reachability** (production frequency UNKNOWN)
