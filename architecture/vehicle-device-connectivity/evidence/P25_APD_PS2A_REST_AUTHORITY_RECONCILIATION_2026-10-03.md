# P2.5 APD-PS2A — Current Battery REST authority reconciliation

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-P25-APD-PS2A-001 |
| **Captured at (UTC)** | `2026-10-03T02:30:00Z` |
| **Baseline** | `origin/main` code + Production `backend.env` flags (read-only) |
| **Production change** | **NONE** |

---

## A. Current main authority inventory (code + Production flags)

Production flags (VPS `/opt/synqdrive/shared/backend.env`, read-only):

| Flag | Effective |
|------|-----------|
| `BATTERY_V2_REST_SHADOW_ENABLED` | **true** |
| `BATTERY_V2_PUBLICATION_ENABLED` | **true** |
| `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED` | **true** |
| `BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED` | **true** |
| `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` | **true** |
| `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED` | **true** |
| `BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED` | **true** |
| `BATTERY_V2_READINESS_ENABLED` | **false** |

| # | Path | RUNTIME_REACHABLE | PRODUCTION_ENABLED | WRITE_ENABLED | SHADOW_ONLY | CUSTOMER_VISIBLE | CONCLUSION_BEARING | CURRENT_AUTHORITY_ROLE |
|---|------|-------------------|--------------------|---------------|-------------|------------------|--------------------|-------------------------|
| 1 | Legacy M3.1 REST_60M (`BatteryV2Service.onSnapshot`) | Code yes | **NO** (`isBatteryV2LegacyRestCaptureEnabled()` false when shadow+publication) | **NO** | n/a | **NO** | Low | **DEPRECATED_BUT_REACHABLE** (dead at runtime) |
| 2 | Legacy M3.1 REST_6H (same hook) | Code yes | **NO** | **NO** | n/a | **NO** | Low | **DEPRECATED_BUT_REACHABLE** |
| 3 | M3.3 generalized evidence (`GeneralizedEvidenceCaptureService`) | Yes | **YES** | YES (ICE) | No (persisted) | Indirect | **HIGH** | **PRIMARY_REST_EVIDENCE** (`actualRestAgeMs`) |
| 4 | M3.3 `BatteryRestSession` | Yes | **YES** | YES | No | No | **HIGH** | **REST_SESSION_AUTHORITY** |
| 5 | M3.3 nominal 8h ladder (`deriveNominalRestIntervalIndex`, `R1_NOMINAL_REST_CADENCE_MS`) | Yes | **YES** (metadata) | YES | Research metadata | No | **HIGH** | **NOMINAL_LADDER_METADATA** (not equality gate) |
| 6 | C3 rest-session features | Yes | **YES** | YES | Shadow flag name; writes feature rows | No | **HIGH** | **FEATURE_AUTHORITY** (from generalized obs) |
| 7 | D1/D2/D3 longitudinal profile | Yes | **YES** | YES | Materialization gated | No | **HIGH** | **LONGITUDINAL_AUTHORITY** |
| 8 | E1/E3 LV assessment / publication handoff | Yes | Partial | YES when publication | Mixed | **Possible** via publication | Medium | **ASSESSMENT / PUBLICATION** (canonical REST_60M/6H may hand off) |
| 9 | Canonical REST_60M/6H jobs (`LvRestWindow` → `BatteryRestTargetEvaluateHandler`) | Yes | **YES** (`REST_SHADOW`) | YES | No (publication on → not lv-rest shadow block) | Via assessment chain only | **MEDIUM** | **OPPORTUNISTIC_LEGACY_TARGET** + **PUBLICATION_INPUT** (parallel to M3.3) |

Code anchors: `battery-health-v2.config.ts` (`isBatteryV2LegacyRestCaptureEnabled`), `battery-v2-snapshot-ingestion.service.ts`, `generalized-evidence-capture.service.ts`, `rest-session-feature-input.reader.ts` (reads `batteryGeneralizedEvidenceObservation` only), `lv-rest-window.service.ts` (`scheduleRestTargets`).

---

## B. Legacy REST_60M / REST_6H status today

| Field | REST_60M | REST_6H |
|-------|----------|---------|
| CODE_PRESENT | YES | YES |
| RUNTIME_REACHABLE | YES (canonical job path) | YES |
| PRODUCTION_ACTIVE | YES (shadow pipeline schedules/evaluates) | YES |
| M3.1 onSnapshot capture | **OFF** at current flags | **OFF** |
| AUTHORITY_ROLE | **OPPORTUNISTIC_LEGACY_TARGET**, **PUBLICATION_INPUT**, **DEPRECATED_BUT_REACHABLE** (M3.1 hook) | Same |

