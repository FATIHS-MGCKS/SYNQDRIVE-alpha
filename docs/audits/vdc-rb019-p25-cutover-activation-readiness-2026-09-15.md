# VDC RB-019 Phase 2 P2.5 — Cutover Activation Readiness / Operational Proof

| Field | Value |
|-------|-------|
| **Date** | 2026-09-15 |
| **Type** | Activation-readiness audit — **no** cutover execution, **no** flag enablement |
| **Authority** | Vehicle & Device Connectivity (`AUDIT_IN_PROGRESS`) |
| **TASK_START_MAIN_SHA** | `fda8a218c1bdbc4dfd8dd734bcf0eea095ba5497` |
| **FINAL_OBSERVED_MAIN_SHA** | `fda8a218c1bdbc4dfd8dd734bcf0eea095ba5497` |
| **P2.5 merge (#1652)** | Present on `origin/main` — merge commit `fda8a218c` |
| **Production deploy SHA (read-only VPS audit)** | `bd3fd78060034f628892d1b9da9cf6991e65606b` (**behind main** — P2.5 **not** deployed) |

## Explicit non-claims

| Invariant | Value |
|-----------|-------|
| `FEATURE_FLAGS_ENABLED` | **NO** |
| `AUTHORITY_MODE_IN_PRODUCTION` | **LEGACY** |
| `AUTHORITY_LATCH_MUTATED_IN_PRODUCTION` | **NO** |
| `SIDE_EFFECTS_EXECUTED_IN_PRODUCTION` | **NO** |
| `PRODUCTION_MUTATED` | **NO** (pre-seed dry-run verified zero durable writes) |
| `PRODUCTION_DEPLOYED` | **NO** (this audit did not deploy) |
| `P2_5_CUTOVER_EXECUTED` | **NO** |
| `P2_5_CUTOVER_ACTIVATION_READY` | **NOT_PROVEN** |

---

## 1. Baseline verification

```text
git fetch origin
origin/main = fda8a218c1bdbc4dfd8dd734bcf0eea095ba5497
git merge-base --is-ancestor fda8a218 origin/main → YES
```

PR #1652 merge commit is present on current `origin/main`. Production VPS release `20260915000043_v4994` remains on `bd3fd78` (pre-P2.5); P2.5 service artifacts (`physical-state-authority-cutover.service.js`) are **absent** from the deployed dist.

Audit branch: `cursor/vdc-rb019-p25-cutover-activation-readiness-dafe`

---

## 2. Target / pilot pre-seed dry-run gate

### 2.1 Data source

| Source | Authorization | Used |
|--------|---------------|------|
| Production PostgreSQL (read-only `psql` + `dryRunPhysicalStatePreseed`) | VPS SSH read-only audit (`synqdrive-admin` + `sudo -u postgres`) | **YES** |
| Synthetic PG fixtures | N/A | **NO** (per task constraint) |

**Informal pilot cohort:** organization `faa710c9-6d91-4079-a7d5-91fdccdec14a` — four vehicles with persisted OBD webhook events and **no** `device_connection_physical_states` row (the natural pre-cutover pre-seed cohort).

### 2.2 Execution

Read-only dry-run executed on Production VPS using deployed `PhysicalStatePreseedService.dryRunPhysicalStatePreseed()` (P2.4 code path). **No** `applyPhysicalStatePreseed`, **no** cutover calls.

**Zero-mutation verification (post dry-run):**

| Table | Before | After |
|-------|--------|-------|
| `device_connection_physical_states` | 0 | 0 |
| `device_connection_physical_authority_cutover` | 0 | 0 |
| `dimo_device_connection_events` | 5 | 5 (unchanged) |

### 2.3 Per-scope results

| vehicleId | tokenId | bindingKey | evidence sources | winner provenance | winner observedAt | planned state | existing projection | authority | decision | conflict |
|-----------|---------|------------|------------------|-------------------|-------------------|---------------|---------------------|-----------|----------|----------|
| `a60c0749-…` | 187336 | `DIMO:device:03e0c8c5…` | webhook×2, VLS OBD | `vehicle_latest_state_obd` | 2026-09-14T21:11:59Z | PLUGGED | null | LEGACY (no row) | `WOULD_ESTABLISH` | none |
| `8c850ff1-…` | 187784 | `DIMO:device:38a87ca0…` | webhook, VLS OBD | `vehicle_latest_state_obd` | 2026-09-14T23:38:45Z | PLUGGED | null | LEGACY (no row) | `WOULD_ESTABLISH` | none |
| `c43c3b45-…` | 190497 | `DIMO:device:f2b57df9…` | webhook, VLS OBD | `vehicle_latest_state_obd` | 2026-07-18T13:42:28Z | UNPLUGGED | null | LEGACY (no row) | `WOULD_ESTABLISH` | none |
| `19fedd4b-…` | 192922 | `DIMO:device:70140ef8…` | webhook, VLS OBD | `vehicle_latest_state_obd` | 2026-09-14T21:10:36Z | PLUGGED | null | LEGACY (no row) | `WOULD_ESTABLISH` | none |

All scopes: `wouldWrite` intent = projection+transition only; episode/alert/outbox/authority/eventHistory = **false**; `dryRun: true`.

### 2.4 Gate verdict

| Field | Value |
|-------|-------|
| `TARGET_DATASET_AVAILABLE` | **YES** |
| `TARGET_DATA_SCOPE_COUNT` | **4** |
| `TARGET_DATA_CONFLICT_COUNT` | **0** |
| `TARGET_DATA_ZERO_MUTATION_RESULT` | **PASS** |
| `TARGET_DATA_DRY_RUN_RESULT` | **PASS** |

**Caveats (do not inflate to activation PASS):**

- Pilot cohort is inferred from Production data shape, not a formally signed pilot charter.
- Dry-run used **deployed** P2.4 code (`bd3fd78`), not yet-deployed P2.5 main (`fda8a218`).
- VLS OBD won over older webhook events on all four scopes — expected per P2.4 semantics but should be reviewed before apply.

---

## 3. Operational UNEXPLAINED = 0 gate

### 3.1 Classification taxonomy (code — `physical-state-shadow.classification.ts`)

| Classification | Correctness-blocking |
|----------------|---------------------|
| `MATCH` | No |
| `EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT` | No (requires `provenExpectedFix`) |
| `UNEXPLAINED_OLD_REJECT_NEW_ACCEPT` | **YES** |
| `OLD_ACCEPT_NEW_REJECT_EXPECTED` | No |
| `UNEXPLAINED_OLD_ACCEPT_NEW_REJECT` | **YES** |
| `STATE_DIVERGENCE_CORRECTNESS_UNKNOWN` | **YES** |
| `BINDING_DIVERGENCE` | **YES** (unless `bindingDivergenceExplained`) |
| `TIMESTAMP_DIVERGENCE` | No |
| `CONFLICT` | Investigate / scope enablement policy |

Blocking helper: `isShadowClassificationCorrectnessBlocking()`.

### 3.2 Observability sources (P2.2/P2.3)

| Source | Path | Production availability |
|--------|------|-------------------------|
| Prometheus counter | `synqdrive_connectivity_physical_state_shadow_classification_total` | **Not emitted** — `/metrics` grep returned no shadow series |
| Prometheus counter | `synqdrive_connectivity_physical_state_shadow_correctness_blocker_total` | **Not emitted** |
| Structured logs | `physical_state_shadow_comparison` via `PhysicalStateShadowObservabilityService` | **No observations** — STATEFUL_SHADOW requires master+projection+shadow flags |
| Stored adjudication DB | None dedicated | **N/A** |

Production `backend.env` contains **no** `CONNECTIVITY_PHYSICAL_STATE_*` variables → master OFF → writers/shadow compare inactive.

### 3.3 Observation window

| Field | Value |
|-------|-------|
| `OPERATIONAL_OBSERVATION_AVAILABLE` | **NO** |
| `OBSERVATION_WINDOW_START` | N/A |
| `OBSERVATION_WINDOW_END` | N/A |
| `OBSERVATION_COMPARISON_COUNT` | **0** |
| `UNEXPLAINED_CORRECTNESS_CRITICAL_DIVERGENCES` | **NOT_PROVEN** |
| `UNEXPLAINED_GATE_RESULT` | **NOT_PROVEN** |

### 3.4 Required next telemetry (non-mutating pilot)

1. Deploy P2.5-capable build to **staging or pilot** (not required for this audit).
2. Enable **STATEFUL_SHADOW only** on pilot org scope: `CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED=true`, `PROJECTION_WRITE=true`, `SHADOW_COMPARE=true`, `SIDE_EFFECTS=false`.
3. Collect over ≥7d (or agreed pilot window): Prometheus `shadow_classification_total` + `shadow_correctness_blocker_total` + structured logs.
4. Prove counts for correctness-blocking classes = 0 with **non-zero** `OBSERVATION_COMPARISON_COUNT`.

Classifier unit tests **do not** satisfy this gate.

---

## 4. Mixed-replica operational proof

### 4.1 Deployment architecture (repository + Production read-only)

| Fact | Value |
|------|-------|
| Canonical request replicas | **2** (`synqdrive` :3001, `synqdrive-b` :3002) |
| Nginx upstream | Both ports in `synqdrive_backend` |
| Separate worker PM2 apps | **None** — `DimoSnapshotProcessor` runs in-process via `WorkersModule` |
| Scheduler leader | Replica A = LEADER, B = FOLLOWER (readiness probe) |
| Rolling deploy | `vps_replica_rolling_deploy` + post-deploy SHA verify |
| Production release SHA | `bd3fd78` (not P2.5) |
| `SYNQDRIVE_BUILD_ID` / `SYNQDRIVE_REPLICA_PEER_BUILD_IDS` in `backend.env` | **Absent** |
| P2.5 mixed-replica interlock | Empty peer list → application interlock returns **SAFE** locally — **not** fleet proof |

### 4.2 MR-OP matrix

| ID | Requirement | Result | Evidence |
|----|-------------|--------|----------|
| MR-OP-1 | All request replicas same cutover-capable build | **NOT_PROVEN** | No runtime build identity in env/health; deployed SHA ≠ main P2.5 |
| MR-OP-2 | All worker replicas same cutover-capable build | **NOT_PROVEN** | Workers colocated; no independent worker fleet enumeration |
| MR-OP-3 | No old webhook-capable replica remains | **FAIL** | Production lacks P2.5 webhook PHYSICAL routing binary |
| MR-OP-4 | No old snapshot-capable replica remains | **FAIL** | Production lacks P2.5 snapshot routing binary |
| MR-OP-5 | Restart produces same cutover-capable build | **NOT_PROVEN** | No `SYNQDRIVE_BUILD_ID` contract on VPS |
| MR-OP-6 | Rollout cannot leave stale worker after request fleet updated | **NOT_PROVEN** | Shared PM2 lifecycle — design suggests yes, not operationally proven for P2.5 |
| MR-OP-7 | Application build identity = deployed artifact | **FAIL** | Health endpoint exposes no git SHA; deploy state tracks PREVIOUS_SHA only |
| MR-OP-8 | Peer-list / source-of-truth completeness | **FAIL** | `SYNQDRIVE_REPLICA_PEER_BUILD_IDS` unset; empty peer list unsafe as fleet proof |

| Field | Value |
|-------|-------|
| `REQUEST_REPLICA_COUNT` | **2** |
| `WORKER_REPLICA_COUNT` | **0** (in-process; effective webhook/snapshot capacity = 2 request replicas) |
| `ALL_CUTOVER_RELEVANT_REPLICAS_ENUMERATED` | **NO** |
| `ALL_REPLICAS_ON_CAPABLE_BUILD` | **NO** |
| `PEER_LIST_COMPLETENESS_PROVEN` | **NO** |
| `MIXED_REPLICA_OPERATIONAL_PROOF` | **NOT_PROVEN** |

**Critical finding:** An empty `SYNQDRIVE_REPLICA_PEER_BUILD_IDS` must **not** be treated as fleet-wide proof. Application interlock is necessary but insufficient.

---

## 5. Activation evidence provenance audit

### 5.1 Current contract (`PhysicalStateCutoverActivationEvidence`)

```typescript
{
  targetPreseedDryRunProven?: boolean;
  unexplainedDivergencesZeroProven?: boolean;
  mixedReplicaGateProven?: boolean;
  runtimeReady?: boolean;
}
```

Passed directly to `evaluatePhysicalStateCutoverEligibility()` / `attemptAuthorityCutover()`. Defaults are **false** (fail-closed). **No** HTTP controller exposes cutover today; any future internal/ops caller could pass arbitrary `true` values.

`evidenceSnapshot` JSON is stored on latch but is **not** validated against operational proof artifacts.

### 5.2 Provenance gap

| Evidence field | Current origin | Safe for activation? |
|----------------|----------------|----------------------|
| `targetPreseedDryRunProven` | Caller-supplied boolean | **NO** — needs signed dry-run artifact reference |
| `unexplainedDivergencesZeroProven` | Caller-supplied boolean | **NO** — needs metrics/log window hash |
| `mixedReplicaGateProven` | Caller-supplied boolean | **NO** — needs deploy verification record |
| `runtimeReady` | Caller-supplied boolean | **NO** — needs build SHA + health proof |

| Field | Value |
|-------|-------|
| `ARBITRARY_BOOLEAN_PROOF_INJECTION_POSSIBLE` | **YES** |
| `ACTIVATION_EVIDENCE_PROVENANCE_RESULT` | **FAIL** |

### 5.3 Recommended canonical evidence (design — not implemented)

| Field | Canonical source | Freshness |
|-------|------------------|-----------|
| `targetPreseedDryRunProven` | Immutable audit artifact (`docs/audits/…` or ops object store) with scope list, per-scope JSON, operator, timestamp, content hash | ≤24h before cutover |
| `unexplainedDivergencesZeroProven` | Prometheus query export + log sample IDs for window; hash of query+result | Window must cover ≥7d pilot STATEFUL_SHADOW |
| `mixedReplicaGateProven` | `vps_replica_verify_post_deploy` log bundle: all replica SHAs, ports, health, peer list completeness attestation | Immediately pre-cutover |
| `runtimeReady` | Deploy manifest: `REQUESTED_SHA` = `CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID` | Same deploy generation |

**Activation blocker:** cutover workflow must not rely on operator-supplied booleans without auditable, hash-linked evidence objects.

---

## 6. Cutover runbook (DRY — do not execute)

### PRE-CUTOVER

1. Confirm `P2_5_CUTOVER_ACTIVATION_READY = YES` from signed evidence bundle (all gates).
2. Verify `origin/main` / deploy `REQUESTED_SHA` includes P2.5 (`fda8a218` or later).
3. Run `vps_replica_verify_post_deploy` — all replicas on capable SHA; capture peer build IDs.
4. Set `CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID` = deploy SHA; populate `SYNQDRIVE_REPLICA_PEER_BUILD_IDS` with **complete** peer set.
5. Confirm target scope `(organizationId, vehicleId, provider)` — authority row absent or `LEGACY`.
6. Re-run **read-only** `dryRunPhysicalStatePreseed` for target scope; archive JSON artifact.
7. Confirm operational UNEXPLAINED=0 evidence for pilot window (Prometheus + logs).
8. Confirm no in-flight deploy; freeze deploy pipeline.
9. Snapshot DB evidence: `device_connection_physical_authority_cutover`, `device_connection_physical_states`, latest OBD events, VLS OBD for scope.

### CUTOVER TRANSACTION (single scope)

1. Build `PhysicalStateCutoverActivationEvidence` from **signed** evidence bundle (not manual booleans).
2. Call `PhysicalStateAuthorityCutoverService.attemptAuthorityCutover({ scope, latchedBy, activationEvidence, evidenceSnapshot })`.
3. Service evaluates eligibility → mixed-replica interlock → `ELIGIBLE` only if all gates pass.
4. `$transaction`: advisory lock → `SELECT … FOR UPDATE` → `LEGACY → PHYSICAL` → commit.
5. Record latch row `latchedAt`, `latchedBy`, `evidenceSnapshot`.

### POST-CUTOVER READ-ONLY VERIFY

1. `readAuthorityMode(scope) === PHYSICAL`.
2. Ingest test webhook (non-prod) or replay captured payload in shadow — verify PHYSICAL writer path, legacy `persistDeviceConnectionEvent` blocked.
3. Snapshot tick — verify orchestrator path; legacy episode resolver skipped.
4. Set master=false — confirm `physicalGateAuthoritative` still true (P25-J).
5. Confirm no duplicate episode/alert/outbox (`sideEffects=false` during pilot).
6. Hit both replicas — consistent authority read from PostgreSQL.
7. Monitor shadow metrics for new correctness blockers.

### ABORT CONDITIONS

- Eligibility not `ELIGIBLE` (any blocking reason).
- Mixed-replica interlock unsafe.
- Pre-seed dry-run not `WOULD_ESTABLISH` or ambiguous conflict.
- UNEXPLAINED correctness blocker > 0 in pilot window.
- Replica SHA mismatch or incomplete peer enumeration.
- In-flight deploy detected.
- Any unexpected projection/authority mutation outside cutover transaction.

**No `PHYSICAL → LEGACY` rollback** — forward-only contract.

| Field | Value |
|-------|-------|
| `CUTOVER_RUNBOOK_RESULT` | **PASS** (documented) |

---

## 7. Forward-only incident plan

If a defect is discovered **after** a future PHYSICAL latch:

1. **Do not** mutate authority `PHYSICAL → LEGACY` in DB or via API.
2. **Stop ingestion risk:** disable DIMO webhook processing or snapshot scheduling for affected scope/org via operational kill-switch (not authority revert).
3. **Quarantine scope:** block cutover on additional scopes; document incident ID.
4. **Preserve evidence:** export authority row, projection, events, shadow logs, metrics snapshots.
5. **Repair forward:** deploy fixed P2.5+ binary; use physical writer path only; reconcile projection under PHYSICAL with `sideEffects=false` until verified.
6. **Communicate:** forward-only incident — legacy path cannot be re-enabled for latched scope.

| Field | Value |
|-------|-------|
| `FORWARD_ONLY_INCIDENT_PLAN_RESULT` | **PASS** (documented) |

---

## 8. Activation decision

| Gate | Result |
|------|--------|
| Target pre-seed dry-run | **PASS** |
| UNEXPLAINED operational = 0 | **NOT_PROVEN** |
| Mixed-replica operational proof | **NOT_PROVEN** |
| Activation evidence provenance | **FAIL** |
| Cutover runbook | **PASS** |
| Forward-only incident plan | **PASS** |

```
P2_5_CUTOVER_ACTIVATION_READY = NOT_PROVEN
```

### Remaining blockers

1. **UNEXPLAINED gate** — zero operational shadow observations; STATEFUL_SHADOW not enabled on pilot.
2. **Mixed-replica proof** — Production not on P2.5 build; no runtime build identity; peer list unset; MR-OP-3/4/7/8 FAIL.
3. **Evidence provenance** — activation booleans injectable without auditable artifacts.
4. **Deploy lag** — main contains P2.5 (`fda8a218`); Production deploy `bd3fd78` does not.
5. **Formal pilot charter** — dry-run cohort inferred, not signed.

### EXACT_NEXT_ACTION

1. Deploy P2.5 main (`fda8a218+`) to Production via standard VPS release (separate authorized change).
2. Add `SYNQDRIVE_BUILD_ID` + `CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID` + complete `SYNQDRIVE_REPLICA_PEER_BUILD_IDS` to production env contract.
3. Run pilot STATEFUL_SHADOW on agreed org scope; collect UNEXPLAINED metrics for defined window.
4. Implement signed activation evidence bundle (replace raw booleans) before any cutover caller ships.
5. Re-run this activation-readiness audit after operational proofs exist.

**Do not execute Production `LEGACY → PHYSICAL` cutover until all gates PASS.**
