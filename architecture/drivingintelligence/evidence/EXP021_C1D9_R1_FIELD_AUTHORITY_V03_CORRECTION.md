# EXP-021 C1D.9 / C1D.9A — S3B R1 field authority + V0_3 correction

| Field | Value |
|-------|-------|
| **Evidence IDs** | DI-EVID-EXP021-C1D9-001 (read-only provider authority audit), DI-EVID-EXP021-C1D9A-001 (V0_3 correction) |
| **Date** | 2026-09-27 |
| **Baseline** | `origin/main` `8ce2ee8e1313bc39dd7bc1e866b1da75ba5e9201` (no DI/DIMO delta since `d32dfc7ed8579fa59a827852c60cd6d6685ff7e0`, PR #1805 merge) |
| **Decision** | DI-DEC-V0-S3B-R1-V03-FIELD-AUTHORITY-001 |
| **Gap** | DI-GAP-S3B-R1-FIELD-AUTHORITY-001 → **PARTIALLY_CLOSED** |
| **Epistemic** | CONFIRMED (provider schema + official spec + read-only R1 responses); multi-sample 1 s bucket behaviour UNKNOWN (not observed) |
| **Production effect** | None — S3B remains a dormant library; 0 production writes, 0 provider mutations |

## 1. Authority sources (C1D.9, read-only)

| Priority | Source | Available | Material |
|----------|--------|-----------|----------|
| 1 | DIMO MCP | **NO** — namespace status `error` (live tool discovery failed) | — |
| 2 | Public GraphQL introspection `https://telemetry-api.dimo.zone/query` | **YES** | sha256 `a10f47298c2cd77790d0c66dff513f0c101a5d212e8524eed11ea46ff762288d` (2026-09-27); endpoint exposes no schema version |
| 3 | Official DIMO spec — `DIMO-Network/model-garage` @ `6f5d8aa6d6317708933acd439ec8d1208c896f17`, `pkg/schema/spec/vss_rel_4.2-DIMO-7fad33e.csv` + `default-definitions.yaml` | **YES** | csv sha256 `e1d16d412ad76701b5dca814b013bc2fd4f37bcb210ecfb810271545babda01c`; yaml sha256 `9054c4457db7f655ec08c610a190ddb5a2bc388a0643911bfa84be57b67e0812` |
| 4 | Read-only telemetry responses (token exchange privilege `[1]` VEHICLE_NON_LOCATION_DATA only) | **YES** | 4 Ruptela R1 vehicles (Identity API `aftermarketDevice.manufacturer = Ruptela`): 192922 (WOB L 7503), 187784, 187361, 187336 |

Raw sanitized responses and hashes were preserved as local audit artifacts (not committed; no JWTs).

## 2. Provider schema facts

All six V0_2 fields live on `SignalAggregations` (`Query.signals(tokenId: Int!, interval: String!, from: Time!, to: Time!, filter: SignalFilter): [SignalAggregations!]`), accept `agg: FloatAggregation!` (+ optional `filter: SignalFloatFilter`) and return **nullable `Float`**. `FloatAggregation = {AVG, MED, MAX, MIN, RAND, FIRST, LAST}`. Negative control: `powertrainTransmissionCurrentGear(agg: TOP)` → HTTP 422 `Value "TOP" does not exist in "FloatAggregation!" enum.`

| GraphQL field | VSS node | VSS datatype | Documented unit | Description |
|---|---|---|---|---|
| `speed` | Vehicle.Speed | float | km/h | Vehicle speed |
| `powertrainCombustionEngineSpeed` | Vehicle.Powertrain.CombustionEngine.Speed | uint16 | rpm | Engine speed (rotations per minute) |
| `obdThrottlePosition` | Vehicle.OBD.ThrottlePosition | float | percent | PID 11 — 0 = closed, 100 = open |
| `obdEngineLoad` | Vehicle.OBD.EngineLoad | float | percent | PID 04 — 0 = no load, 100 = full load |
| `powertrainCombustionEngineECT` | Vehicle.Powertrain.CombustionEngine.ECT | int16 | celsius | Engine coolant temperature |
| `powertrainTransmissionCurrentGear` | Vehicle.Powertrain.Transmission.CurrentGear | int8 | — | 0=Neutral, 1/2/..=Forward, -1/-2/..=Reverse |
| `isIgnitionOn` (not queried since C1D.8B) | Vehicle.IsIgnitionOn | boolean | — | exposed as `Float` |

## 3. Empirical R1 read (descriptive only — never thresholds)

8 × 10 min windows at `interval: "1s"` + 4 dense 5 min windows (densest minute of 12 recent driving hours per vehicle).

| Field | availableSignals | rows | non-null | coverage | observed min…max | notes |
|---|---|---|---|---|---|---|
| speed | 4/4 | 411 | 411 | 1.000 | 0…168 | integer km/h |
| powertrainCombustionEngineSpeed | 4/4 | 411 | 373 | 0.908 | 99…5233 | quarter/half rpm values (OBD PID 0C scaling) |
| obdThrottlePosition | 4/4 | 411 | 393 | 0.956 | 10.196…85.882 | on `A·100/255` grid → percent 0..100 (0..1 contradicted) |
| obdEngineLoad | 4/4 | 411 | 411 | 1.000 | 0…99.608 | on `A·100/255` grid → percent 0..100 |
| powertrainCombustionEngineECT | 4/4 | 411 | 396 | 0.964 | 77…200 | integer °C; single 200 value recorded as descriptive (possible sentinel) |
| powertrainTransmissionCurrentGear | **0/4** | 411 | **0** | 0.000 | — | not exposed by any audited R1 device |

- Cadence ~5–15 s per sample; densest minute 25–43 samples; **never >1 sample per 1 s bucket**. Sub-second intervals (500/250/100 ms) accepted but timestamps return at whole-second resolution. AVG = FIRST = LAST = MIN = MAX in every observed bucket — a property of observed sparsity, **not** proof that it always holds.
- Tri-state corroborated: grid gaps (row absent) and present rows with individual null fields both observed → S3B `ROW_ABSENT` / `SIGNAL_NULL` / `VALUE_PRESENT` consistent; no forward fill.

## 4. Aggregation semantics

| Field | AVG accepted | AVG semantics | Verdict |
|---|---|---|---|
| speed, rpm, throttle, load, ECT | YES | interval mean of a continuous quantity | **AVG_SEMANTICALLY_VALID** (INTERVAL_ONLY) |
| currentGear | YES (syntax) | signed categorical/ordinal index: {3,4}→3.5 (no such gear), {-1,1}→0 (synthesizes Neutral), {0,2}→1 (gear never engaged) | **AVG_SEMANTICALLY_UNSAFE** |
| isIgnitionOn | YES (syntax) | boolean as Float → fractions | excluded (C1D.8B, upheld) |

## 5. C1D.9A correction (implemented)

| Aspect | V0_2 (superseded) | V0_3 |
|---|---|---|
| Query id | `DI_V0_R1_OBD_QUERY_V0_2` | `DI_V0_R1_OBD_QUERY_V0_3` |
| Adapter | `DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_2` | `DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_3` |
| Snapshot | `DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_2` | `DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3` |
| Fields | 6 (incl. `powertrainTransmissionCurrentGear`) | 5: speed, powertrainCombustionEngineSpeed, obdThrottlePosition, obdEngineLoad, powertrainCombustionEngineECT |
| Aggregation | AVG | AVG (unchanged) |
| Field authority | all `REPO_CONTRACT_ONLY` | all `PROVIDER_SCHEMA_VERIFIED`; per-signal `providerDocumentedUnit` + `valueScale` (KM_PER_HOUR / RPM / PERCENT_0_100 / CELSIUS); `fieldAuthoritySource = DIMO_TELEMETRY_GRAPHQL_SCHEMA+DIMO_VSS_4_2_SPEC` |
| Gear | normalized to `NormalizedR1ObdObservation.gear` (fractional values passed through) | not queried, not normalized; `gear` removed from the S1 `NormalizedR1ObdObservation` type (no consumer existed) |
| Exclusions | implicit | explicit `DI_V0_R1_OBD_EXCLUDED_PROVIDER_FIELDS` (gear, isIgnitionOn) |
| Combined input identity | `DI_V0_COMBINED_INPUT_IDENTITY_V0_2` | **unchanged V0_2** — it hashes each pinned `inputEvidenceVersion`, so the V0_3 R1 snapshot propagates without a contract change |

Snapshot serialization now includes `temporalSemantics`, `fieldAuthoritySource`, `providerDocumentedUnit` and `valueScale`. Superseded V0_2 identifiers are listed in `DI_V0_R1_OBD_SUPERSEDED_VERSIONS` and tested never to alias V0_3.

No values are rescaled (no `/100` or `*100`); no observed range is encoded as a validation threshold; ECT carries no overheat/temperature claim.

## 6. Temporal authority (unchanged)

R1_TEMPORAL_SEMANTICS = INTERVAL_ONLY · R1_POINT_SPEED_AUTHORITY = NO · R1_POINT_ACCELERATION_AUTHORITY = NO · R1_POINT_EVENT_TIME_AUTHORITY = NO · R1_CONTINUOUS_KINEMATIC_PATH_COUNT = 0 · fixed time correction = NO · R1_CAN_OVERRIDE_L3 = NO.

## 7. Activation policy (architectural authority for future S4 — activates nothing)

| Field | Policy | Reason |
|---|---|---|
| speed | ALLOW | provider-verified km/h; INTERVAL_ONLY; never overrides L3 |
| powertrainCombustionEngineSpeed | ALLOW | provider-verified rpm; interval evidence only |
| obdThrottlePosition | ALLOW | provider-verified percent 0..100 |
| obdEngineLoad | ALLOW | provider-verified percent 0..100; not throttle, no acceleration claims |
| powertrainCombustionEngineECT | ALLOW | provider-verified °C; no temperature claim |
| powertrainTransmissionCurrentGear | BLOCK | AVG unsafe; 0/4 R1 availability; requires a future categorical acquisition strategy + real R1 evidence |
| isIgnitionOn | BLOCK | boolean exposed as Float; AVG fractional (independent exclusion) |

The residual gear item does **not** block use of the five-field allowlist.

## 8. S4 gates after V0_3

| Gate | Status |
|---|---|
| S4_DESIGN_GATE | READY |
| S4_POSITION_ONLY_RUNTIME_GATE | READY (S3A/L3 independent of R1 field authority; subject to its own activation review) |
| S4_R1_FIVE_FIELD_RUNTIME_GATE | READY_FOR_SHADOW_ORCHESTRATION_DESIGN — not Production/customer activation |
| S4_NATIVE_RUNTIME_GATE | STRUCTURALLY_READY_UNCALIBRATED; native fusion NEEDS_VALIDATION |

## 9. Validation

- `di-v0-s3b-r1-v03-authority.spec.ts` (49 tests): exact 5-field AVG query; gear/ignition absent; provider authority + units/scales; temporal non-upgrade; V0_3 versions; V0_2 non-aliasing (serialization + combined identity); snapshot reorder/material/availability identity; per-field null / ROW_ABSENT / no forward fill / non-finite fail-safe / identical + conflicting duplicates; no range thresholds; percent pass-through; ECT Celsius without claims; gear injection (integer, fractional, reverse, conflicting) cannot alter evidence or snapshot; L3 50 vs R1 80; no-L3 + R1 80 → no numeric speed; end-to-end acquisition query.
- Existing S3B closure suite (FULL-R1-002 HOLD / RELEASE / post-release / valid-L3 / every-interval), S1, S2, S3A, native suites re-run green.

## 10. Remaining gaps

- Gear: no scientifically valid categorical acquisition strategy and no R1 evidence.
- Multi-sample 1 s bucket behaviour of AVG on R1 is unobserved (R1 cadence ≤ 1 sample/s).
- No captured R1 OBD rows for FULL-R1-002 in repo (structural fixture).
- Provider schema is unversioned; re-verify on provider change.
