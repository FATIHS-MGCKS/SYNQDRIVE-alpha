# M3.3F F4.1 — Race-safe bounded D3 reconciliation engineering

**Date:** 2026-09-27  
**Mode:** Engineering + **pre-merge correctness hardening** — **no production deploy**, **no D3 activation**, **no `F_D3_T0`**, **no backfill**  
**PR:** #1806  
**Post-hardening base main (rebase):** resolve at execution time (e.g. `8ce2ee8e1313bc39dd7bc1e866b1da75ba5e9201`)

## Pre-merge review defects (corrected in hardening)

| Defect | Symptom | Fix |
|--------|---------|-----|
| **Ack version scope** | Ack lookup ignored D2/D3 contract/policy → old policy ack could suppress new target materialization | Fence identity includes **profile contract + profile policy** aligned with current D2 constants |
| **Same science / new source evidence** | Metadata mirror on revision `sourceEvidenceFingerprint` → drift on EXISTING scientific rows | Separate ack fence; ack on CREATED/EXISTING; revision column is creation provenance only |
| **Bounded prefilter starvation** | `ORDER BY MIN(computed_at) LIMIT oversample` fixed prefix never inspects later stale vehicles | **Keyset fleet cursor** + wrap (`battery_longitudinal_reconciliation_fleet_cursor`); scan touch table; staleness = live fingerprint **not acked** |
| **Snapshot isolation mismatch** | Candidate fingerprint used ReadCommitted multi-read | **`RepeatableRead`** (`LONGITUDINAL_INPUT_SNAPSHOT_ISOLATION`) — same as D1 `readInventory` |

## Rejected naive candidate / freshness rules

| Rule | Verdict |
|------|---------|
| Candidate discovery **VALID-only** C3 filter | **REJECTED** — `INVALIDATED` canonical rows change D1 scientific input |
| Freshness = `MAX(C3.created_at) > MAX(D3.materialized_at)` alone | **REJECTED** — lost-update race |
| Freshness = latest D3 revision `sourceEvidenceFingerprint` alone | **REJECTED** — same-science/new-evidence defect (see above) |

## Durable freshness authority (final)

| Field | Value |
|-------|-------|
| `D3_FRESHNESS_AUTHORITY_PREVIOUS` | `BatteryLongitudinalProfileRevision.sourceEvidenceFingerprint` (audit on revision row only — **not** canonical fence) |
| `D3_FRESHNESS_AUTHORITY_FINAL` | **`battery_longitudinal_source_evidence_acks`** — unique `(organization_id, vehicle_id, source_evidence_fingerprint, longitudinal_profile_contract_version, profile_policy_version)` |
| `FRESHNESS_FENCE_SEPARATE_FROM_SCIENTIFIC_REVISION` | **YES** |
| `SCIENTIFIC_UNIQUENESS_UNCHANGED` | **YES** — D3 scientific unique index unchanged |
| `APPEND_ONLY_D3_SEMANTICS_PRESERVED` | **YES** — no in-place rewrite of historical D3 rows |
| `D3_FRESHNESS_AUTHORITY_RACE_SAFE` | **Claim only after exact-head Postgres + CI** — not asserted in doc alone |
| `LOST_UPDATE_RACE_CLOSED` | **Claim only after exact-head Postgres + CI** |

**Candidate discovery**

| Field | Value |
|-------|-------|
| `CANDIDATE_SELECTION_SCOPE` | **Bounded keyset fleet inspection window** per tick (`oversample` vehicles after durable fleet cursor, with wrap) |
| `CANDIDATE_ORDER_WITHIN_INSPECTION_WINDOW` | Stale candidates sorted by **`MAX(computed_at)`** (outstanding change proxy) ascending within the returned batch |
| `GLOBAL_OLDEST_OUTSTANDING_GUARANTEED` | **NO** — not a global priority queue |
| `BOUNDED_FAIR_EVENTUAL_LIVENESS` | **YES** — fleet cursor wrap + ack fence; no fixed-prefix starvation |
| `CANDIDATE_C3_VERSION_SCOPE` | `M3_3C_C3_V1` + `M3_3C_C1_V1` + `M3_3C_C2_V1` |
| `CANDIDATE_C3_TRUST_FILTER` | **NO VALID-only filter** |

**D4 inspect (read-only)**

| Field | Value |
|-------|-------|
| `D4_REVISION_SOURCE_FP` | Exposed as **`creationSourceEvidenceFingerprint`** with authority `NON_AUTHORITATIVE_CREATION_PROVENANCE` |
| `D4_ACK_AUTHORITY` | **`sourceEvidenceAcknowledgements`** + `ackCount` from `battery_longitudinal_source_evidence_acks` |

