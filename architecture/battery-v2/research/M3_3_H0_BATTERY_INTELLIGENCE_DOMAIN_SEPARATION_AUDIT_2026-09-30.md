# M3.3-H0 — Battery Intelligence domain separation audit + authority seal

**Date:** 2026-09-30  
**Mode:** AUDIT + AUTHORITY SEAL (no runtime, schema, deploy, E3, F6, synthetic GT)  
**Repository main (task baseline):** `312d9f54a2b4c0b0740061d3e2b74897e78eacb0`  
**Production (unchanged):** release `20260929224455_v4994` @ `1dd4224037a84417c5d605575bb6d288ac93184e`  
**Navigation:** [`../BATTERY_INTELLIGENCE_ARCHITECTURE.md`](../BATTERY_INTELLIGENCE_ARCHITECTURE.md)

---

## Executive seal

| Subtrack | Status | Evidence |
|----------|--------|----------|
| **M3.3-H0-SHARED** | **PASS** | Prisma scoped rows + GT G1–G3.1.1; admission projector enforces evidence.scope ↔ batteryScope |
| **M3.3-H0-LV** | **PASS** | D3/F5/E1–E3 code paths under `rest-session-features/longitudinal/*`; no HV imports |
| **M3.3-H0-HV** | **PASS** | HV modules isolated; capability registry + mapper; no LV D3 reuse |
| **M3.3-H0-CROSS-SCOPE-SEAL** | **PASS** | Criteria A–J below (no FAIL) |

```
M3_3_H0_DOMAIN_SEPARATION_SEAL=PASS
H0_CROSS_SCOPE_SEAL=PASS
```

---

## 1. Ground Truth cross-scope authority (G1–G3.1.1)

| Field | Result | Proof |
|-------|--------|-------|
| **GT_STORE_SHARED** | YES | Single `BatteryGroundTruthEvent` table; `batteryScope` column |
| **GT_FACT_SCOPE_EXPLICIT** | YES | Emission + admission require `BatteryEvidenceScope`; projector rejects scope mismatch |
| **GT_REPLACEMENT_IDENTITY_SCOPE** | **orgId + sourceServiceEventId** (scope is fact content) | Partial unique index `battery_ground_truth_one_active_replacement_per_source_event` — **no** `battery_scope` in key (`20260929140000_*`) |
| **GT_CROSS_SCOPE_CORRECTION_SAFE** | YES | G2.2 typed conflict on cross-scope confirm; revoke/supersede explicit |
| **GT_HISTORICAL_ASOF_SCOPE_SAFE** | YES | `isGroundTruthActiveAtAsOf` / F5 historical queries use row scope + revocation/supersession chain |

**Do not “fix” G2.2 by adding `batteryScope` to replacement uniqueness** — that would contradict merged authority.

---

## 2. LV pipeline scope (code proof)

| Pipeline | Scope | Enforcement |
|----------|-------|-------------|
| **D3** | **LV_ONLY** | Materialization reads `battery_rest_session_features` + LV longitudinal contracts only; table has no HV scope dimension |
| **F5** | **LV_ONLY** | `F5_GROUND_TRUTH_CORRELATION_BATTERY_SCOPE = LV`; `F5_LONGITUDINAL_SCOPE_AUTHORITY = LV_REST_SESSION_LONGITUDINAL_PIPELINE_V1` |
| **E2** | **LV_ONLY** | `longitudinal-health-model.policy.ts` / E2 contract under longitudinal LV tree |
| **E3** | **LV_ONLY** | `evaluateM3_3E_LongitudinalHealthEvaluationV1` — invoked from F5 CLI only; **no Nest runtime registration** |

| LV explicit surface | Result |
|---------------------|--------|
| **LV_SCOPE_EXPLICIT_IN_CODE** | YES (scope enums + path separation) |
| **LV_SCOPE_EXPLICIT_IN_DATA** | YES (`BatteryEvidence.scope`, scoped dedup key) |
| **LV_SCOPE_EXPLICIT_IN_API** | PARTIAL — canonical DTO exposes `lv` / `hv` slices; aggregate route still named generically |
| **LV_SCOPE_EXPLICIT_IN_UI** | PARTIAL — health boxes map `lv.*` / `hv.*`; legacy labels say “Battery” |
| **LV_SCOPE_LEAK_COUNT** | **0** scientific cross-mix (longitudinal); **8** presentation/contract ambiguities (see §7) |

