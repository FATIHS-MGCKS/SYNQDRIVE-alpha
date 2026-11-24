# V2B-PR8 — Direct controlled production cutover policy (OWN-5 revision)

**Operation:** `SYNQDRIVE_VEHICLES_V2B_PR8_DIRECT_CUTOVER_POLICY`  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Pull request:** [#2523](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2523)  
**Owner strategy revision date:** 2026-11-24  
**Evidence:** VO-EVID-2B-010

**Preserves:** [V2B_PR8_OWNER_ATTESTATION_2026-11-24.md](./V2B_PR8_OWNER_ATTESTATION_2026-11-24.md) (VO-EVID-2B-009) — historical record; OWN-3, OWN-4, OWN-6 unchanged.

---

## OWN-5 policy supersession

| Track | Decision | Status |
|-------|----------|--------|
| Shadow soak + staging observation + multi-replica shadow metrics | `VO-DEC-OWN-5` (2026-11-24 attestation option) | **SUPERSEDED** for cutover prerequisites — not required |
| Direct controlled production cutover | `VO-DEC-OWN-5B` | **OWNER_APPROVED** @ strategy revision 2026-11-24 |

**Policy name:** `DIRECT_CONTROLLED_PRODUCTION_CUTOVER_WITHOUT_SHADOW_SOAK`

**Removed mandatory requirements (no longer gates):**

- 14-day shadow observation
- 200 shadow observations
- Canary deployment
- Separate staging observation phase
- Multi-replica shadow metrics infrastructure
- Synthetic observation volume thresholds

**No shadow or canary phase shall be required** for HM canonical cutover under this policy.

`VEHICLE_REGISTRATION_CONVERGENCE_SHADOW_COMPARE` remains available in code (default **OFF**) but is **not** a cutover prerequisite.

---

## Accepted engineering certification (repository — not production environment proof)

| Metric | Value | Meaning |
|--------|-------|---------|
| `PG03_POSTGRESQL` | 18/18 | HM_ONLY canonical harness |
| `PG05_POSTGRESQL` | 12/12 | Billing/outbox parity |
| `PR7_POSTGRESQL` | 30/30 | Readiness observation matrix |
| `TOTAL_SELECTED_POSTGRESQL` | **60/60** | Sum of above |
| `PR7_WORKFLOWS` | 24/24 success | PR #2522 branch CI |
| `PR7_MERGE_SHA` | `ff90ff14a6db64bc27d284beface47dc90a018d2` | Merged engineering baseline |

These certify **tested engineering contracts** at merge time — **not** current production runtime state.

---

## Direct production cutover — mandatory release gates (no calendar soak)

| # | Gate |
|---|------|
| 1 | Verify exact **production** and **release** SHA |
| 2 | Verify **current release** CI and build green on that SHA |
| 3 | Verify **migration** compatibility for release |
| 4 | **Read-only** legacy fleet inventory (OWN-6 policy; separate production access authorization when executed) |
| 5 | Verify registration and billing invariants (PG-03/05 contracts + single-rail characterization) |
| 6 | Verify **both** backend replica configurations (flags, env) consistent |
| 7 | Confirm **routing** rollback procedure (not data rollback) |
| 8 | Obtain explicit owner **deployment** and **production activation** authorization |
| 9 | Execute controlled production cutover (deploy + flag arm only after #8) |
| 10 | Execute **targeted** production smoke tests |

**Immediate rollback triggers:** actual registration failure, database integrity failure, billing anomaly, configuration/routing mismatch across replicas, or uncorrected runtime failure during smoke.

---

## Production flag policy (documentation only — no arm in PR #2523)

| Flag | Policy |
|------|--------|
| `VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED` | **OWNER_GATED** — target **ON** only after step 8–9 authorization |
| `VEHICLE_REGISTRATION_CONVERGENCE_SHADOW_COMPARE` | **REMAINS OFF** — **not required** for cutover |
| `VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL` | **NOT_ARMABLE** / **REDUNDANT** |

---

## Safety invariants (binding)

- No manual vehicle registration.
- No duplicate vehicle activation; no duplicate billing.
- No automatic retroactive billing (OWN-4).
- No cross-tenant access.
- No automatic legacy fleet repair (OWN-6).
- No destructive data rollback.
- Preserve completed canonical cases, existing vehicles, identities, committed outbox, billing ledger.

---

## PR9 revised handoff (replaces shadow-infrastructure roadmap)

| Phase | Scope |
|-------|--------|
| **PR9A** | Final production readiness + read-only legacy fleet inventory execution plan |
| **PR9B** | Explicit owner release authorization (deploy + activation — separate attestation) |
| **PR9C** | Direct production cutover execution + targeted smoke tests (ops record) |

**No new shadow infrastructure workstream.**

| **PR10** | Evaluate and remove obsolete legacy/shadow **helpers** after successful cutover; preserve rollback capability |

**PR9A deliverable:** [V2B_PR9A_DIRECT_PRODUCTION_READINESS_2026-11-24.md](./V2B_PR9A_DIRECT_PRODUCTION_READINESS_2026-11-24.md) (VO-EVID-2B-011).

---

## Operational status @ policy revision

| Field | Value |
|-------|-------|
| `PRODUCTION_ACTIVATION_AUTHORIZED` | **NO** (strategy revision only) |
| `DEPLOYED` | **NO** |
| `FLAGS_ARMED` | **NO** |
| `SHADOW_SOAK_REQUIRED` | **NO** |
| `CANARY_REQUIRED` | **NO** |
| `STAGING_OBSERVATION_REQUIRED` | **NO** |
| `SHADOW_METRICS_INFRASTRUCTURE_REQUIRED` | **NO** |