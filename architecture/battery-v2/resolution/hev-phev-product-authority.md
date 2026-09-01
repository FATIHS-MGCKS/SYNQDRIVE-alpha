# HEV / PHEV Product Authority — Resolution Dossier (Phase 4)

**Gaps:** `BAT-V2-GAP-HEV-IS-EV-001`, `BAT-V2-GAP-HEV-SIDE-EFFECT-READ-DIVERGENCE-001`  
**Contradiction:** `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001`  
**Priority:** P1  
**Readiness:** DECISION_REQUIRED — **DECISION_NOT_READY for full VALIDATED status**

## CURRENT STATE (Phase 3 confirmed)

| Layer | HEV behavior |
|-------|--------------|
| D1 snapshot | `evSoc` → `recordSnapshot` (no fuelType gate) |
| D2 charge sessions | flags + capability |
| D3 capacity shadow | `HV_CAPACITY_SHADOW` + session |
| BatteryMeasurement HV | ICE forbidden |
| Canonical read | `isEv=false` → no `canonical.hv` |

**Side-effect / read-model divergence:** HV pipeline side-effects may persist while `canonical.hv` remains absent for HEV.

## PHASE-3 LAYERING (preserve)

| Layer | Role |
|-------|------|
| **D1** RAW HV SNAPSHOT / EVIDENCE | Observation-driven; potential diagnostic carrier |
| **D2** CHARGE SESSION DERIVATION | Recharge/fallback flags + capability |
| **D3** CAPACITY / SOH COMPUTATION | Capacity-shadow gates |
| **E** CANONICAL READ | Current HYBRID excluded (`isEv=false`) |

## DESIGN OPTIONS — HEV

| Option | Summary | Customer usefulness | False-health risk | Verdict |
|--------|---------|---------------------|-------------------|---------|
| **A LV-only canonical** | Canonical health = LV; HV layers TBD per evidence | Medium (honest) | Low if D2/D3 gated | **PROPOSED default** — layers not finalized |
| **B Full HV when capable** | `isEv=true` for HEV with signals | High if signals good | High (small pack semantics) | Needs fleet audit |
| **C Hybrid authority model** | Separate `canonical.hybrid` slice | High complexity | Medium | Research |
| **D Status quo** | Side-effects without read alignment | Low trust | High | **REJECT** |

### HEV Option A — explicit layering (no internal contradiction)

Option A does **not** mean "HV telemetry diagnostic only" while simultaneously gating D1/D2/D3 in one sentence. Layering decision:

| Layer | Option A direction | Status |
|-------|-------------------|--------|
| **D1** | May retain raw diagnostic telemetry (observation-driven evidence) | **PROPOSED** — pending fleet/provider evidence |
| **D2** | Disabled or non-decision-capable for HEV | **PROPOSED** |
| **D3** | Disabled or non-decision-capable for HEV | **PROPOSED** |
| **E** | `canonical.hv` absent (`isEv=false`) | **CONFIRMED** current read |

**DECISION_NOT_READY** until fleet/provider/product evidence exists. Do not implement write-gate changes in Phase 4.

## PHEV (separate)

**Recommendation:** Keep **LV + HV parallel** (`isEv=true`). PHEV traction battery is customer-meaningful. LV REST represents 12V system — already separate in architecture. No change to FuelType semantics in Phase 4.

## RECOMMENDED OPTION (PROPOSED)

**HEV Option A** as default product direction: canonical health = LV only; align D1/D2/D3 write gates with read model after evidence workshop. `materializePolicy.hvPipelineAllowed` decision deferred to PKG-05 (`BAT-V2-GAP-HV-PIPELINE-ALLOWED-DEAD-001` — **DECISION_REQUIRED**, not IMPLEMENTATION_READY).

## EVIDENCE REQUIRED BEFORE IMPLEMENTATION

- Production fleet mix: HEV count with HV capability rows + active shadow pipeline
- DIMO signal quality sample for HEV `evSoc` snapshots
- Workshop/ops feedback on HEV battery UX expectations

## EVIDENCE REQUIRED AFTER

- No unintended HV assessments affecting canonical read for HEV in LV-only mode
- Diagnostic panels still show raw HV signals if D1 retained

## NON-EFFECTS

Does not fix LV publication chain; does not change PHEV/BEV paths without explicit scope.

## GRAPH IDS

Contradiction + gaps remain open until product sign-off.