---

## 3. HV signal inventory (registry + mapper)

**Count model (dimensions are not a single mutually exclusive partition of surfaces).**

| Dimension | Count | Definition |
|-----------|-------|------------|
| **HV_REGISTRY_KEY_COUNT** | **12** | Capability registry: 11 `hv.*` + `dimo.segments.recharge` (excludes `lv.voltage`) |
| **HV_MAPPER_FIELD_COUNT** | **12** | DIMO mapper HV `dimoSignalName` rows (excludes LV voltage) |
| **HV_DISTINCT_CURRENT_SURFACE_COUNT** | **13** | Registry∪mapper union: 11 shared HV DIMO fields + recharge segment (registry-only) + `powertrainTractionBatteryCurrentVoltage` (mapper-only) |

**Classification tags (may overlap; apply to surfaces or future capabilities — not a partition of 13):**

| Tag | Count | Notes |
|-----|-------|-------|
| **HV_AVAILABLE_NOW_COUNT** | **8** | Surfaces with live/session evidence paths when provider lists capability (SOC, energy, power, charging context, provider SOH, added energy, recharge segment probe) |
| **HV_PROVIDER_DEPENDENT_COUNT** | **4** | pack temperature, gross capacity, charge limit, provider SOH fleet gaps |
| **HV_DERIVABLE_COUNT** | **2** | added-energy session semantics; SOC/energy deltas for M2/M3 (overlaps AVAILABLE_NOW when present) |
| **HV_UNKNOWN_PROVIDER_COUNT** | **1** | mapper-only pack voltage — not capability-preflighted |
| **HV_KNOWN_NOT_AVAILABLE_CAPABILITY_COUNT** | **2** | cell-level degradation authority; usable-capacity longitudinal trend (future — not counted in 13) |

**HV_COUNT_MODEL_SELF_CONSISTENT=YES** — registry 12 + mapper-only + registry-only segment = 13 distinct current surfaces.

Sources: `battery-capability-signals.registry.ts`, `dimo-battery-signal.mapper.ts`, `signals/hv-signal-authority.md`.

---

## 4. ERD ↔ HV Battery Intelligence boundary

| Domain | Owns |
|--------|------|
| **ERD (KG-EED)** | Physical recharge/refuel **event** semantics, segment boundaries, station reference enrichment (when enabled) |
| **HV BI (Battery V2)** | Interpretation: HV evidence, charge-session persistence under `hv-charge-session/*`, capacity/SOH shadows, method profiles, canonical read composition |
| **SHARED_CONTRACT** | DIMO recharge segment fingerprint + time window consumed by BI; ERD does not compute SOH/degradation |

| Field | Result |
|-------|--------|
| **DUPLICATED_AUTHORITY_PRESENT** | **NO** for segment **identity** — BI persists sessions; ERD owns energy-event taxonomy. **Transitional host:** session code under `battery-health/hv-charge-session/` (documented in registry ownership boundary). |

---

## 5. Consumer contract audit (summary)

| Consumer | Classification | Notes |
|----------|----------------|-------|
| `CanonicalBatteryHealthService` + read adapter | **SAFE_GENERIC_RAW** orchestrator | Builds separate `lv` / `hv` subtrees |
| `vehicle-intelligence.controller` battery summary | **REQUIRES_SCOPE_FIELD** | JSON has lv/hv; top-level still “battery” |
| Rental health / health-summary | **LV_IMPLICIT** / **HV_IMPLICIT** | Uses canonical slices |
| `vehicle-health-box.mapper` | **LEGACY_PRESENTATION_ONLY** | Maps scoped fields; generic card title |
| Master Admin C5B shadow UI | **LV_IMPLICIT** | Rest-session shadow only |
| F5 CLI | **LV_IMPLICIT** | Operator-only |
| `battery-critical.detector` | **SAFE_GENERIC_RAW** | Explicit LV vs HV rules in detector |
| Legacy `battery_features` / publication | **CROSS_SCOPE_RISK** (presentation) | Gated; not longitudinal science |

**AMBIGUOUS_CONSUMER_COUNT=8** (presentation/API naming — not D3/F5/E3 science leaks)

