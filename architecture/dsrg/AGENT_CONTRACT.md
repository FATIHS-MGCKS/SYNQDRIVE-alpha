# DSRG — Agent contract

## Before substantive DSRG work

1. Read [`AGENTS.md`](../../AGENTS.md) and the DSRG row + detail section in [`SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md).
2. Before **any** Production VPS access or deploy task, read [PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md](./PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md).
3. Read **all mandatory entry documents** listed in the registry detail section (at minimum):
   - [`AUDIT_MANIFEST.md`](AUDIT_MANIFEST.md)
   - [`CURRENT_STATE.md`](CURRENT_STATE.md)
   - [`KNOWLEDGE_GRAPH.md`](KNOWLEDGE_GRAPH.md)
   - [`decisions/DECISION_REGISTER.md`](decisions/DECISION_REGISTER.md)
   - [`evidence/EVIDENCE_INDEX.md`](evidence/EVIDENCE_INDEX.md)
   - [`evidence/PRODUCTION_BASELINE.md`](evidence/PRODUCTION_BASELINE.md)
   - [`contradictions/KNOWLEDGE_GAPS.md`](contradictions/KNOWLEDGE_GAPS.md)
   - [`contradictions/OPEN_CONTRADICTIONS.md`](contradictions/OPEN_CONTRADICTIONS.md)
4. While registry coverage is `AUTHORITY_ACTIVE`, treat this directory as **canonical architectural memory** for deploy governance — update authority artifacts in the **same PR** as substantive behavior or contract changes.
5. Read [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md) when touching registry coverage status or reconstructing a **new** module — not for routine DSRG maintenance under active authority.

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
- **`AUTHORITY_ACTIVE` does not authorize enforcement** — `ENFORCEMENT_ACTIVE`, sudoers, and break-glass remain separate gates.

## Implementation vs documentation

- Runtime source of truth: `backend/scripts/ops/` on the **active pinned tree** and live release.
- DSRG docs **index and govern**; they do not rename production scripts.

## Change ledger

- Append DSRG workstream entries only to [`research/CHANGE_LEDGER.md`](research/CHANGE_LEDGER.md) (canonical).
- Reference VO5C historical entries in [`../vehicle-onboarding/research/CHANGE_LEDGER.md`](../vehicle-onboarding/research/CHANGE_LEDGER.md); do not fork duplicate narratives.

## Registry updates

After substantive DSRG changes:

1. Update affected authority files in the same workstream/PR.
2. Re-run validators:

```bash
bash architecture/scripts/validate-module-registry.sh
bash architecture/dsrg/scripts/validate-graph.sh
```

3. Report `REGISTRY_REVIEWED` for module **Deployment Security & Release Governance (DSRG)** (overview row + detail section if metadata changed).
