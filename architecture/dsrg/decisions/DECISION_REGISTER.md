# DSRG — Decision register

| ID | Title | STATUS |
|----|-------|--------|
| DSRG-DEC-001 | Delegate deploy via exec bash on git-clean 644 script | VALIDATED |
| DSRG-DEC-002 | Invoke pinned runner only from pinned ops directory | VALIDATED |
| DSRG-DEC-003 | Defer enforcement activation until authority file and OS boundary | PROPOSED |
| DSRG-DEC-004 | P4B16 post-verify atomic release attestation commit | PROPOSED |

---

## DSRG-DEC-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Bare `exec` on `vps-deploy-release.sh` failed integrity on 100644 tracked script |
| **WHY** | Preserve git-clean pinned trees without chmod mutations |
| **CHANGE** | `exec bash "$PINNED_DEPLOY_SCRIPT"` in pinned runner (#1970) |
| **EVIDENCE** | DSRG-EVID-CODE-RUNNER-001, DSRG-TEST-EXEC-CONTRACT-001 |
| **VALIDATION** | Repository selftest; merged to pin `448a889` on VPS |
| **NON-EFFECT** | Does not arm enforcement or change live app without deploy |

---

## DSRG-DEC-002

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Runner callable from `/current` ops tree |
| **WHY** | Prevent accidental legacy executor delegation |
| **CHANGE** | Path guard requiring pinned ops `pwd` match |
| **EVIDENCE** | DSRG-TEST-EXEC-CONTRACT-001 |
| **VALIDATION** | Execution-contract selftest NON_PINNED_RUNNER_ENTRY_DENIED |

---

## DSRG-DEC-003

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | Enforcement env and authority file absent on Production |
| **WHY** | Dual approval and negative bypass test before fail-closed |
| **CHANGE** | Install authority env at ACTIVE=0, sudoers, then ENFORCEMENT_ACTIVE=1 |
| **EVIDENCE** | DSRG-EVID-PROD-R2-001 |
| **OPEN** | P4B16 attestation automation; armed stamp monitoring |

---

## DSRG-DEC-004

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | `SYNQDRIVE_DEPLOYED_GIT_SHA` may diverge from `current` release tree after successful deploy |
| **WHY** | APDS/VO5C gates and operators need fail-closed, rollback-safe release identity |
| **CHANGE** | After verify PASS, publish via **journal + single authoritative state file**; `COMMITTED` only after `PUBLISHED` + per-replica runtime identity match; `backend.env` as legacy mirror (no PM2 env reload claim); rollback shares lock; never mutate APDS approved pin |
| **EVIDENCE** | DSRG-EVID-P4B16-R0-001 |
| **VALIDATION** | Offline matrix P4B16_R0; implementation phase + pin promotion |
| **NON-EFFECT** | No enforcement, sudoers, APDS epoch, Gate-6, or RFRF changes |
