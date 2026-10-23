# C5.1 — Risks and open questions

## Closed lessons from C5 V0 / QA (must not repeat)

| QA finding | C5.1 mitigation |
| --- | --- |
| 67 outputs with ±5 s support | Spec: abort repair at h=4 → pass-through C4; audit gate F3 |
| 115 C4-numeric seconds lost | No global re-estimate; REPAIR_REJECTED keeps C4 value |
| Different event `usableQualities` | Identical guard set for both arms in validation |
| Incomplete manoeuvre recall proof | Full #2139 oracle in `VALIDATION_GATES.md` D* |
| Synthetic `constant_speed` scaling bug | Shared fixture module; haversine leg assert |
| TES21-2 report ≠ JSON | Single `c5_1_experiment_summary.json` authority |

## Design risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| False-positive TIME_SUSPECT on real braking/accel | High | LOO + manoeuvre persistence test; reject repair if multi-point S5 without attribution |
| Window creep across trip | Medium | Seed+merge caps; max width 9 s; no repair outside ⋃W |
| Repair accepted but worse on common seconds | Medium | Offline ref check when readable; else strict LOO only |
| Eligibility flags correlate with sparse grid | High | S3 alone insufficient; require (S1∨S2∨S4∨S5) combo or gap neighbourhood |
| Heading not used → curve false TIME | Medium | Phase-1: reject repair when heading jump > threshold; phase-2: optional curvature model |
| Delayed C4 finalization (t+6) vs repair (t+4) | Low | Repair runs on **frozen** C4 replay snapshot per trip, not streaming |
| Double counting in Theil–Sen pairs | Low | Same as V0; document non-overlap optional optimization |

## Open questions (evidence gaps)

1. **Sub-second time in DIMO** (#2141): not available in fixtures — UNCERTAIN remains honest; future FIRST/LAST aggregation is acquisition change, not C5.1-only.
2. **TIG22 19:04 physics** (time compression vs OBD): repair must not declare victory; unscored in gates.
3. **TES21-1 four C4 events → zero in V0:** were they video-confirmed manoeuvres or artefacts? C5.1 validation must use oracle table, not event count alone.
4. **ε in repair-vs-C4 ref test:** 0.5 km/h floor is hypothesis — frozen for experiment 1, not tuned.
5. **Independent video #5:** required for generalization sign-off beyond NOT_PROVEN fleet gates.

## Fable review readiness

Design is ready for **architecture review** if:

- Pass-through rules are accepted as sufficient for coverage preservation  
- Eligibility on TES16 is agreed without hand-drawn windows  
- Event parity (same usableQualities) is accepted  

Not ready for implementation sign-off until Fable confirms LOO + gated scope addresses root cause without fleet-wide C1 re-entry.

## Explicit non-actions

- No merge of C5 V0 code path  
- No production feature flag  
- No parameter sweep on TES16/TIG22/TES21  
- No automatic implementation after this design PR
