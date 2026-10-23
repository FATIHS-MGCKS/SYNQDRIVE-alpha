# C5.1 — Risks and open questions (post–Fable revision)

## Fable review — disposition

| Item | Status after revision |
| --- | --- |
| `DESIGN_VERDICT=REVISE` | Addressed in `ELIGIBILITY_AND_REPAIR_SPEC.md` + architecture time semantics |
| Video oracle in repair acceptance | **Removed** |
| 3/side @ ±4 vs TES16 :20/:23 | **Replaced** by n≥5, ≥2/side; **feasible** (129.0 / 126.9 km/h) |
| S6 standalone seeding | **Removed** (eligibility 1.5–10.3 % grid vs 34–93 %) |
| ROW_ABSENT split | **Gap-bridge** rule; no absent-only split |
| `a_max` 6 vs #2139 9 m/s² | **`a_attr`** vs **`a_plaus`** separated |
| Eligibility t+9 | **Documented**; offline frozen snapshot only |
| REPAIRED → OK | **Forbidden** |

Design is ready for **offline implementation experiment** subject to implementation PR — not for production deploy.

## Closed lessons from C5 V0 / QA

| QA finding | C5.1 mitigation |
| --- | --- |
| 67 outputs with ±5 s support | Abort at h=4; gate F3 |
| 115 C4-numeric seconds lost | REPAIR_REJECTED → C4 numeric; gate A4/B3 |
| Different event `usableQualities` | Identical guards; REPAIRED never OK |
| Event count as success | Gate D6 + full #2139 oracle |
| Synthetic scaling bug | Shared fixtures; gate H |
| TES21-2 report ≠ JSON | Single `c5_1_experiment_summary.json` |

## Residual risks (explicit)

| Risk | Severity | Notes |
| --- | --- | --- |
| Pass-through preserves bad C4 on “lost” seconds | **Documented** | 13 s with \|err\|>8 km/h (TIG22 5, TES21-1 5, TES21-2 3); TES16 lost set 0 |
| S5 seeds on real manoeuvres | Medium | TES21-1: 7/16 S5 near video manoeuvres — repair blocked by Q4 manoeuvre guard if pre/post fails |
| Theil–Sen correlated path pairs | Low | LOO stability ±0.4 km/h on TES16 :20; n≥5 contamination bound 2/n |
| Eligibility ~t+9 | Low | Acceptable **offline only**; streaming needs new design |
| TIG22 19:04 physics | Medium | Unscored; repair must not claim victory |
| Heading / curve without model | Medium | >25°/s reject unless single TIME_SUSPECT LOO |

## Open questions

1. **Streaming eligibility:** deferred — v1 offline post-process only.  
2. **Vehicle-specific `a_plaus` in repair Q4:** use same table as #2139 event eval per drive class.  
3. **TES21-1 four C4 events → zero in V0:** resolve only via oracle (D1/D4/D6), not event count.  
4. **Independent video #5:** generalization after fleet gates.  
5. **Promotion path:** if experiment PROVEN, separate production contract review for `REPAIRED` metadata in `MotionCoreSpeedSample`.

## Explicit non-actions

- No merge of C5 V0 code path  
- No production feature flag or deploy  
- No parameter sweep on TES16/TIG22/TES21  
- **No automatic offline implementation** triggered by this design commit alone — awaits explicit implementation workstream
