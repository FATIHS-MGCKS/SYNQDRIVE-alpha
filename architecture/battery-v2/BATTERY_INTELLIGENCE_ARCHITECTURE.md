# Battery Intelligence — domain architecture (LV / HV / Shared Core)

**Status:** **AUDIT / ROADMAP** (post-G4, 2026-09-29)  
**Repository:** `origin/main` @ **`a99592a7d7462cc100d5311c35201951d8d35263`**  
**Production:** release **`20260929224455_v4994`** @ **`1dd4224037a84417c5d605575bb6d288ac93184e`**

This document is the **top-level navigation layer** for Battery Intelligence. Historical stage letters **M3.3A–G** remain unchanged. Forward work uses **`M3.3-LV-*`** and **`M3.3-HV-*`** prefixes (see §Phase naming).

---

## 1. Product requirement (non-negotiable)

SynqDrive Battery Intelligence is **two scientific domains** plus shared infrastructure:

```
Battery Intelligence
├── Shared Core (scope, GT, provenance, tenant isolation)
├── LV Battery Intelligence (12 V / ICE+HEV auxiliary)
└── HV Battery Intelligence (traction pack / EV·PHEV)
```

**Rules:**

- Do **not** treat LV rest-session degradation models as HV traction models.
- Do **not** pool LV longitudinal D3/F5 cohort science with HV without an explicit HV pipeline authority.
- **Ground Truth** is shared persistence with **`battery_scope` = LV | HV** on each fact.

---

## 2. Shared Core (existing)

| Component | Scope | Maturity |
|-----------|-------|----------|
| `BatteryEvidenceScope` (LV/HV) | SHARED | PRODUCTION |
| `BatteryEvidence` / `BatteryMeasurement` / sessions | SHARED schema; scoped rows | PRODUCTION |
| `BatteryGroundTruthEvent` + revocations (G1–G2.2) | SHARED | PRODUCTION_DEPLOYED @ `1dd422403` |
| GT admission / fingerprint / supersession / historical `asOf` (G3.1) | SHARED | MERGED · CI_VALIDATED · PRODUCTION_VERIFIED (infra) |
| Service-event + document provenance | SHARED | PRODUCTION |
| Org/vehicle tenant isolation | SHARED | PRODUCTION |
| AI Upload → confirm → apply (no auto-GT) | SHARED | PRODUCTION |

**Not shared (domain-specific inference):**

- LV rest-session longitudinal profile (D1–D3)
- LV F5 natural calibration cohort + GT segmentation (G3)
- LV E2/E3 longitudinal health evaluator (pure; E3 **OFF** runtime)
- HV recharge session merge, HV SOH shadow, HV method profile (separate code paths)

---

## 3. LV Battery Intelligence (current)

### 3.1 Engineering stack (M3.3A → M3.3G)

| Track | Role | Engineering | Production | Scientific validation |
|-------|------|-------------|------------|------------------------|
| **M3.3A/B** | Generalized LV capture, provider gap, rest liveness | COMPLETE | PRODUCTION_ACTIVE (B1, gap) | WAITING_FOR_NATURAL_EVIDENCE (trustworthy REST) |
| **M3.3C** | Rest-session features C1–C5B | COMPLETE | C3 shadow ON | OBSERVATION_RUNNING |
| **M3.3D** | Longitudinal profile D0–D4 | COMPLETE | D3 materialization ON | LONGITUDINAL_EVIDENCE (shadow) |
| **M3.3E** | Assessment input E1; health model E2; pure evaluator E3 | COMPLETE | E3 **OFF** | NOT customer-safe |
| **M3.3F** | D3 prod F1–F4.6; F5.0/F5.1; F6 **PLANNED** | F0–F5.1 COMPLETE; **F6 DEFERRED** | D3 ON; F5 read-only CLI | F5 DISTRIBUTIONS_EMERGING; **no F6** |
| **M3.3G** | Ground Truth G0–G3.1.1; G4 collection | COMPLETE (G3); G4 infra | GT schema live; **0 rows** | **G4_STATUS=WAITING_FOR_FIRST_NATURAL_GT** |

Authoritative detail: `CURRENT_STATE.md`, `research/M3_3G_*`, `research/M3_3F_*`.

