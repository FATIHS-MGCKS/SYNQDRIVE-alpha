# DSRG — Current state (repository vs Production)

**Audit base (repository):** `main` @ `0633d08311803b1473c6e7a274e5074e4cb69a08` (post #1979 P4B16 R0/R0A) · **P4B16 R1A** engine branch adds offline libs (not on `main` until merge)  
**Production evidence baseline:** DSRG-03 R3 @ `2026-10-11T13:49:49Z` · **P4B16 R0** @ `2026-10-11T16:05:00Z` (read-only attestation)  
**Classification axes:** registry `AUTHORITY_ACTIVE` (effective on R6 merge) · epistemic per-row · validation per-row

## Repository vs Production drift

| Dimension | Repository (`main`) | Production (VPS) | Notes |
|-----------|---------------------|------------------|-------|
| Application SHA | `main` tip advances continuously | `git -C current` = `2b89f746…` (P4B16 R0) | **Drift:** tree SHA ≠ `SYNQDRIVE_DEPLOYED_GIT_SHA` (`3a4bb944…`) |
| Attestation env | P4B16 design in R0 | `SYNQDRIVE_DEPLOYED_GIT_SHA` stale vs `current` | **CONFIRMED mismatch** — no auto writer in deploy script |
| Release path git HEAD | N/A | **No git metadata** on `/opt/synqdrive/releases/20261010184619_v4994` | Identity from **attestation env only** |
| Pinned executor | `448a889…` on `main` (#1970) | Config + tree @ `448a889…` | **Aligned** (pin-only promotion; live app unchanged) |
| Enforcement / authority | Examples in repo | Files **absent**; flags **off** | **Not production-ready** for enforced deploy path |

Do **not** equate merged repository code with live runtime. Status labels:

| Label | Meaning |
|-------|---------|
| **IMPLEMENTED** | Present in repository at audit SHA |
| **DEPLOYED** | Observed on Production VPS (bounded read-only) |
| **ACTIVATED** | Runtime/config enables behavior (not merely present in tree) |
| **VALIDATED** | Test or bounded Production evidence supports claim |
| **PLANNED** | Documented intent, not fully wired |
| **UNKNOWN** | Not verified in this audit |

---

## Pinned executor and runner

| Component | IMPLEMENTED | DEPLOYED | ACTIVATED | VALIDATED | Notes |
|-----------|-------------|----------|-----------|-----------|-------|
| `vps-vo5c-run-pinned-security-deploy.sh` | yes @ `448a889` ancestry on `main` | yes in pin tree `448a889…` on VPS | **no** (not executed in DSRG-03) | selftest PASS @ audit branch | Requires `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1` + invoke from pinned ops dir |
| `vps-vo5c-first-security-deploy-preflight.sh` | yes | yes in pin tree | **UNKNOWN** (last PASS DSRG-02 R1) | prior seal + selftests | |
| Pin config `vo5c-pinned-executor.env` | example only in repo | yes `/opt/synqdrive/shared/` | **yes** (points at `448a889…`) | VPS read 2026-10-11 | mode `0600` root:root |
| Preserved pin trees `40c6dd9`, `dc30d2c` | **UNKNOWN** in repo alone | yes on VPS | dormant | DSRG-02 evidence | |
| `exec bash` on `vps-deploy-release.sh` (644) | yes (#1970) | yes in active pin | **UNKNOWN** until deploy | execution-contract selftest | |

---

## Admission, security floor, bypass enforcement

| Component | IMPLEMENTED | DEPLOYED | ACTIVATED | VALIDATED |
|-----------|-------------|----------|-----------|-----------|
| `lib/vps-vo5c-deploy-admission.lib.sh` | yes | in pin + live release path | **UNKNOWN** | partial selftests |
| `lib/vps-vo5c-security-floor.lib.sh` | yes | in pin | **UNKNOWN** | rollback selftest |
| `lib/vps-vo5c-production-deploy-bypass-enforcement.lib.sh` (P4B15) | yes | in pin | **OFF** (no enforcement env) | P4B15 selftest PASS |
| `vo5c-production-deploy-authority.env` | `.example` in repo | **absent** on VPS | **no** | — |
| `VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE` | documented | **not** set in `backend.env` (grep) | **no** | — |

---

## Legacy and alternate deploy entrypoints

| Path | IMPLEMENTED | DEPLOYED | ACTIVATED | Notes |
|------|-------------|----------|-----------|-------|
| `vps-deploy-release.sh` (current release) | yes | yes under `/opt/synqdrive/releases/…` | **yes** for past deploys | Live app not re-deployed in DSRG-02 |
| `cloud-agent-deploy.sh` / staging | yes in repo | **UNKNOWN** operator usage | gated by human process | |
| `vps-deploy-connectivity-staging.sh` | yes | **UNKNOWN** | **UNKNOWN** | |

---

## Attestation and config sources

| Source | IMPLEMENTED | DEPLOYED | ACTIVATED |
|--------|-------------|----------|-----------|
| `SYNQDRIVE_DEPLOYED_GIT_SHA` in `backend.env` | yes | yes (P4B16 R0 snapshot `3a4bb944…`) | **yes** |
| `release-attestation.state` + journal (P4B16 R1A libs) | **yes** (repo; offline) | **absent** | **no** |
| Primary deploy SHA attestation file (authority) | R1A libs **OFFLINE_VALIDATED** | **absent** on VPS | **no** |
| Armed enforcement stamp | documented | **absent** | **no** |

---

## Rollback and emergency containment

| Component | IMPLEMENTED | DEPLOYED | ACTIVATED | VALIDATED |
|-----------|-------------|----------|-----------|-----------|
| `vps-vo5c-security-floor-rollback.selftest.sh` | yes | n/a | n/a | PASS @ audit branch |
| RFRF rollback contracts | referenced in VO5C/RFRF evidence | **UNKNOWN** full VPS probe | **UNKNOWN** | DSRG-02 seal: no RFRF ops diff pin-to-pin |

---

## Cross-module runtime (observed, not owned by DSRG)

| Module | Observation | DSRG relation |
|--------|-------------|---------------|
| **APDS** | Approved pin `ab72f574…`; ACTIVE epoch `3cbc5d95…` @ `2026-10-09` (R3 SQL) | must not mutate during DSRG work |
| **EXP021** | Gate-6 GLOBAL **KILLED** (`di_v0_s4_control`, updated `2026-10-02`) | **CONFIRMED** R3 SQL; scheduler leader metric **UNKNOWN** |
| **VO5C product admission / MFA** | **UNKNOWN** in `backend.env` grep | owned by Vehicle Onboarding evidence |
| **Live app** | release dir `20261010184619_v4994`; PM2 `synqdrive` + `synqdrive-b` online | unchanged by pin-only promotion |

---

## Execution chains (repository — not live activation proof)

**Authorized pinned path:** human `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1` → `vo5c-pinned-executor.env` → `vps-vo5c-run-pinned-security-deploy.sh` (pinned ops dir) → preflight → `exec bash vps-deploy-release.sh` → release/PM2 → `SYNQDRIVE_DEPLOYED_GIT_SHA`. See [`KNOWLEDGE_GRAPH.md`](KNOWLEDGE_GRAPH.md).

**Legacy / rejected:** direct `current` deploy; bare `exec` (**DSRG-REJECT-001**); cloud-agent path without pinned contract.

| Step | IMPLEMENTED | DEPLOYED | ACTIVATED | VALIDATED |
|------|-------------|----------|-----------|-----------|
| Full pinned deploy chain | yes in pin tree | scripts on VPS | **no** (runner not executed in audits) | selftests only |
| P4B16 attestation automation | **R1A IMPLEMENTED** (libs only) | **no** | **no** | `vps-release-attestation.selftest.sh` PASS (fixtures) |

## Security tests (repository — offline)

- `vps-vo5c-pinned-deploy-execution-contract.selftest.sh` — **PASS** @ DSRG-03 R2  
- `vps-release-attestation.selftest.sh` — **PASS** @ P4B16 R1A (16 scenario classes)  
- Does **not** imply Production deploy readiness.

## Production observation (DSRG-03 R3)

Authoritative read-only: [`evidence/DSRG_03_R3_PRODUCTION_AUDIT.md`](evidence/DSRG_03_R3_PRODUCTION_AUDIT.md). Execution paths: [`evidence/EXECUTION_PATH_INVENTORY.md`](evidence/EXECUTION_PATH_INVENTORY.md).

## Registry

`AUTHORITY_ACTIVE` (DSRG-03 R6 promotion) — architecture governance only. **Enforcement OFF** · **BREAK_GLASS_READY=NOT_VERIFIED** · legacy deploy bypass risk documented in [`evidence/EXECUTION_PATH_INVENTORY.md`](evidence/EXECUTION_PATH_INVENTORY.md). VO5C evidence preserved under `architecture/vehicle-onboarding/evidence/`.
