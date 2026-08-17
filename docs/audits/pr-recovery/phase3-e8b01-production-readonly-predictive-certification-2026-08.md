# Phase 3 E8B0.1 — Production Read-Only Predictive Certification (2026-08)

## E8B0.1 CORRECTIVE EMPIRICAL CERTIFICATION

Corrects E8B0 synthetic-only gaps, evidence inconsistencies, non-detecting leakage tests, and target semantic overreach. **No runtime implementation.**

Machine artifact (canonical): `docs/audits/ci-recovery/data/e8b01-production-readonly-predictive-certification-2026-08.json`  
Harness: `docs/audits/ci-recovery/tooling/e8b01_predictive_certification.py`  
Production remote SQL: `docs/audits/ci-recovery/tooling/e8b01_production_readonly_remote.py`

---

## 1. Entry state

| Field | Value |
|-------|-------|
| E8B01_ENTRY_HEAD_SHA | `e957b9fe1549e23dc20bffe3ee1dec993c69a587` |
| E8B01_FINAL_HEAD_SHA | `ab633ddd4b5f3c87dcd96ae3662af32f9e9080c2` |
| COMMIT_SHA | `ab633ddd4b5f3c87dcd96ae3662af32f9e9080c2` |
| CURRENT_MAIN_SHA | `bd732a8f7a6467565a8668ea136e81b79a04666a` |
| PR | **#1056** OPEN, Draft, base `main` |
| Commits after `7411251` | `e957b9fe` (E8B0 PR number doc) |

Ancestors verified: `9501a985` (E8A), `7411251` (E8B0 harness fix).

---

## 2. E8B0 evidence reconciliation

| Issue | Resolution |
|-------|------------|
| QUALIFYING_LABEL_COUNT 5 (md) vs 4 (json) | **Resolved** — canonical count = rows with `downtime_start NOT NULL` and not cancelled-only; markdown value 5 was wrong |
| ServiceCaseSource “8 values” | **Corrected** — `SERVICE_CASE_SOURCE_ENUM_COUNT=7` |
| Markdown/json drift | **Resolved** — this document derives tables from JSON artifact only |

`QUALIFYING_LABEL_COUNT_CONTRADICTION_RESOLVED=true`  
`MARKDOWN_JSON_VALUE_MISMATCHES=0`

---

## 3. Leakage harness correction

Removed non-detecting patterns (`future_feature_rows += 0`, impossible `opened_at` branches).

### Adversarial sentinels (10 scenarios)

Cutoff-boundary fixtures, horizon-label isolation, post-cutoff `downtimeStart` / `blocksRental` / `status` mutation rejection, station/E7/booking non-features — all pass.

### Mutant sensitivity (mandatory)

| Mutant | Broken behavior | Genuine | Mutant | Detected |
|--------|-----------------|---------|--------|----------|
| A | omits `openedAt <= cutoff` | 2 | 3 | yes |
| B | horizon rows in feature window | 2 | 3 | yes |
| C | current `blocksRental` + no cutoff bound | 2 | 3 | yes |

`LEAKAGE_TEST_SENSITIVITY_PROVEN=true`  
`TARGET_LEAKAGE_TEST_FAILURES=0`  
`FUTURE_FEATURE_ROWS=0`  
`FEATURE_LABEL_WINDOW_OVERLAP=0`

---

## 4. Target semantic closure (E8B0 POST-E8A correction)

| Option | Verdict |
|--------|---------|
| A `FLEET_NEW_BLOCKING_MAINTENANCE_DISRUPTION` | **Rejected** — no canonical maintenance subset; DAMAGE ≠ maintenance |
| B `FLEET_NEW_BLOCKING_SERVICE_CASE_DISRUPTION` | **Rejected** — `blocksRental`/`status` mutable without field history |
| C `FLEET_NEW_SERVICE_CASE_DOWNTIME_DISRUPTION` | **Selected** |
| D `NO_CERTIFIED_TARGET` | Not required |

**Certified target:** `FLEET_NEW_SERVICE_CASE_DOWNTIME_DISRUPTION`

**Label meaning:** `EVENT_TRUTH_WITHIN_HORIZON` (not eventual post-hoc finalization on mutable fields)

**Label predicate:**

```
openedAt > predictionAsOf AND openedAt <= horizonEnd
AND downtimeStart > predictionAsOf AND downtimeStart <= horizonEnd
```

