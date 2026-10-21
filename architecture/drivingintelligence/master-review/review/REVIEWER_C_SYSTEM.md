# Reviewer C — System Architecture

## Scope

DI V0, S4 shadow pipeline, evidence snapshots, research worker, work items, decoder flags, production vs research separation, integration risks, architecture consistency across `CURRENT_STATE` and master-review.

## Read first

1. [../SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md)
2. [../PRODUCTION_RESEARCH_STATUS.md](../PRODUCTION_RESEARCH_STATUS.md)
3. [../ARCHITECTURE_RECONCILIATION_REPORT.md](../ARCHITECTURE_RECONCILIATION_REPORT.md)
4. [../../CURRENT_STATE.md](../../CURRENT_STATE.md)
5. [../../evidence/production/DEPLOYMENT_STATE.md](../../evidence/production/DEPLOYMENT_STATE.md)

## Open questions

- Which S4 flags can be true in Production simultaneously?
- Is V2 master flag ON in prod reconciled with dormant S4 research flags?
- What is the minimum attestation before expanding shadow allowlist?

## Deliverable

Consistency matrix: doc claim → code/config → production evidence tier (VERIFIED/REPORTED/NOT_RUN).