**Removed durable state**

| Table | Reason |
|-------|--------|
| `battery_longitudinal_reconciliation_vehicle_scans` | **Removed** — `lastScanAt` had no consumer; eliminated per-tick write amplification |

## Schema

| Migration | Purpose |
|-----------|---------|
| `20260927120000_battery_longitudinal_profile_source_evidence_fingerprint` | Optional audit column on D3 revisions (not freshness fence) |
| `20260927140000_battery_longitudinal_reconciliation_freshness_authority` | Acks + fleet cursor + vehicle scan fairness |

## Runtime

| Component | Detail |
|-----------|--------|
| Scheduler | `battery_v2_longitudinal_materialization_reconciliation` — leader → D3 flag → overlap → bounded candidates → gated facade |
| Config | `BATTERY_V2_LONGITUDINAL_RECONCILIATION_*` |
| Flag OFF | **0** candidate DB reads / D1 reads / D3 writes |
| CI Postgres | `.github/workflows/battery-v2-longitudinal-postgres-ci.yml` → `npm run test:battery:v2:longitudinal-reconciliation:postgres` |

## F4.1 test matrix A–U (classification)

| ID | Case | Status |
|----|------|--------|
| A | D1_REJECTED — no D3 write | **IMPLEMENTED_AND_EXECUTED** (`longitudinal-profile-materialization.service.spec`) |
| B | D2_REJECTED — no D3 write | **IMPLEMENTED_AND_EXECUTED** |
| C | CREATED orchestration | **IMPLEMENTED_AND_EXECUTED** |
| D | EXISTING propagation | **IMPLEMENTED_AND_EXECUTED** |
| E | profileGeneratedAt forwarded | **IMPLEMENTED_AND_EXECUTED** |
| F | Flag OFF — zero work | **IMPLEMENTED_AND_EXECUTED** (`longitudinal-reconciliation.service.spec`) |
| G | Non-leader — zero work | **IMPLEMENTED_AND_EXECUTED** (`battery-v2-longitudinal-materialization-reconciliation.scheduler.spec`) |
| H | Overlap skip | **IMPLEMENTED_AND_EXECUTED** |
| I | No candidates — zero materialize | **IMPLEMENTED_AND_EXECUTED** |
| J | One candidate — one facade call | **IMPLEMENTED_AND_EXECUTED** |
| K | Batch cap | **IMPLEMENTED_AND_EXECUTED** |
| L | Multi-org identity | **IMPLEMENTED_AND_EXECUTED** |
| M | ERROR isolation | **IMPLEMENTED_AND_EXECUTED** |
| N | D1/D2 rejected isolation | **IMPLEMENTED_AND_EXECUTED** |
| O | CREATED ack fence | **IMPLEMENTED_AND_EXECUTED** |
| P | EXISTING ack fence (same-science) | **IMPLEMENTED_AND_EXECUTED** + **Postgres** |
| Q | Lost-update race | **Postgres** (`longitudinal-reconciliation.integration`) |
| R | INVALIDATED stale | **Postgres** |
| S | Fleet > oversample starvation | **Postgres** |
| T | Snapshot isolation RR | **Postgres** |
| U | Out-of-order completion | **Postgres** |
| — | Malformed config matrix | **IMPLEMENTED_AND_EXECUTED** (`longitudinal-reconciliation.config.spec`) |
| — | Scheduler + ops concurrency | **Postgres** (`scheduler vs ops` integration case) |
| — | Leader turnover mid-tick overlap | **Postgres** (concurrent ticks + dual materialize) |

## Validation commands

```bash
cd backend && npm test -- longitudinal-reconciliation
cd backend && npm test -- battery-v2-longitudinal-materialization-reconciliation.scheduler
cd backend && npm run test:battery:v2:longitudinal-reconciliation:postgres  # ephemeral Postgres
cd backend && npm run build
bash architecture/scripts/validate-module-registry.sh
bash architecture/battery-v2/scripts/validate-graph.sh
```

## Activation stance

| Field | Value |
|-------|-------|
| `D3_FLAG_DEFAULT` | **OFF** |
| `D3_PRODUCTION_ACTIVATED` | **NO** |
| `F_D3_T0_ASSIGNED` | **NO** |
| `BACKFILL_EXECUTED` | **NO** |

**Do not mark `F4.1 COMPLETE` until PR exact-head CI is green on Postgres reconciliation suite.**
