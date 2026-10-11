# DSRG — Agent contract

## Before substantive DSRG work

1. Read [`AGENTS.md`](../../AGENTS.md) and this directory’s [`AUDIT_MANIFEST.md`](AUDIT_MANIFEST.md).
2. Read the DSRG row and detail section in [`SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md).
3. Read [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md) while registry status is `AUDIT_IN_PROGRESS`.
4. Do **not** treat DSRG as `AUTHORITY_ACTIVE` until promotion gate is satisfied.

## Scope (DSRG owns documentation + contracts for)

- Pinned executor install, integrity, and execution path
- Deploy preflight, human authorization, and attestation
- Security-floor, admission, and P4B15 bypass-enforcement **policy and ops contracts**
- OS privilege boundary (sudoers / wrapper) **readiness**
- Rollback and emergency containment **interaction** with deploy paths
- Release governance coexistence with APDS, EXP021, RFRF

## Out of scope (do not rewrite owning authorities)

| Area | Owner |
|------|--------|
| Vehicle onboarding / offboarding product flows | [`architecture/vehicle-onboarding/`](../vehicle-onboarding/) |
| VO5C P4A admission, MFA UI, historical P4B evidence | `architecture/vehicle-onboarding/evidence/VO5C_*` |
| APDS shadow epoch and approved release pin | APDS module / P25 evidence (see [`CROSS_MODULE_DEPENDENCIES.md`](CROSS_MODULE_DEPENDENCIES.md)) |
| EXP021 experiments, scheduler, Gate-6 open/kill | Driving Intelligence + EXP021 ops |
| RFRF stage rollback machinery | RFRF scripts and evidence |
| Battery V2, Trip Detection, DIMO, etc. | Respective registry authorities |

## Production safety

- **Read-only** Production audit unless the user explicitly authorizes a named mutation phase (pin promotion, enforcement arm, deploy test).
- **Never** run `vps-vo5c-run-pinned-security-deploy.sh` or `cloud-agent-deploy.sh` during documentation-only workstreams.
- **Never** print secrets from VPS env files; redact in committed evidence.

## Implementation vs documentation

- Runtime source of truth: `backend/scripts/ops/` on the **active pinned tree** and live release.
- DSRG docs **index and govern**; they do not rename production scripts.

## Change ledger

- Append DSRG workstream entries only to [`research/CHANGE_LEDGER.md`](research/CHANGE_LEDGER.md) (canonical).
- Reference VO5C historical entries in [`../vehicle-onboarding/research/CHANGE_LEDGER.md`](../vehicle-onboarding/research/CHANGE_LEDGER.md); do not fork duplicate narratives.

## Registry updates

After substantive DSRG changes, update this authority and re-run:

```bash
bash architecture/scripts/validate-module-registry.sh
```

Report `REGISTRY_REVIEWED` for module **Deployment Security & Release Governance (DSRG)**.
