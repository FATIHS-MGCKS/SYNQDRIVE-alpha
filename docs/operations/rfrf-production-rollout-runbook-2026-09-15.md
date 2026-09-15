# RFRF production rollout operator runbook

**Workstream:** Raw Fuel Refuel Fallback (RFRF)  
**Phase:** F10 — production rollout (operational)  
**Date:** 2026-09-15 (F10.1.1 micro-closure appended)
**Evidence:** EED-EV-0062 (F9 independent-replica integration), EED-EV-0063 (F10.1 + F10.1.1 operational tooling)

---

## 1. Purpose and scope

This runbook governs **staged, fail-closed production enablement** of the RFRF raw-fuel fallback path already implemented in F1–F9. It does **not** change detector, convergence, promotion, or G2 runtime semantics.

**In scope:** deploy verification, schema checks, flag staging, metrics/alerts verification, blast-radius assessment, rollback.  
**Out of scope:** historical backfill, DIMO/provider changes, org/vehicle canary scoping (not supported in current flag architecture).

---

## 2. Prerequisites (F1–F9)

| Phase | Proof |
|-------|-------|
| F2 | `raw_refuel_candidates` schema + migration |
| F4 | Dark runtime wiring + `detectionSource` / `sourceEventKey` |
| F5 | Convergence + atomic promotion + G2 handoff authorities |
| F7 | Recovery completeness + multi-replica PG/Redis |
| F8 | RFRF + Physical Refuel recovery metrics + alert rules in repo |
| F9 | Independent-replica integration (EED-EV-0062) |

---

## 3. Production topology requirements

### 3.1 Runtime topology (F9-equivalent)

| Requirement | Expected |
|-------------|----------|
| Application replicas | **2** (`synqdrive` :3001, `synqdrive-b` :3002) |
| PostgreSQL | Shared; advisory locks authoritative |
| Redis / BullMQ | Shared; workers enabled when Redis healthy at bootstrap |
| Prisma/runtime stacks | Independent per replica (process boundary) |

**Verdict field:** `PRODUCTION_RUNTIME_TOPOLOGY_MATCHES_F9`

### 3.2 Observability topology (separate)

Prometheus must scrape **both** backend replicas (`prometheus.vps.yml` labels `replica=a|b`). F8 alert expressions aggregate across replicas (`max`/`min`/`sum`).

Until dual-scrape is deployed **and** F8 alerts loaded in production Prometheus, **Stage 5 and Stage 6 are blocked**.

**Verdict field:** `PRODUCTION_OBSERVABILITY_TOPOLOGY_COMPLETE`

---

## 4. Authority graph

```
MASTER (RAW_FUEL_REFUEL_FALLBACK_ENABLED)          [permissive boolean, default OFF]
  └─ PERSIST (RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED)   [requires MASTER]
       └─ CONVERGENCE (RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED)  [strict true only]
            └─ PROMOTION (RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED)  [requires CONVERGENCE + cutover]
                 └─ G2 HANDOFF (RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED)  [requires CONVERGENCE + PROMOTION]
                      └─ requires PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED + workersEnabled
```

**Persist never authorizes VehicleEnergyEvent promotion.**

---

## 5. Dual cutover semantics (do not conflate)

| Authority | Env var | Controls |
|-----------|---------|----------|
| **RFRF promotion cutover** | `RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT` | Fallback **promotion** eligibility (`physicalEvidenceEnd >= cutoverAt`) |
| **G2 V2 ownership cutover** | `PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT` | Physical Refuel V2 / fallback G2 participation boundary |

Setting one does **not** set the other. Stage 1 sets RFRF cutover only.

**Cutover behavior (existing runtime — do not reinterpret):**

- Missing/invalid RFRF cutover → promotion blocked (`BLOCKED_CUTOVER`)
- Pre-cutover evidence may be **staged** at Stage 2/3 but remains **non-promotable**
- `candidate.createdAt` does **not** bypass cutover
- Rollback disables authorities; **does not delete** staged candidates or committed VEEs

---

## 6. Forbidden production configuration

Never set in production `backend.env`:

- `RAW_FUEL_REFUEL_F*_INTEGRATION=1`
- `RAW_FUEL_REFUEL_F*_POSTGRES_REQUIRED=1`
- `RAW_FUEL_REFUEL_F*_REDIS_REQUIRED=1`

Preflight **BLOCKs** if present.

---

## 7. Pre-rollout checklist