**Excluded from label:** `blocksRental`, `status`, maintenance naming  
**Ambiguous:** opened in horizon but `downtimeStart` null and not cancelled → **not negative**

`TARGET_NAME_MATCHES_EXACT_LABEL_SEMANTICS=true`

---

## 5. Label maturity

| Field | Label use | Notes |
|-------|-----------|-------|
| openedAt | AUTHORIZED | immutable event timestamp |
| downtimeStart | AUTHORIZED_WITH_AMBIGUOUS_WINDOWS | may be backfilled; ambiguous windows excluded from negative |
| blocksRental | FORBIDDEN | no PIT history |
| status | FORBIDDEN | no PIT history |

Prior E8B0 rule `labelFinalizationAt=max(horizonEnd, observationEnd)` on mutable fields **rejected**.

---

## 6. Production read-only empirical audit

| Guard | Value |
|-------|-------|
| Production read-only used | **yes** |
| `SHOW transaction_read_only` | **on** (single-session batch) |
| Production mutations | **0** |
| Raw IDs exported | **no** (aggregates only in artifact) |

### Observation window (real Production)

| Metric | Value |
|--------|-------|
| OBSERVATION_START | null (no ServiceCase rows) |
| OBSERVATION_END | null |
| ORGANIZATION_COUNT | **4** |
| VEHICLE_COUNT | **9** |
| SERVICE_CASE_COUNT | **0** |
| EARLIEST_SERVICE_CASE_OPENED_AT | null |
| LATEST_SERVICE_CASE_OPENED_AT | null |

### Field coverage (ServiceCase table empty)

All distributions empty; `QUALIFYING_EVENT_COUNT=0`.

---

## 7. Real label / horizon certification

With zero ServiceCase history:

| Horizon | SAMPLE_COUNT | POSITIVE_COUNT | VAL+TEST positives |
|---------|--------------|----------------|--------------------|
| NEXT_7_DAYS | 0 | 0 | 0 |
| NEXT_30_DAYS | 0 | 0 | 0 |
| NEXT_90_DAYS | 0 | 0 | 0 |

`AMBIGUOUS_LABEL_AS_NEGATIVE_COUNT=0`  
`RIGHT_CENSORED_WINDOWS_TREATED_AS_NEGATIVE=0`

**Recommended horizon:** `NONE` (no empirical support on Production today)

---

## 8. PIT feature certification (real schema)

| Feature | SAFE_FOR_MODEL |
|---------|----------------|
| trailing_open_case_count_90d | yes |
| fleet_vehicle_count | yes (denominator uncertainty documented) |

`UNSUPPORTED_PIT_FEATURE_COUNT=0`

---

## 9. Threshold study

`RISK_CATEGORY_THRESHOLD_AUTHORITY=INSUFFICIENT_EMPIRICAL_SUPPORT`  
No threshold selected; TEST untouched.

---

## 10. Outcome — BLOCKED (real data insufficient)

```
CI_E8B01_PRODUCTION_READONLY_CERTIFICATION_BLOCKED
E8B_READINESS = NOT_READY
```

### Blockers

- `INSUFFICIENT_REAL_POSITIVE_LABELS`
- `NO_VALIDATION_SUPPORT`
- `NO_TEST_SUPPORT`

### Completed corrections

- `LEAKAGE_HARNESS_AUTHORITY=SENSITIVITY_PROVEN`
- Target semantic closure to `FLEET_NEW_SERVICE_CASE_DOWNTIME_DISRUPTION`
- Production read-only certification executed (`transaction_read_only=on`)

### Still frozen (E8A/E8B0)

- eventProbability / numeric confidence: **NOT_AUTHORIZED**
- estimatedExposure: **DEFERRED_INSUFFICIENT_AUTHORITY**
- E7 features / driver features / station scope: **excluded**

---

## 11. Runtime guard

| Guard | Value |
|-------|-------|
| E8_RUNTIME_CHANGED | false |
| PRISMA_CHANGED | false |
| MIGRATIONS_CHANGED | false |
| DEPENDENCY_GRAPH_CHANGED | false |
| Production mutations | **0** |

---

## 12. Next steps

E8B runtime remains blocked until:

1. Production (or representative staging) accumulates sufficient ServiceCase history with observable downtime labels, **and**
2. Explicit product approval for horizon + ELEVATED/NORMAL policy when empirical support exists.

PR **#1056** remains **Draft**.
