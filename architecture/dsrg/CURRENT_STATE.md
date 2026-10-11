# DSRG — Current state (repository vs Production)

**Audit base:** `origin/main` @ `2a44f5cdc6ce0f1e4ec3846243352f8a82aef072`  
**Classification axes:** registry `AUDIT_IN_PROGRESS` · epistemic per-row · validation per-row

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
| `SYNQDRIVE_DEPLOYED_GIT_SHA` in `backend.env` | yes | yes = `7f47c9f…` | **yes** |
| Primary deploy SHA attestation file (authority) | spec in examples | **absent** | **no** |
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
| **APDS** | `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA=ab72f574…` in Production `backend.env` | must not mutate during DSRG work |
| **EXP021** | Fleet/coordinator flags present in `backend.env`; Gate-6 **KILLED** per DSRG-02 seal | **UNKNOWN** re-verified live kill registry in DSRG-03 R0 |
| **VO5C product admission / MFA** | **UNKNOWN** in `backend.env` grep | owned by Vehicle Onboarding evidence |
| **Live app** | release dir `20261010184619_v4994`; PM2 `synqdrive` + `synqdrive-b` online | unchanged by pin-only promotion |

---

## Security tests (repository)

Executed during DSRG-03 R0 (local):

- `vps-vo5c-pinned-deploy-execution-contract.selftest.sh` — **PASS**

Additional selftests documented in [`evidence/DSRG_02_PIN_REPROMOTION_2026-10-11.md`](evidence/DSRG_02_PIN_REPROMOTION_2026-10-11.md) at pin `448a889`.

---

## Documentation hub (pre-registry)

| Artifact | Status |
|----------|--------|
| `architecture/dsrg/*` hub | **IMPLEMENTED** before registry row; **now** `AUDIT_IN_PROGRESS` authority |
| VO5C P4B15/P4B16 evidence | **preserved** under `architecture/vehicle-onboarding/evidence/` |
