# G2.2 Physical Refuel V2 — Production Post-Cutover T+60 Independent Audit

**Date:** 2026-09-04 (audit executed ~T+122m after cutover; final verification ~20:42Z)  
**Auditor mode:** READ-ONLY (no production mutation)  
**Cutover instant:** `2026-09-04T18:40:13.000Z`  
**Prior cutover audit (immutable):** `docs/audits/refuel-g22-production-cutover-2026-09-04.md`  
**Production deploy release:** `20260904183349_v4994`  
**Production deploy SHA:** `43c9ae6c546d01226c5ae113edd1d0f89f858e7e`  
**Epistemic status:** `DEPLOYED_TO_PRODUCTION` — **not** `PROVEN_IN_PRODUCTION` (no natural post-cutover REFUEL observed)

## 1. Deployment verification (independent)

| Field | Value |
|-------|-------|
| CURRENT_MAIN_SHA (repo) | `b1c38ab0c8d53c200039e2c829e2c384c002cfb4` |
| PRODUCTION_RUNNING_SHA_REPLICA_A | `43c9ae6c546d01226c5ae113edd1d0f89f858e7e` |
| PRODUCTION_RUNNING_SHA_REPLICA_B | `43c9ae6c546d01226c5ae113edd1d0f89f858e7e` |
| Release path | `/opt/synqdrive/releases/20260904183349_v4994` |
| Replica A | `synqdrive` :3001 — online, created `2026-09-04T18:40:14Z` |
| Replica B | `synqdrive-b` :3002 — online, created `2026-09-04T18:40:20Z` |
| Health :3001 / :3002 | `status=ok` |
| CRASH_LOOP since cutover | NO (stable ~116m+ uptime post-activation restart) |

### Runtime configuration (non-secret values)

| Variable | Value |
|----------|-------|
| PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED | `true` |
| PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED | `true` |
| PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT | `2026-09-04T18:40:13.000Z` |
| FUEL_STATION_ENRICHMENT_CUTOVER_AT | `2026-08-31T19:47:39.000Z` |
| PHYSICAL_REFUEL_ROUTE_EVIDENCE_STABILIZATION_MS | unset → code default 2h (INFERRED) |
| CUTOVER_TIMESTAMP_MATCH | **YES** |

Replicas agree on all refuel flags and cutover timestamps.

### Scheduler leader (global schedulers — distinct from G2.1d physical-refuel recovery)

| Field | Value |
|-------|-------|
| Redis leader key | `synqdrive:scheduler:leader` |
| Leader owner | `srv1374778:3175389:a957f267` (replica A PID) |
| SCHEDULER_LEADER_CONVERGED | **YES** (single leader acquired at 18:40:38Z) |

### Physical-refuel recovery (G2.1d — Redis-independent)

Both replicas emitted `physical_refuel_recovery_backlog` approximately once per minute throughout the audit window; observed counts were ~121 on replica A and ~122 on replica B. Recovery timer on replica A logged `leaderElection:"none_pg_vehicle_lock"`. No recovery vehicle failures.

## 2. Migration state (read-only)

All G2 migrations remain applied in `_prisma_migrations`:

| Migration | Applied |
|-----------|---------|
| `20260904120000_vehicle_energy_event_refuel_reconciliation` | YES |
| `20260904140000_physical_refuel_g21a_recovery` | YES |
| `20260904160000_physical_refuel_g21b_coordinate_retry` | YES |
| `20260904180000_physical_refuel_g21c_evidence_fingerprint` | YES |
| `20260904193000_physical_refuel_g21d_route_evidence_stabilization` | YES |

G2.1d columns verified: `route_evidence_fingerprint`, `route_evidence_stabilization_until`, `coordinate_evidence_fingerprint`.

No `prisma migrate deploy` executed during this audit.

## 3. Production health since cutover

Log scan window: `2026-09-04T18:40:13Z` → audit time (~20:42Z).

| Pattern | Replica A | Replica B |
|---------|-----------|-----------|
| `physical_refuel_reconciliation_failed` | 0 | 0 |
| `physical_refuel_recovery_vehicle_failed` | 0 | 0 |
| Advisory lock / deadlock / lock timeout | 0 | 0 |
| Physical refuel errors (error logs) | 0 | 0 |
| `physical_refuel_recovery_backlog` emissions | ~121 | ~122 |

**PHYSICAL_REFUEL_ERRORS_SINCE_CUTOVER = 0**

Infrastructure: PostgreSQL and Redis reachable on localhost from VPS. BullMQ refuel enrichment queue: waiting=0, active=0, delayed=0, failed=0, completed=3 (all pre-cutover events).

## 4. Post-cutover REFUEL population

Canonical boundary: `vehicle_energy_events.created_at >= 2026-09-04T18:40:13Z`

