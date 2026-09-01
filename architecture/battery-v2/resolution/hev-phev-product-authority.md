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

## DESIGN OPTIONS — HEV

| Option | Summary | Customer usefulness | False-health risk | Verdict |
|--------|---------|---------------------|-------------------|---------|
| **A LV-only canonical** | HV telemetry diagnostic only; stop HV side-effect writes or gate them | Medium (honest) | Low | **RECOMMENDED default** |
| **B Full HV when capable** | `isEv=true` for HEV with signals | High if signals good | High (small pack semantics) | Needs fleet audit |
| **C Hybrid authority model** | Separate `canonical.hybrid` slice | High complexity | Medium | Research |
| **D Status quo** | Side-effects without read | Low trust | High | **REJECT** |

## PHEV (separate)

**Recommendation:** Keep **LV + HV parallel** (`isEv=true`). PHEV traction battery is customer-meaningful. LV REST represents 12V system — already separate in architecture. No change to FuelType semantics in Phase 4.

## RECOMMENDED OPTION (PROPOSED)

**HEV Option A:** Canonical health = LV only. Gate D1/D2/D3 HV writes for `HYBRID` unless product later proves Option B with fleet evidence. Align `materializePolicy.hvPipelineAllowed` with actual consumers or remove dead flag (`BAT-V2-GAP-HV-PIPELINE-ALLOWED-DEAD-001`).

## EVIDENCE REQUIRED BEFORE IMPLEMENTATION

- Production fleet mix: HEV count with HV capability rows + active shadow pipeline
- DIMO signal quality sample for HEV `evSoc` snapshots
- Workshop/ops feedback on HEV battery UX expectations

## EVIDENCE REQUIRED AFTER

- No orphan HV assessments for HEV in canonical-disabled mode
- Diagnostic panels still show raw HV signals if needed

## NON-EFFECTS

Does not fix LV publication chain; does not change PHEV/BEV paths without explicit scope.

## GRAPH IDS

Contradiction + gaps remain open until product sign-off.
