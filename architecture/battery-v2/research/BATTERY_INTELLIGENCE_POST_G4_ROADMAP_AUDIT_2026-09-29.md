# Battery Intelligence — Post-G4 authoritative roadmap audit

**Date:** 2026-09-29  
**Mode:** AUDIT / ROADMAP DESIGN ONLY (no runtime, schema, deploy, E3, F6, synthetic GT)  
**Repository main:** `a99592a7d7462cc100d5311c35201951d8d35263` (PR #1843 merge)  
**Production:** release `20260929224455_v4994` @ `1dd4224037a84417c5d605575bb6d288ac93184e`

Navigation summary: [`../BATTERY_INTELLIGENCE_ARCHITECTURE.md`](../BATTERY_INTELLIGENCE_ARCHITECTURE.md)

---

## 1. Historical M3.3A–G reconstruction

Status axes are **separate**: engineering completion ≠ production activation ≠ scientific validation.

| Stage | Substages (known) | Engineering | Production runtime | Scientific / observation |
|-------|-------------------|-------------|--------------------|---------------------------|
| **M3.3A** | A architecture, A.1 hardening | **COMPLETE** | **PRODUCTION_ACTIVE** (`BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED`) | **WAITING_FOR_NATURAL_EVIDENCE** (trustworthy REST chain) |
| **M3.3B** | B0 deploy, B1 activation, B1.1/B1.2 forensics, B1.2W gap FSM, B1.2Y/Y3 provider gap, B1.2X docs, R1 cadence forensics | **COMPLETE** | **PRODUCTION_ACTIVE** (provider gap ON) | **OBSERVATION_RUNNING** / **WAITING_FOR_NATURAL_EVIDENCE** (shutdown/rest) |
| **M3.3C** | C0 preflight, C1–C4, C5A/C5B | **COMPLETE** | **PRODUCTION_ACTIVE** (C3 shadow since `F_C3_T0`) | **OBSERVATION_RUNNING** (feature rows accumulating) |
| **M3.3D** | D0–D0.1, D1, D2, D3/D3.1 foundation, D4 arch + V1 engineering | **COMPLETE** | **PRODUCTION_ACTIVE** (D3 sustained since F4.6) | **LONGITUDINAL_EVIDENCE** (shadow revisions; not customer-safe) |
| **M3.3E** | E0–E0.2, E1 adapter, E2 model contract, E3 pure evaluator | **COMPLETE** (E3 code on main) | E3 **OFF** (`E3_RUNTIME_REACHABLE=NO`) | Model **NOT_ASSESSED** only; **no CAL thresholds** |
| **M3.3F** | F0 arch, F1–F4.6 D3 prod, F5.0 bootstrap, F5.1 report CLI, **F6 PLANNED** | F0–F5.1 **COMPLETE**; F6 **DEFERRED** | D3 **ON**; F5 CLI read-only | F5 **DISTRIBUTIONS_EMERGING**; F6 **NOT ACTIVE** |
| **M3.3G** | G0 audit, G1/G1.1 persistence, G2/G2.1/G2.2 emission, G3/G3.1/G3.1.1 F5↔GT, **G4** validation | G0–G3.1.1 **COMPLETE**; G4 prep **COMPLETE** | GT schema **PRODUCTION_ACTIVE**; **0 GT rows** | **G4_STATUS=WAITING_FOR_FIRST_NATURAL_GT** |

**Related pre-M3.3C tracks (not renamed):** M3.1 Stage-2 (**PRODUCTION_ACTIVE**, **PENDING_NATURAL_E2E_EVIDENCE**), M3.2 REST observability audit (**COMPLETE**, **IMPLEMENTATION_READY=NO** for hybrid), M3.2B shutdown shadow (**DEPLOYED**, natural evidence pending), M3.3 R1 8h REST audit (**COMPLETE**).

**Superseded / deferred naming:** M3.3H customer UI referenced in planning — **PLANNED**, not merged as customer health product.

---

## 2. Domain separation audit

| Question | Answer |
|----------|--------|
| LV domain engineering exists? | **YES** — rest sessions, C/D/E/F longitudinal stack, LV GT correlation |
| HV domain engineering exists? | **PARTIAL** — evidence, charge sessions, SOH/capacity shadows; **no** HV longitudinal/F5/E3 stack |
| Separation explicit in code/docs? | **PARTIAL** — `BatteryEvidenceScope`, `F5_GROUND_TRUTH_CORRELATION_BATTERY_SCOPE=LV`, HV signal authority doc; **no** top-level product doc until this audit |

---

## 3. Signal / feature inventory

| Signal / feature | BATTERY_SCOPE | SOURCE | UNIT / type | CURRENT_PIPELINE | PERSISTED | CUSTOMER_VISIBLE | SCIENTIFIC_MATURITY |
|------------------|---------------|--------|-------------|------------------|-----------|------------------|---------------------|
| LV live voltage | LV_ONLY | DIMO `lowVoltageBatteryCurrentVoltage` | V | Stage-2 REST + generalized evidence | YES | Partial (legacy/summary boxes) | DERIVED_EVIDENCE |
| LV REST sessions / targets | LV_ONLY | Telemetry + gap FSM | — | M3.3A/B/C | YES | NO | LONGITUDINAL_EVIDENCE (shadow) |
| Rest-session features (C3) | LV_ONLY | C3 computation | mixed | C3 shadow | YES | NO | LONGITUDINAL_EVIDENCE |
| Longitudinal profile revisions (D3) | LV_ONLY | D1→D2→D3 | policy V1 | D3 sustained | YES | NO | LONGITUDINAL_EVIDENCE |
| E1/E3 longitudinal health | LV_ONLY | Pure offline | — | F5 report only | NO (E3) | NO | NOT customer-safe |
| F5 cohort stats | LV_ONLY | D3 + offline E1/E3 | — | CLI read-only | NO | NO | DISTRIBUTIONS_EMERGING |
| GT events (workshop/replacement) | LV or HV on row | Confirmed capture | — | G2 emission | YES (0 prod rows) | NO | GROUND_TRUTH_VALIDATED (when confirmed) |
| F5↔GT correlation | LV_ONLY in F5 | GT + D3 | — | G3 report V2 | NO | NO | NOT_EVALUATED until G4 |
| HV SOC / energy / power | HV_ONLY | DIMO mapper | % / kWh / kW | Live snapshot + methods | YES | Partial (vehicle state) | RAW_TELEMETRY / DERIVED |
| Provider HV SOH | HV_ONLY | DIMO / workshop / document | % | Canonical health compose | YES | Policy-gated | DERIVED_EVIDENCE |
| HV charge sessions | HV_ONLY | DIMO segments + ERD host | — | `hv-charge-session/*` | YES | NO dedicated BI UI | DERIVED_EVIDENCE |
| HV capacity shadow / cross-session | HV_ONLY | M2/M3 policies | kWh | Shadow handlers | Partial | NO | EXPERIMENTAL |
| DTC / service events | SHARED_RAW | DIMO + service domain | — | Health modules | YES | Contextual | VARIES |
| Publication / assessment (PKG) | LV-primary chain | PKG-01/02 | — | Stage-2 + handoff | YES | Gated (`PUBLICATION_ENABLED`) | **NOT PRODUCTION_VALIDATED** E2E |

---

## 4. LV domain summary

| Field | Value |
|-------|-------|
| **LV_ENGINEERING_COMPLETION** | **~85%** of planned M3.3 LV stack (A–G engineering through G3.1.1; F6 and M3.3H UI remain) |
| **LV_PRODUCTION_STATE** | Generalized evidence ON; provider gap ON; C3 shadow ON; D3 sustained ON; GT collection infra ON; E3 OFF; F6 OFF |
| **LV_OBSERVATION_STATE** | D3 revisions accumulating; F5 cohort **C**; **0** trustworthy natural REST E2E; **0** GT rows |
| **LV_VALIDATION_STATE** | **PENDING_NATURAL_E2E_EVIDENCE** + **WAITING_FOR_FIRST_NATURAL_GT** (G4) + **CAL_UNSET** (F6 blocked) |

**LV remaining engineering (not blocked by G4):**

- M3.3-LV-H0 — authority + API/UI contract boundaries (this audit)
- M3.3-LV-SIGNAL-OBS — M3.2 hybrid REST/shutdown observability
- M3.3H (internal/read models only until maturity)
- Shared Core documentation hardening (scope tags on graph nodes)

**LV blocked only by natural GT:**

- G4 read-only validation re-run
- F6 numeric calibration (also requires F6 gate doc)
- Customer-visible conclusion-bearing LV health claims

---

## 5. HV domain summary

| Field | Value |
|-------|-------|
| **HV_EXISTING_ENGINEERING** | Capability registry (13 keys), DIMO mapper, HV evidence/measurements, recharge session module, SOH selection, capacity shadows, GT emission for HV scope |
| **HV_MISSING_FOUNDATION** | HV longitudinal profile authority, HV F5/natural-evidence register, HV health model (must not clone LV E2), HV G4 correlation path, customer HV health maturity gates |

**HV telemetry classification** (see `signals/hv-signal-authority.md`):

| Signal | Classification |
|--------|----------------|
| SOC, current energy, charging power, is_charging, cable | **AVAILABLE_NOW** (per-VIN capability) |
| Provider SOH, workshop/document SOH | **AVAILABLE_NOW** |
| Pack temperature, gross capacity | **PROVIDER_DEPENDENT** |
| Added energy (M3), segment recharge boundaries | **AVAILABLE_NOW** / **DERIVABLE** |
| Cell-level degradation, usable capacity trend (D3-like) | **NOT_AVAILABLE** |
| HV F5 calibration cohort | **NOT_AVAILABLE** |
| Per-fleet HV signal completeness matrix | **UNKNOWN_NEEDS_PROVIDER_AUDIT** |

**LV algorithms safe to reuse for HV:** **NO** for rest-session degradation, D3 profile, E2/E3 health evaluation, F5 LV segmentation. **YES** for Shared Core patterns only (GT admission, scope, provenance, org isolation).

---

## 6. Shared Core

**SHARED_CORE_COMPONENTS:** `BatteryEvidenceScope`, GT persistence + admission + fingerprint + supersession + historical `asOf`, service-event linkage, document confirm→apply, org/vehicle isolation, confidence/evidence enums, AI Upload confirm gate.

**SHARED_CORE_REFACTOR_REQUIRED:** **YES (documentation + graph tagging)** — not a runtime rewrite.

**SHARED_CORE_REFACTOR_SCOPE:** Tag graph nodes/edges LV|HV|SHARED; consumer contracts name scope; prevent HV consumers from reading LV D3 outputs without explicit adapter.

---

## 7. G4 parallel track

```
G4_STATUS=WAITING_FOR_FIRST_NATURAL_GT
G4_COLLECTION_INFRASTRUCTURE_READY=YES
NATURAL_GT_PRESENT=NO
G4_BLOCKS_LV_ENGINEERING=NO
G4_BLOCKS_HV_ENGINEERING=NO
```

Trigger: first admissible CONFIRMED GT → read-only G4 audit + bounded F5 V2 with production readonly flag.

---

## 8. Dependency graph (summary)

| Bucket | Work |
|--------|------|
| **PARALLEL NOW** | M3.3-LV-H0, M3.3-HV-H0, M3.3-LV-SIGNAL-OBS, shared Core doc/graph tags, internal M3.3H read models |
| **WAITING FOR NATURAL GT** | G4 validation, F6 calibration inputs |
| **WAITING FOR PROVIDER** | HV fleet capability matrix, thermal/cell-level signals |
| **BLOCKED BY PRIOR ENGINEERING** | Customer-safe LV/HV health UI, E3 runtime, F6 activation |

---

## 9. Recommended sequence

1. M3.3-LV-H0 + publish [`BATTERY_INTELLIGENCE_ARCHITECTURE.md`](../BATTERY_INTELLIGENCE_ARCHITECTURE.md)
2. M3.3-HV-H0 (signal + persistence map; provider audit checklist)
3. M3.3-LV-SIGNAL-OBS (M3.2 debt; parallel)
4. M3.3H scoped internal surfaces
5. G4 async on first GT
6. M3.3F-F6 **prep docs only** (gate criteria)
7. M3.3-HV-H1 evidence quality after H0

---

## 10. Forward phase naming

- **Preserve** historical **M3.3A–G** references unchanged.
- **Forward:** `M3.3-LV-*`, `M3.3-HV-*`, optional umbrella **M3.3H** = domain separation doc pass (not renaming old M3.3H UI planning without explicit DEC).

---

## 11. Machine-readable anchor (§14)

See parent doc §10 and completion report in PR body.