| Metric | Value |
|--------|-------|
| TOTAL_POST_CUTOVER_REFUEL_EVENTS | **0** |
| TOTAL_POST_CUTOVER_RECONCILIATION_ROWS | **0** |
| Post-cutover enrichments | **0** |

No natural REFUEL has occurred since activation. **This is not a failure.**

## 5. Missing-reconciliation safety

| Check | Count |
|-------|-------|
| Orphan post-cutover REFUELs (no reconciliation row) | 0 |
| Overdue orphans (>30 min, no reconciliation) | 0 |

## 6. Settlement / finality liveness

| Metric | Value |
|--------|-------|
| PROVISIONAL_TOTAL | 0 |
| SETTLING_TOTAL | 0 |
| DUE_FOR_RECONCILIATION_TOTAL | 0 |
| OVERDUE_STUCK_TOTAL | 0 |

Recovery scans report zero backlog across all categories (provisional, settling, lost enqueue, orphan, stale enrichment, coordinate holds).

## 7. Legacy recovery bypass check

| Check | Result |
|-------|--------|
| Post-cutover V2 REFUELs enriched via legacy path | N/A (0 events) |
| `enrichment_eligible=false` with enrichment row (post-cutover) | 0 |
| Pre-cutover events mass-enriched after cutover | 0 |

**LEGACY_RECOVERY_G2_BYPASS_OBSERVED = NO**

## 8. Segment-start authority check

| Check | Result |
|-------|--------|
| Post-cutover reconciliations with segment-start coordinate source | 0 |
| SEGMENT_START in logs since cutover | 0 |

**SEGMENT_START_USED_AS_V2_COORDINATE_AUTHORITY = NO**

## 9. BullMQ / recovery health

| Metric | Value |
|--------|-------|
| Queue failed (refuel station enrich) | 0 |
| Queue waiting/active/delayed | 0 |
| Deterministic job keys in Redis | 3 (all pre-cutover COMPLETED enrichments) |
| LOGICAL_DUPLICATE_JOB_OBSERVED | NO |
| DUPLICATE_ENRICHMENT_OBSERVED | NO |
| RECOVERY_STORM_OBSERVED | NO |

## 10. Multi-replica production behavior (observational)

- Both replicas healthy on same deploy SHA.
- Global scheduler leader: single owner on replica A.
- Both replicas independently run physical-refuel recovery backlog scans (G2.1d design — no Redis leader on this scheduler).
- No advisory lock errors observed.
- No duplicate logical BullMQ jobs observed.

## 11. Pre-cutover ownership boundary

| Check | Result |
|-------|--------|
| Pre-cutover events reconciled after cutover | 0 |
| Reconciliation rows updated after cutover (any age) | 0 |

**HISTORICAL_MASS_REPLAY_OBSERVED = NO**

## 12. Natural REFUEL conclusion

No post-cutover REFUEL exists. Per audit policy:

| Field | Value |
|-------|-------|
| PRODUCTION_RUNTIME_STABILITY | **PASS** |
| PRODUCTION_REFUEL_V2_OBSERVED | **NO** |
| PRODUCTION_REFUEL_V2_VALIDATED | **NO** |

Watch vehicle **KS MX 2024** remains the intended first natural validation target.

## 13. Emergency kill-switch

**PRODUCTION_ROLLBACK_TRIGGERED = NO**

No hard safety invariant violations detected. Kill-switch not invoked.

## 14. Blockers

| Severity | Count | Detail |
|----------|-------|--------|
| P0 | 0 | — |
| P1 | 0 | — |

## 15. Second-pass skeptical review

Re-verified: zero post-cutover REFUEL population, zero reconciliation/enrichment anomalies, zero physical-refuel errors, no legacy bypass evidence, no segment-start authority usage, no historical mass replay, scheduler leader converged, both replicas on expected SHA, migrations intact.

Empty error grep alone would be insufficient; correlated DB state + structured backlog logs + queue inspection support the PASS stability verdict.

## 16. Canonical evidence nodes

- **FST:** `FST-EVID-G22-PRODUCTION-POST-CUTOVER-T60-2026-09-04-001` (`source_type: PRODUCTION_OBSERVATION`; validates cutover only — no forecourt-dwell decision edge)
- **EED:** `EED-EV-0039` (`source_type: PRODUCTION`, `epistemic_status: HISTORICAL` per EED validator ontology for time-bounded production snapshots; facts are directly confirmed by read-only VPS/DB/log/queue inspection)

Cross-reference: `FST-EVID-G22-PRODUCTION-CUTOVER-2026-09-04-001`, `EED-EV-0038`.

## 17. Final gate

**G2_2_POST_CUTOVER_T60_AUDIT = PASS**

Runtime stability PASS with zero natural REFUELs. Business-path production validation remains pending first natural event.