Architecture taxonomy (M3.3 R1 audit / C0): `OPPORTUNISTIC_LEGACY_TARGET` — supplementary to `actualRestAgeMs`.

---

## C. Current 8h rest model

| Field | Value |
|-------|-------|
| `R1_NOMINAL_REST_CADENCE_MS` | `28_800_000` (8h) — `generalized-evidence.constants.ts` |
| `R1_NOMINAL_REST_CADENCE_HOURS` | **8** |
| `ACTUAL_REST_AGE_IS_AUTHORITY` | **YES** (`computeActualRestAgeMs`, retention/C3) |
| `EXACT_8H_EQUALITY_REQUIRED` | **NO** (nominal index is derived metadata; `REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED=false`) |
| `NOMINAL_REST_INTERVAL_INDEX_RUNTIME_REACHABLE` | **YES** (`deriveNominalRestIntervalIndex`) |
| `NOMINAL_REST_INTERVAL_INDEX_CONCLUSION_BEARING` | Metadata / research — **not** primary gate |
| `REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED` | **false** |
| `8H_LADDER_CURRENT_ROLE` | Maps **source-observed** rest age to nominal rungs; distinct from **device upload cadence** (APD/DSC) |

---

## D. Generalized rest session authority

| Question | Answer |
|----------|--------|
| Requires REST_60M target? | **NO** (no references in `generalized-evidence/`) |
| Requires REST_6H target? | **NO** |
| Requires `actualRestAgeMs`? | **YES** (retention eligibility, C3 slope) |
| Requires provider-qualified source timestamp? | **YES** |
| Requires fixed 8h equality? | **NO** |

| Field | Value |
|-------|-------|
| `GENERALIZED_REST_DEPENDS_ON_LEGACY_TARGETS` | **NO** |
| `C3_DEPENDS_ON_LEGACY_TARGETS` | **NO** (inputs = `batteryGeneralizedEvidenceObservation`) |
| `D3_DEPENDS_ON_LEGACY_TARGETS` | **NO** (downstream of C3 / session features) |

---

## E. PS2 semantic flip trace (exact cases)

PS2 model: **canonical REST_60M target observation picker** on strict-rest `LIVE_VOLTAGE` rows per `LV_REST_WINDOW` session, with poll-delayed discovery.

| CASE_ID | VEHICLE | POLICY | CHANGED_ENTITY | CHANGED_FIELD | OLD → NEW | AUTHORITY_PATH | CONCLUSION_BEARING | CUSTOMER_REACHABLE |
|---------|---------|--------|----------------|---------------|-----------|----------------|--------------------|--------------------|
| 8ed99d69-B2 | WOB 192922 | B2 | REST_60M_TARGET_SELECTION | selectedSourceMeasurementId | `a517c64d…` → **null** | LEGACY_REST_60M_CANONICAL_TARGET_JOB | Opportunistic legacy | **NO** (M3.3 primary) |
| fe6ccd28-B2 | WOB 192922 | B2 | REST_60M_TARGET_SELECTION | selectedSourceMeasurementId | `a14eff52…` → **null** | LEGACY_REST_60M_CANONICAL_TARGET_JOB | Opportunistic legacy | **NO** |
| fe6ccd28-B4 | WOB 192922 | B4 | REST_60M_TARGET_SELECTION | selectedSourceMeasurementId | `a14eff52…` → **null** | LEGACY_REST_60M_CANONICAL_TARGET_JOB | Opportunistic legacy | **NO** |

Tooling: `backend/scripts/ops/p25-apd-ps2a-rest-flip-trace.mjs` → `/opt/cursor/artifacts/p25-apd-ps2a-flips.json`

**PS2 boundary flips (2 B2 / 1 B4)** align with these WOB sessions near REST_60M ±15m windows under poll-delay — not generalized-evidence class changes.

---

## F. Propagation test (per flip case)

| Consumer | Changes when REST_60M pick → null under B2/B4? |
|----------|-----------------------------------------------|
| LEGACY_MEASUREMENT_CHANGED | **YES** (would miss/pend REST_60M persist for that target) |
| GENERALIZED_EVIDENCE_CHANGED | **NO** |
| REST_SESSION (`BatteryRestSession`) | **NO** |
| C3_CHANGED | **NO** |
| D1/D2/D3_CHANGED | **NO** |
| E1/E3 assessment from **generalized** path | **NO** |
| E3 from **canonical REST_60M handoff** only | **POSSIBLE** if that session’s REST_60M row differed — parallel path, not M3.3 primary |
| CUSTOMER_OUTPUT_CHANGED (M3.3 primary) | **NO** (inferred: flips do not alter `actualRestAgeMs` observations already persisted) |