**Future read contract (design only):** minimum fields `batteryScope`, `evidenceClass`, `maturity`, `asOf`, `confidence` on any **conclusion-bearing** health field.  
**FUTURE_SCOPE_AWARE_READ_CONTRACT_READY=YES (design)** · **CUSTOMER_PUBLICATION_AUTHORIZED=NO**

---

## 6. Cross-scope query audit (scientific paths)

| Query domain | SCOPE_FILTER | Mix possible? |
|--------------|--------------|---------------|
| D3 materialization | LV pipeline tables | NO |
| F5 report GT load | `batteryScope=LV` + cohort pairs | NO |
| GT repository active replacement | org + source event | Scope on row, not key |
| F5 D3 revisions | LV rest features | NO |
| Diagnostic org scans | Often `scope:` in where | Operational, not pooled degradation |
| Retention / repair | Per-path scope filters | LOW — enumerated |

**CROSS_SCOPE_QUERY_RISK_COUNT=0** for longitudinal/GT-science paths; **2** operational generic scans (retention/diagnostic) are **GENERIC_BY_DESIGN** with explicit scope in sub-queries.

---

## 7. H0-CROSS-SCOPE-SEAL checklist (A–J)

| ID | Criterion | Result |
|----|-----------|--------|
| **A** | HV cannot enter LV D3 | **PASS** |
| **B** | HV cannot enter LV F5 | **PASS** |
| **C** | HV cannot enter LV E2/E3 | **PASS** |
| **D** | LV D3/F5/E3 cannot publish as HV health | **PASS** (no customer publication path) |
| **E** | HV SOH/capacity shadows cannot become LV health | **PASS** (canonical separation) |
| **F** | Shared GT preserves battery scope | **PASS** |
| **G** | Generic evidence queries scoped or domain-neutral | **PASS** (see §6) |
| **H** | UI/read-model ambiguity identified | **PASS** (§5; not hidden) |
| **I** | ERD session authority not duplicated | **PASS** (§4) |
| **J** | UNKNOWN_SCOPE enumerated | **PASS** (§8) |

---

## 8. UNKNOWN_SCOPE components (explicit)

| COMPONENT | Why UNKNOWN | Remediation slice (future) |
|-----------|-------------|----------------------------|
| `battery-data-diagnostic.service` multi-check orchestrator | Cross-scope orchestration by design | Tag findings with scope in API |
| `battery-v2-retention.service` fleet sweeps | Mixed scope deletes with per-branch filters | H0-SHARED doc + scope audit log |
| Legacy `battery_features` / pre-V2 publication | Historical combined surface | M3.3H UI contract only |
| Aggregate “Battery Health” API route name | No scope in URL | Add `?scope=` or split routes in future contract |
| Mapper-only HV pack voltage | Not capability-gated | Provider audit ticket |
| `battery-task.policy` | LV-intent tasks; generic naming | Rename/taskIntent scope tag |

**UNKNOWN_SCOPE_ITEMS=6** (listed above — not silently guessed)

---

## 9. Component inventory (code-derived)

**COMPONENT_TOTAL=56** · **SHARED=14** · **LV_ONLY=24** · **HV_ONLY=12** · **UNKNOWN_SCOPE=6**

<details>
<summary>Representative rows (full classification in repo paths)</summary>

| COMPONENT | TYPE | SCOPE | RUNTIME | CUSTOMER |
|-----------|------|-------|---------|----------|
| `BatteryEvidenceScope` | enum | SHARED | YES | NO |
| `BatteryEvidence` / `BatteryMeasurement` | store | SHARED | YES | indirect |
| GT repository/service/emission/admission | service | SHARED | YES | NO |
| `BatteryEvidenceService` | service | SHARED | YES | indirect |
| `lv-rest-window/*` | policy+state | LV_ONLY | YES | indirect |
| Generalized evidence + provider gap | service | LV_ONLY | YES | NO |
| C3 rest session features | store+job | LV_ONLY | YES | NO |
| D1–D4 longitudinal | service | LV_ONLY | YES | NO |
| E1/E2/E3 policies | pure | LV_ONLY | F5 only | NO |
| F5 report CLI | CLI | LV_ONLY | read-only | NO |
| Stage-2 REST / PKG handoff | job | LV_ONLY | YES | gated |
| `hv-battery-health.service` | service | HV_ONLY | YES | indirect |
| `hv-charge-session/*` | service | HV_ONLY | YES | NO |
| HV method profile / capability | service | HV_ONLY | YES | NO |
| Capacity shadow / cross-session | service | HV_ONLY | flag | NO |
| `CanonicalBatteryHealthService` | orchestrator | SHARED | YES | YES |
| DIMO mapper | ingest | SHARED+scoped rows | YES | NO |