1. Set the **approved deploy SHA** explicitly (no silent default):
   ```bash
   export RFRF_REQUIRED_GIT_SHA=<approved-main-sha-after-F10.1-merge>
   ```
2. Run read-only preflight:
   ```bash
   sudo RFRF_REQUIRED_GIT_SHA="$RFRF_REQUIRED_GIT_SHA" \
     bash /opt/synqdrive/current/backend/scripts/ops/rfrf-production-preflight.sh --check
   ```
3. Capture metrics baseline from both replicas (RFRF + physical refuel recovery series at zero before enablement).
4. Verify monitoring:
   ```bash
   bash /opt/synqdrive/current/backend/scripts/ops/rfrf-monitoring-verify-alerts.sh --check
   ```
5. DB inventory (read-only): `raw_refuel_candidates` count, fallback VEE count, lifecycle distribution.
6. Confirm all RFRF boolean flags **absent or false**; RFRF cutover **unset**.

---

## 8. Staged rollout (one stage per invocation)

Tool: `rfrf-production-enable-stage.sh`  
Dry-run fixture: `DRY_RUN=1 RFRF_FIXTURE_MODE=1 RFRF_REQUIRED_GIT_SHA=<sha> RFRF_STAGE=N bash ...`
Production Stage 1 example:
```bash
sudo RFRF_REQUIRED_GIT_SHA=<approved-sha> \
  RFRF_CUTOVER_AT=2026-09-16T12:00:00.000Z \
  RFRF_ROLLOUT_ACK=YES RFRF_STAGE=1 \
  bash .../rfrf-production-enable-stage.sh
```
Other production stages: `sudo RFRF_REQUIRED_GIT_SHA=<approved-sha> RFRF_ROLLOUT_ACK=YES RFRF_STAGE=N bash ...`

| Stage | Flags | Expected DB writes | Expected metrics | Min observation |
|-------|-------|-------------------|------------------|-----------------|
| **0** | All RFRF OFF; cutover unset | None | Baseline zeros | Deploy + preflight PASS |
| **1** | Set `RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT` only | None | None new | 15 min |
| **2** | MASTER ON | None | `synqdrive_rfrf_branch_invocation_total` ↑ | 30–60 min |
| **3** | PERSIST ON | `raw_refuel_candidates` inserts/rediscoveries | `synqdrive_rfrf_persist_*` ↑; **no** fallback VEE | 30–60 min |
| **4** | CONVERGENCE ON | `CONVERGED_NATIVE` transitions possible | `synqdrive_rfrf_convergence_*` ↑; **no** fallback VEE | 30–60 min |
| **5** | PROMOTION ON | Fallback VEE + `PROMOTED` (bounded) | `synqdrive_rfrf_promotion_committed_total` ↑ | 60+ min; requires blast-radius PASS |
| **6** | G2 HANDOFF ON | Post-commit G2 enqueue | `synqdrive_rfrf_g2_handoff_completed_total` ↑ | 60+ min |

**Stage 5 gate:** successful `rfrf-production-blast-radius-assessment.sh` (`BLAST_RADIUS_ASSESSMENT_COMPLETE=YES`) **and** `RFRF_BLAST_RADIUS_PASS=1`. Assessment failures are never ignored.

**Stage 5/6 gate:** file + **live** Prometheus gates (`/-/ready`, both scrape targets up, all five F8 rules loaded with healthy state).

---

## 9. Blast-radius assessment (global-only)

No org/vehicle canary exists. Before Stage 5, operators must review:

- Fuel-capable vehicle count
- Staged candidate volume from Stage 2/3
- READY / CONVERGED_NATIVE / INSUFFICIENT distribution
- Native overlap signals (`synqdrive_rfrf_native_overlap_*`)
- Provider/DIMO query volume (`synqdrive_rfrf_sample_fetch_*`)
- Abnormal candidate explosion

```bash
sudo bash .../rfrf-production-blast-radius-assessment.sh
# After successful machine assessment (exit 0 or exit 2 pending operator pass) and operator review:
sudo RFRF_REQUIRED_GIT_SHA=<approved-sha> RFRF_BLAST_RADIUS_PASS=1 \
  RFRF_ROLLOUT_ACK=YES RFRF_STAGE=5 bash .../rfrf-production-enable-stage.sh
```

---

## 10. Abort criteria (P0/P1/P2)

