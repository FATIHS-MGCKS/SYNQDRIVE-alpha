# DSRG — Knowledge graph (human index)

Machine-readable graph: [`graph/`](graph/)  
Validate: `bash architecture/dsrg/scripts/validate-graph.sh`

## Execution chain (authorized path)

```
Operator (human)
  → SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1
  → vo5c-pinned-executor.env (pin ROOT/SHA)
  → vps-vo5c-run-pinned-security-deploy.sh (from pinned ops dir only)
  → vps-vo5c-first-security-deploy-preflight.sh
  → exec bash vps-deploy-release.sh (pinned tree)
  → release promotion / PM2 / migrations
  → post-verify attestation commit (P4B16 — **PROPOSED**; not automated today)
  → SYNQDRIVE_DEPLOYED_GIT_SHA in shared backend.env
```

**Rejected / legacy paths (documented, not removed pre-enforcement):**

- Direct `vps-deploy-release.sh` from live `/current` release tree
- `cloud-agent-deploy.sh` without pinned runner contract (separate human push gate)
- Bare `exec` on 644 deploy script (**DSRG-REJECT-001**, superseded)

## Decision summary

| ID | Status |
|----|--------|
| DSRG-DEC-001 | VALIDATED |
| DSRG-DEC-002 | VALIDATED |
| DSRG-DEC-003 | PROPOSED |
| DSRG-DEC-004 | PROPOSED |

## Cross-module boundaries

| External authority | DSRG constraint |
|--------------------|-----------------|
| Vehicle Onboarding | Product admission/MFA; VO5C P4B evidence |
| APDS | Do not mutate approved release pin during DSRG ops |
| EXP021 | Do not open Gate-6 via deploy scripts |
| RFRF | Do not weaken rollback traps |

## Gaps indexed in graph

`DSRG-GAP-01` … `DSRG-GAP-08` — see [`contradictions/KNOWLEDGE_GAPS.md`](contradictions/KNOWLEDGE_GAPS.md)