</details>

---

## 10. LV / HV engineering posture after H0

| Track | State |
|-------|-------|
| **LV_FOUNDATION_ENGINEERING** | MOSTLY_COMPLETE (M3.3A–G engineering on main; F6 deferred) |
| **LV_OBSERVATION** | ONGOING (D3, C3, REST observability debt) |
| **LV_NATURAL_VALIDATION** | **G4_STATUS=WAITING_FOR_FIRST_NATURAL_GT** (async) |
| **LV_CALIBRATION** | BLOCKED (F6 NOT ACTIVE) |
| **LV_CUSTOMER_PUBLICATION** | BLOCKED |

| Question | Answer |
|----------|--------|
| **LV_PRIMARY_ENGINEERING_CAN_SHIFT_TO_HV** | **YES** — primary *new* engineering focus can move to HV after H0 seal |
| **LV_MUST_FIX_BEFORE_HV_FOCUS** | **NONE blocking** — continue parallel **M3.3-LV-SIGNAL-OBS** + G4 wait; remediate UNKNOWN consumers in contract pass, not runtime |

---

## 11. HV next stage (design only)

| Field | Value |
|-------|-------|
| **HV_H1_RECOMMENDED** | **M3.3-HV-H1** |
| **HV_H1_SCOPE** | Provider capability matrix per org/fleet; HV evidence-quality + timestamp/freshness authority; charge-session ↔ evidence linkage map; persistence/read-model boundary vs ERD |
| **HV_H1_PREREQUISITES** | M3.3-H0 seal (this doc); no F6/G4 dependency |
| **HV_H1_BLOCKERS** | No HV longitudinal authority yet ( intentional ); customer publication still forbidden |

---

## 12. G4 async (unchanged)

```
G4_STATUS=WAITING_FOR_FIRST_NATURAL_GT
G4 not gated by H0, LV, or HV engineering
E3_RUNTIME=OFF
F6_STATUS=NOT ACTIVE
```

---

## 13. Graph / knowledge authority

| Field | Result |
|-------|--------|
| **GRAPH_SCOPE_TAGGING_APPLIED** | **NO** (bulk LV/HV tags deferred) |
| **GRAPH_SCHEMA_EXTENSION_REQUIRED** | **YES** — propose optional `battery_domain_scope: LV \| HV \| SHARED \| UNKNOWN_SCOPE` on nodes in `graph/schema.yaml` v1.2 |

Added authority node **BAT-V2-AUTH-H0-001** (summary embeds seal; no schema field yet).

---

## 14. Validation commands

```bash
bash architecture/scripts/validate-module-registry.sh
bash architecture/battery-v2/scripts/validate-graph.sh
bash architecture/battery-v2/scripts/validate-h0-domain-separation-contracts.sh
```

## 15. Change semantics (PR #1849)

| Dimension | Value |
|-----------|-------|
| **BATTERY_RUNTIME_CHANGE** | NO |
| **BACKEND_RUNTIME_CHANGE** | NO |
| **MASTER_ADMIN_PRESENTATION_CHANGE** | YES (SynqDrive Code Changes/Architektur only) |
| **SCHEMA_CHANGE** | NO |
| **PRODUCTION_CHANGE** | NO |

## 16. Main rebase (final seal)

PR rebased onto current `origin/main` after VO-0B registry validator updates. H0 conclusions revalidated post-rebase; no Battery semantic overlap in drift.

---

## 17. Machine-readable result anchor

```
M3_3_H0_DOMAIN_SEPARATION_RESULT=PASS
PR1849_H0_FINAL_SEAL=PASS
H0_CROSS_SCOPE_SEAL=PASS
HV_COUNT_MODEL_SELF_CONSISTENT=YES
E3_RUNTIME_REACHABLE=NO
RECOMMENDED_NEXT_ACTION=Execute M3.3-HV-H1 provider capability + evidence-quality authority (docs/engineering); keep G4 async; parallel M3.3-LV-SIGNAL-OBS
```