| Condition | Sev | Detection | Immediate action |
|-----------|-----|-----------|-------------------|
| Duplicate fallback VEE / sourceEventKey collision | P0 | DB unique + `synqdrive_rfrf_promotion_source_identity_collision_total` | Rollback Stage 5→4 |
| Native/fallback duplicate convergence failure | P0 | `synqdrive_rfrf_convergence_fail_closed_total` | Rollback promotion + convergence |
| Authority bypass | P0 | Unexpected VEE with flags OFF | Rollback to Stage 0; incident |
| G2 double ownership / duplicate queue jobs | P0 | reconciliation logs + BullMQ dedup | Rollback Stage 6 |
| orphan_refuel / lost_enqueue / stale_enrichment backlog | P0 | F8 alerts + gauges | Rollback G2 handoff; investigate |
| Recovery scheduler stale / failures elevated | P0/P1 | F8 alerts | Rollback G2 handoff; check Redis/workers |
| Redis unavailable | P0 | readiness + worker gate | Do not enable G2 handoff |
| Candidate explosion | P1 | persist_created rate | Rollback to Stage 2 or 3 |
| Unexpected pre-cutover promotion | P0 | `promotion_blocked_cutover` should dominate; any committed pre-cutover VEE | Rollback Stage 5 |
| RFRF branch error affecting ops | P1 | `synqdrive_rfrf_branch_error_total` (native path isolated) | Rollback MASTER |

**No automatic data deletion on rollback.**

---

## 11. Rollback procedure

Tool: `rfrf-production-rollback.sh --from-stage N`

Reverse order:

1. G2_HANDOFF OFF (Stage 6)
2. PROMOTION OFF (Stage 5)
3. CONVERGENCE OFF (Stage 4)
4. PERSIST OFF (Stage 3)
5. MASTER OFF (Stage 2)
6. Optional: remove RFRF cutover (Stage 1) — document operator decision; staged rows remain

Dry-run: `DRY_RUN=1 bash .../rfrf-production-rollback.sh --from-stage 6`

---

## 12. Monitoring sync (pre Stage 5)

```bash
# Verify only (zero mutation):
bash .../rfrf-monitoring-verify-alerts.sh --check

# Live-required verification (Stage 5/6 gate):
bash .../rfrf-monitoring-verify-alerts.sh --check --live-required

# Operator apply (explicit production mutation contract):
sudo RFRF_MONITORING_SYNC_ACK=YES RFRF_MONITORING_MUTATION=PRODUCTION \
  bash .../rfrf-monitoring-sync-alerts.sh --apply
```

Required loaded alerts: `PhysicalRefuelOrphanBacklogPersistent`, `PhysicalRefuelLostEnqueueBacklogPersistent`, `PhysicalRefuelStaleEnrichmentBacklogPersistent`, `PhysicalRefuelRecoverySchedulerStale`, `PhysicalRefuelRecoveryFailuresElevated`.

**Multi-replica aggregation note (F8):** backlog alerts require `min(recovery_enabled)==1` across replicas so alerts fire only when recovery is intentionally enabled everywhere. Stage 5/6 live target/config gates prevent silent suppression during replica drift.

---

## 13. Post-cutover evidence

After Stage 6 steady state:

1. Capture metrics snapshot + alert state
2. Register production observation in EED evidence registry
3. Operator sign-off record (ticket/run log)

---

## 14. Operator sign-off template

| Field | Value |
|-------|-------|
| Deploy SHA | |
| RFRF cutover instant | |
| Highest stage reached | |
| Blast-radius review | PASS / FAIL |
| Alerts loaded | YES / NO |
| Rollback tested (dry-run) | YES / NO |
| Sign-off operator | |
| Timestamp (UTC) | |

---

## 15. Tool reference

| Script | Role |
|--------|------|
| `rfrf-production-preflight.sh --check` | Read-only production gate |
| `rfrf-production-blast-radius-assessment.sh` | Pre-Stage-5 assessment |
| `rfrf-production-enable-stage.sh` | Staged enablement |
| `rfrf-production-rollback.sh` | Reverse-order shutdown |
| `rfrf-monitoring-verify-alerts.sh --check` | Alert + scrape topology verify |
| `rfrf-monitoring-sync-alerts.sh` | Monitoring sync (apply requires ACK) |

---

## 16. Related documents

- `docs/audits/eed-rfrf-f10-1-operational-rollout-closure-2026-09-15.md`
- `docs/audits/eed-rfrf-f9-multi-replica-integration-closure-2026-09-15.md`
- `docs/audits/eed-rfrf-f8-operational-telemetry-alerting-2026-09-15.md`
- `backend/scripts/ops/vps-enable-physical-refuel-v2-production.sh` (G2 precedent)