### 3.2 LV signal inventory (conceptual)

| Signal / feature | Scope | Source | Pipeline | Persisted | Customer |
|------------------|-------|--------|----------|-----------|----------|
| LIVE_VOLTAGE / resting voltage | LV_ONLY | DIMO / document | Stage-2 REST + generalized evidence | YES | Partial (legacy boxes) |
| Rest sessions / shutdown / parked | LV_ONLY | Telemetry + gap FSM | M3.3A/B/C | YES (shadow features) | NO (internal) |
| Rest-session feature rows | LV_ONLY | C3 computation | C3 shadow | YES | NO |
| Longitudinal profile revisions | LV_ONLY | D1→D2→D3 | D3 sustained | YES | NO |
| F5 cohort statistics | LV_ONLY | D3 revisions | F5 read-only report | NO (report) | NO |
| GT workshop / replacement | LV in F5 correlation | Human confirm | G2 emission | YES | NO |
| E3 evaluation output | LV_ONLY | Pure policy | F5 offline only | NO | NO |

### 3.3 LV remaining engineering (not blocked by G4)

| Item | Type | Notes |
|------|------|-------|
| **M3.3-LV-H0** | ENGINEERING | Domain boundary doc + API/UI contract prep (extends this file) |
| **M3.3-LV-SIGNAL** | ENGINEERING | REST observability / hybrid shutdown (M3.2 arch debt) |
| **M3.3H** | PLANNED | Customer Battery Health UI — **not** authorized for conclusion-bearing LV claims |
| **M3.3F-F6** | BLOCKED | Numeric calibration — requires F6 gate + natural GT samples |
| **G4 validation re-run** | WAITING_FOR_NATURAL_GT | Read-only; **does not block** rows above |

---

## 4. HV Battery Intelligence (current)

### 4.1 What exists today

| Area | Scope | Status |
|------|-------|--------|
| `BatteryEvidence` / measurements (HV SOH, workshop, document) | HV_ONLY | PRODUCTION |
| GT emission (HV scope on facts) | HV via Shared Core | PRODUCTION infra; **no HV F5 correlation** |
| `hv-charge-session/*` + ERD recharge consumption | HV_ONLY | PRODUCTION (transitional host under battery-health) |
| HV method profile / capability resolver | HV_ONLY | PRODUCTION code |
| HV SOH shadow / capacity shadow handlers | HV_ONLY | Flag-gated; **no customer publication** |
| `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED` | HV_ONLY | Present in prod env |
| Longitudinal D3 / F5 / E3 pipeline | **LV_ONLY** | HV explicitly rejected in F5 GT correlation |

### 4.2 HV telemetry (classification — provider audit still required per vehicle)

| Signal | Classification |
|--------|----------------|
| LIVE_HV_SOC, LIVE_HV_RANGE, LIVE_HV_CURRENT_ENERGY, LIVE_HV_CHARGING_POWER | AVAILABLE_NOW (capability registry; provider-dependent per VIN) |
| PROVIDER_HV_SOH / workshop / document SOH | AVAILABLE_NOW (evidence paths) |
| Pack temperature, detailed cell-level degradation | PROVIDER_DEPENDENT / UNKNOWN_NEEDS_PROVIDER_AUDIT |
| HV longitudinal degradation trend (D3-like) | **NOT_AVAILABLE** (no authority) |
| HV F5 calibration cohort | **NOT_AVAILABLE** |
| HV GT → telemetry validation | **NOT_AVAILABLE** (no HV F5 pipeline) |

### 4.3 HV missing foundation

| Gap | Priority |
|-----|----------|
| **M3.3-HV-H0** architecture audit (signals, persistence, boundaries vs ERD) | **NEXT parallel track** |
| HV longitudinal / health model authority (do **not** clone LV E2 blindly) | PLANNED |
| HV F5 or equivalent natural-evidence register | PLANNED after H0 |
| HV customer-visible health fields | BLOCKED until maturity gates |

**LV algorithms safe to reuse for HV:** **NO** for degradation/rest-session/longitudinal health. **YES** for Shared Core only (scope, GT admission patterns, provenance types).

---

## 5. Customer-facing target (future — maturity gates)

Every future UI field requires a maturity class:

| Maturity | Meaning |
|----------|---------|
| RAW_TELEMETRY | Live signal only |
| DERIVED_EVIDENCE | Computed, not longitudinal |
| LONGITUDINAL_EVIDENCE | D3/F5-style cohort |
| GROUND_TRUTH_VALIDATED | Independent GT corroboration |
| CALIBRATED | F6-approved thresholds |
| CUSTOMER_SAFE | Publication + legal/product sign-off |

**LV examples (target):** STATE, TREND, RISK, EVIDENCE, LAST_MEASUREMENT, CONFIDENCE — mostly **DERIVED/LONGITUDINAL** today; **not CUSTOMER_SAFE**.

**HV examples (target):** SOC, ESTIMATED_HEALTH, CAPACITY_TREND, CHARGING_BEHAVIOR, THERMAL_EVIDENCE, DEGRADATION_TREND, CONFIDENCE — mix of **RAW_TELEMETRY** and **DERIVED**; **not CUSTOMER_SAFE**.

---

## 6. Dependency graph (what can run in parallel)

```mermaid
flowchart TB
  subgraph parallel [PARALLEL NOW]
    LVENG[M3.3-LV engineering: signal/UI contract]
    HVH0[M3.3-HV-H0 foundation audit]
    CORE[Shared Core hardening docs/tests]
  end
  subgraph waitGT [WAITING FOR NATURAL GT]
    G4[G4 read-only validation audit]
  end
  subgraph waitF6 [BLOCKED]
    F6[M3.3F-F6 numeric calibration]
  end
  subgraph waitProv [PROVIDER / DATA]
    HVTELEM[HV provider capability matrix]
  end
  LVENG --> G4
  HVH0 --> HVTELEM
  G4 --> F6
  CORE --> G4
```

| Track | G4 blocks? |
|-------|------------|
| LV engineering | **NO** |
| HV foundation | **NO** |
| F6 | **YES** (needs natural GT + F6 gate) |
| Customer health claims | **YES** (GT + calibration + E3 policy) |

---

## 7. Recommended stage sequence (post-G4)

1. **M3.3-LV-H0** — Freeze LV/HV boundaries in authority + consumer contracts (this document + CURRENT_STATE `NEXT_PHASE`).
2. **M3.3-HV-H0** — HV signal/provider audit + persistence map (parallel).
3. **M3.3-LV-SIGNAL-OBS** — Continue REST/hybrid evidence engineering (M3.2 debt) without waiting for GT.
4. **M3.3H (scoped)** — Read models / Master Admin or internal surfaces only; **no** conclusion-bearing customer copy.
5. **G4** — Async read-only re-audit on first natural GT (LV first; HV when HV GT exists).
6. **M3.3F-F6 prep** — Documentation + gate criteria only until G4 produces samples.
7. **M3.3-HV-H1** — HV evidence quality + session linkage (after H0).

---

## 8. G4 parallel track

```
G4_STATUS=WAITING_FOR_FIRST_NATURAL_GT
G4_COLLECTION_INFRASTRUCTURE_READY=YES (production @ 1dd422403)
NATURAL_GT_PRESENT=NO
```

Trigger: first admissible **CONFIRMED** GT row → read-only G4 correlation (F5 V2 + `BATTERY_F5_ALLOW_PRODUCTION_READONLY`).

---

## 9. Knowledge graph recommendation

| Artifact | Recommendation |
|----------|----------------|
| This file (`BATTERY_INTELLIGENCE_ARCHITECTURE.md`) | **YES** — mandatory navigation |
| Separate `LV_BATTERY_INTELLIGENCE_KG` | **NO** — partition existing `architecture/battery-v2/graph/*` with LV/HV tags |
| Separate `HV_BATTERY_INTELLIGENCE_KG` | **DEFER** until **M3.3-HV-H0** completes |

---

## 10. Machine-readable audit anchor

```
BATTERY_INTELLIGENCE_POST_G4_ROADMAP_AUDIT=COMPLETE
FORWARD_PHASE_NAMING=M3.3-LV-* and M3.3-HV-* (preserve M3.3A–G history)
```

See also: `research/BATTERY_INTELLIGENCE_POST_G4_ROADMAP_AUDIT_2026-09-29.md` (full tables + historical reconstruction).