---

## G. Authority precedence (current)

1. **RAW SOURCE** — provider `provider_timestamp` / CH `recorded_at` (no fetch-time as source)
2. **REST EVIDENCE** — **M3.3 generalized observations** (`actualRestAgeMs` authority)
3. **REST SESSION** — `BatteryRestSession` open/close, anchor ENGINE_OFF
4. **FEATURE** — C3 from generalized ladder points
5. **LONGITUDINAL** — D3 from C3 + materialization flag
6. **ASSESSMENT / PUBLICATION** — E-handoff; may consume canonical REST_60M/6H **in parallel**
7. **REST_60M / REST_6H** — **opportunistic legacy targets** scheduled under `LvRestWindow` when `REST_SHADOW`; **not** primary for C3/D3
8. **Nominal 8h ladder** — metadata on generalized observations; **not** device upload schedule

---

## H. PS2 certification reinterpretation

| Policy | PS2 rejection (strict gate) | Valid for **M3.3 primary** Battery Intelligence? | Valid for **legacy REST target** compatibility? |
|--------|----------------------------|-----------------------------------------------------|--------------------------------------------------|
| B2 | REST_60M semantic + boundary | **NO** — 0 primary-path flips | **YES** — 2 target-selection flips (WOB) |
| B4 | REST_60M semantic + boundary | **NO** — 0 primary-path flips | **YES** — 1 flip |

**Do not certify B2/B4** (unchanged). **Re-scope PS2 blockers:** adaptive-polling certification should not treat REST_60M target-picker drift as **primary** M3.3 semantic failure without a separate **legacy/publication** gate.

---

## Required result block

```
P25_APD_PS2A_REST_AUTHORITY_RESULT=

REST_60M_CURRENT_DISPOSITION=OPPORTUNISTIC_LEGACY_TARGET
REST_6H_CURRENT_DISPOSITION=OPPORTUNISTIC_LEGACY_TARGET

REST_60M_PRIMARY_BATTERY_INTELLIGENCE_AUTHORITY=NO
REST_6H_PRIMARY_BATTERY_INTELLIGENCE_AUTHORITY=NO

GENERALIZED_REST_SESSION_PRIMARY_FOR_M3_3=YES
ACTUAL_REST_AGE_AUTHORITY=YES
NOMINAL_8H_LADDER_ACTIVE=YES_METADATA_ONLY
EXACT_8H_TARGET_EXISTS=NO

R1_NOMINAL_REST_CADENCE_HOURS=8
REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED=NO

GENERALIZED_REST_DEPENDS_ON_REST_60M=NO
GENERALIZED_REST_DEPENDS_ON_REST_6H=NO
C3_DEPENDS_ON_REST_60M_6H=NO
D3_DEPENDS_ON_REST_60M_6H=NO

PS2_B2_FLIP_COUNT=2
PS2_B2_CURRENT_AUTHORITY_IMPACT_COUNT=0

PS2_B4_FLIP_COUNT=1
PS2_B4_CURRENT_AUTHORITY_IMPACT_COUNT=0

PS2_B2_REJECTION_REASON_CURRENTLY_VALID=PARTIAL_MIXED_PATH
PS2_B4_REJECTION_REASON_CURRENTLY_VALID=PARTIAL_MIXED_PATH

LEGACY_PATH_STILL_PRODUCTION_RELEVANT=YES
LEGACY_PATH_CUSTOMER_REACHABLE=PARTIAL_ASSESSMENT_PUBLICATION_ONLY

PRODUCTION_CHANGE_PERFORMED=NO
BATTERY_V2_CHANGED=NO
POLLING_CHANGED=NO

BLOCKERS=PS2 gate conflates opportunistic REST_60M target picker with M3.3 primary; HMÜ LV; full TS consumer replay optional
EVIDENCE_SUMMARY=Production runs M3.3 generalized+C3+D3 with actualRestAgeMs authority; M3.1 REST capture off; canonical REST_60M/6H jobs still active but not C3/D3 inputs; PS2 flips are WOB-only legacy target selection (measurement id→null), zero M3.3 primary impact
NEXT_ACTION=Split APD certification gates: (1) M3.3 primary semantic, (2) legacy REST target/publication compatibility; re-run PS2 consumer section against generalized+C3 replay only
```
