# M3.3G G4 — First natural Ground Truth validation evidence (preparation audit)

**Date:** 2026-09-29  
**Repository authority:** `origin/main` @ **`1dd4224037a84417c5d605575bb6d288ac93184e`** (PR **#1842** merged — G3 / G3.1 / G3.1.1)  
**Mode:** Audit / evidence gathering only — **no** G4 runtime, **no** deploy, **no** production writes, **no** synthetic GT

## G4 objective (allowed proof scope)

Observe the **first naturally occurring admissible Ground Truth** and determine whether it can **scientifically validate or falsify parts** of the Battery V2 longitudinal evidence pipeline (D3 / F5 / G3 correlation semantics).

G4 is **not** threshold calibration, health scoring, failure prediction, causal proof, customer publication, model training, automatic replacement detection, synthetic validation, or F6.

## Pre-registered validation questions (before data review)

These questions were fixed **before** production inspection:

| ID | Question |
|----|----------|
| **Q1** | Does any admissible natural **WORKSHOP_MEASUREMENT** GT exist? |
| **Q2** | Does any admissible natural **BATTERY_REPLACEMENT** GT exist? |
| **Q3** | For each GT row, is matching longitudinal D3/F5 evidence available for the same organization, vehicle, batteryScope, and relevant temporal region? |
| **Q4** | For replacement GT, is there usable **PRE_EVENT** evidence? |
| **Q5** | Is there usable **POST_EVENT** evidence? |
| **Q6** | Does any revision intersect `effectiveAt` and therefore classify as **INTERVENTION_WINDOW**? |
| **Q7** | Does G3 segmentation correctly prevent old/new physical battery histories from being pooled? |
| **Q8** | For workshop measurements, can existing telemetry-derived evidence be compared to the independent measurement **without changing thresholds**? |
| **Q9** | For replacement events, is there a descriptive longitudinal step/change around the confirmed intervention? |
| **Q10** | Are there contradictions or unexpected observations that challenge current Battery V2 assumptions? |

## Pre-registered G4 natural-evidence maturity states (data availability only)

Conservative labels — **not** calibration maturity:

| State | Meaning |
|-------|---------|
| `NO_NATURAL_GT` | No proven natural admissible GT at observation time |
| `GT_PRESENT_NO_LONGITUDINAL_MATCH` | GT exists but no D3/F5 match for scope/time |
| `GT_PRESENT_PRE_ONLY` | PRE_EVENT evidence only |
| `GT_PRESENT_POST_ONLY` | POST_EVENT evidence only |
| `GT_PRESENT_INTERVENTION_ONLY` | INTERVENTION_WINDOW only |
| `GT_PRESENT_PRE_AND_POST` | Both PRE and POST |
| `GT_PRESENT_WORKSHOP_COMPARABLE` | Workshop row with at least one DIRECTLY_COMPARABLE or TRANSFORMABLE_WITH_DOCUMENTED_RULE quantity |

**Forbidden automatic promotion from counts:** `DISTRIBUTION_VISIBLE`, `REPEATABILITY_VISIBLE`, `CALIBRATION_CANDIDATE`, `VALIDATED`.

**NAT-008 / NAT-009 contract (unchanged unless G4 establishes new validated maturity — it does not):**

- `infrastructureStatus = IMPLEMENTED` (on main after G1–G3)
- `naturalEvidenceStatus = NONE | PRESENT` (production observation below)
- `validationSampleMaturity = NOT_EVALUATED`

**CAL-007:** remains **non-causal**; telemetry must not be treated as proof of replacement or defect.

---

## Observed data (read-only production)

### Production access guard

| Field | Value |
|-------|-------|
| `PRODUCTION_READ_ONLY` | **YES** — `BEGIN READ ONLY`; `SHOW transaction_read_only` → **`on`** |
| `PRODUCTION_DB_WRITES` | **NO** |
| Access path | VPS `srv1374778.hstgr.cloud` via `synqdrive-admin` + `sudo` sourced `/opt/synqdrive/shared/backend.env`; `psql` against `DATABASE_URL` with query string stripped (Prisma `schema=` param) |
| Production deploy (observed) | Release **`20260928175908_v4994`** @ git **`6952fdf727f236ac7b338e14b85d54af6733fa0f`** — **behind** authoritative main **`1dd422403`** (G3 merge not on this deploy) |

### Ground Truth persistence surface

| Finding | Evidence |
|---------|----------|
| `battery_ground_truth_events` | **Relation does not exist** on production PostgreSQL (`ERROR: relation "battery_ground_truth_events" does not exist`) |
| `pg_tables` `%ground_truth%` (battery) | **0** battery GT tables (only unrelated tire provenance migration name in history) |
| Implication | **G1 append-only GT schema has not been applied on production** as of this audit; repository main contains migrations + services, but **production DB has zero GT rows** |

### Inventory @ current observation (`asOf` ≈ **2026-09-29**, present-tense + would-be G3.1.1 historical)

| Metric | Count |
|--------|------:|
| `TOTAL_GT_ROWS` | **0** (table absent → effective zero) |
| `ACTIVE_ADMISSIBLE_GT_ROWS` | **0** |
| `WORKSHOP_MEASUREMENT_ACTIVE` | **0** |
| `BATTERY_REPLACEMENT_ACTIVE` | **0** |
| `LV_ACTIVE` | **0** |
| `HV_ACTIVE` | **0** |
| `REVOKED_EXCLUDED` | **0** |
| `SUPERSEDED_EXCLUDED` | **0** |
| `AFFECTED_ORGANIZATION_COUNT` | **0** |
| `AFFECTED_VEHICLE_COUNT` | **0** |

### Naturality / test-data guard

| Field | Value |
|-------|-------|
| `SYNTHETIC_OR_TEST_GT_EXCLUDED` | **0** (no rows to classify) |
| `UNKNOWN_PROVENANCE_GT_COUNT` | **0** |
| `NATURAL_GT_PROVEN` | **NO** — no production GT persistence; naturality cannot be established |

**Exclusion rules (pre-registered, for future rows):** Postgres CI fixtures (`companyName` prefix `GT `, `gt-actor-*@example.com`), manual validation inserts, synthetic backfills, G1/G2/G3 test emissions — must not count as natural evidence.

### F5 / D3 correlation (LV pipeline)

Full **`M3_3F_F5_NATURAL_CALIBRATION_REPORT_V2`** + G3 correlation block **not executed on production** in this audit because:

1. Production deploy lacks G3 report scripts / contract V2 at observed SHA, and  
2. GT query surface is absent.

Aggregate correlation counters @ zero GT:

| Metric | Count |
|--------|------:|
| `GT_WITH_ANY_LONGITUDINAL_MATCH` | **0** |
| `GT_WITH_PRE_EVENT_EVIDENCE` | **0** |
| `GT_WITH_POST_EVENT_EVIDENCE` | **0** |
| `GT_WITH_PRE_AND_POST_EVIDENCE` | **0** |
| `GT_WITH_INTERVENTION_WINDOW_EVIDENCE` | **0** |
| `GT_WITH_NO_LONGITUDINAL_MATCH` | **0** |
| `WORKSHOP_GT_COMPARABLE_COUNT` | **0** |
| `REPLACEMENT_GT_COMPARABLE_COUNT` | **0** |
| `POST_PENDING_COUNT` | **0** |
| `HV_F5_CORRELATION_STATUS` | **`NOT_APPLICABLE_TO_CURRENT_LV_PIPELINE`** (no HV GT rows) |

**Segmentation on natural GT:** **not observable** (`SEGMENT_BOUNDARY_VALIDATED_ON_NATURAL_GT=NOT_APPLICABLE`; `PRE_POST_POOLING_BLOCKED_ON_NATURAL_GT=NOT_APPLICABLE`). G3.1 unit/postgres seals on main remain engineering authority until natural replacement GT exists in production.

### Contradictory / negative evidence

| Field | Value |
|-------|-------|
| `CONTRADICTORY_GT_CASE_COUNT` | **0** (no GT cases) |
| `CONTRADICTION_CLASSIFICATIONS` | **NONE** |

**Architecture note (not a GT contradiction):** Production longitudinal D3 shadow remains active from prior M3.3F tranche while **GT ingestion tables are missing** — expected given documented **no production deploy** for G1/G2/G3 engineering tranche; not interpreted as pipeline logic failure.

---

## Interpretation (post-hoc, separate from pre-registration)

| Question | Answer @ this audit |
|----------|---------------------|
| Q1 | **No** |
| Q2 | **No** |
| Q3–Q9 | **Not evaluable** — no admissible natural GT |
| Q10 | **No GT-level contradictions**; **data gap**: GT persistence not on production DB |

**G4 natural-evidence maturity state:** **`NO_NATURAL_GT`**

**NAT-008 / NAT-009 @ production observation:**

| | infrastructure | natural evidence | validation sample |
|--|----------------|------------------|-------------------|
| NAT-008 | **IMPLEMENTED** (main code) | **NONE** (production) | **NOT_EVALUATED** |
| NAT-009 | **IMPLEMENTED** (main code) | **NONE** (production) | **NOT_EVALUATED** |

---

## Limitations

- Production deploy SHA **≠** authoritative main **`1dd422403`**; GT migrations and F5 V2 correlation CLI may be unavailable until a authorized deploy includes G1–G3.
- Agent environment cannot reach PostgreSQL **5432** directly; audit used **on-VPS** read-only `psql` only.
- No vehicle identifiers recorded in this document (privacy-safe aggregates only).
- Zero GT is a **valid PASS** for G4 preparation — it does **not** validate or falsify longitudinal science; it establishes **wait** for natural workshop/replacement capture after GT persistence is live.

---

## Decision gate

```
G4_DECISION=WAIT_FOR_NATURAL_GT
```

| Field | Value |
|-------|-------|
| `G4_BLOCKERS` | (1) Production DB lacks `battery_ground_truth_events`; (2) zero natural GT rows; (3) production deploy behind G3 merge — F5↔GT correlation not runnable on prod at observed SHA |
| `RECOMMENDED_NEXT_ACTION` | When authorized: deploy G1–G3 to production **without** activating E3 or F6; continue natural D3/F5 cohort-**C** collection; after first **CONFIRMED** natural GT emission, re-run G4 read-only inventory + bounded F5 V2 report with `BATTERY_F5_ALLOW_PRODUCTION_READONLY=true` |
| `NEW_SCHEMA` | **NO** (audit) |
| `NEW_MIGRATION` | **NO** |
| `RUNTIME_CHANGE` | **NO** |
| `PRODUCTION_DEPLOY` | **NO** |
| `E3_RUNTIME_ACTIVATED` | **NO** |

---

## Upstream phase completion (repository main @ `1dd422403`)

Engineering status on **`origin/main`** (code is authority where docs lag). **Production** @ `6952fdf` has **not** deployed this tranche — do **not** label G3 **PRODUCTION_VALIDATED**.

| Phase | Main repo | Production @ `20260929224455_v4994` |
|-------|-----------|----------------------------------------|
| G1 | **MERGED** · **CI_VALIDATED** | **PRODUCTION_DEPLOYED** · **PRODUCTION_VERIFIED** (schema) |
| G2 / G2.1 / G2.2 | **MERGED** · **CI_VALIDATED** | **PRODUCTION_DEPLOYED** · **PRODUCTION_VERIFIED** (emission paths live) |
| G3 / G3.1 / G3.1.1 | **MERGED** · **CI_VALIDATED** | **PRODUCTION_DEPLOYED** · **PRODUCTION_VERIFIED** (F5 V2 CLI; **0** natural GT) |
| G4 science | **`NATURAL_GT_PRESENT=NO`** | **`G4_COLLECTION_INFRASTRUCTURE_READY=YES`** — see `M3_3G_G4_PRODUCTION_DEPLOY_VERIFICATION_2026-09-29.md` |

```
M3_3G_G4_PREPARATION_AUDIT_RESULT=PASS
G4_PRE_REGISTERED_BEFORE_DATA_REVIEW=YES
CAL007_CAUSALITY_INTRODUCED=NO
```
