# DSRG — Decision register

| ID | Title | STATUS |
|----|-------|--------|
| DSRG-DEC-001 | Delegate deploy via exec bash on git-clean 644 script | VALIDATED |
| DSRG-DEC-002 | Invoke pinned runner only from pinned ops directory | VALIDATED |
| DSRG-DEC-003 | Defer enforcement activation until authority file and OS boundary | PROPOSED |

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
