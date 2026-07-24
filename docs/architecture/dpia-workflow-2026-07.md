# DPIA Workflow & Privacy Risk Assessment (Prompt 30)

**Date:** 2026-07-24  
**Version:** V4.9.813  
**Migration:** `20260724100000_dpia_workflow`

## Scope

Professional privacy-risk scoring and DPIA governance workflow for processing activities.  
**Risk score ≠ legal DPIA decision** — scoring is a configurable heuristic; approval is a separate human workflow.

## Risk model

### Factors evaluated (weighted heuristic, 0–100 cap)

| Factor | Source |
|--------|--------|
| Sensitive data categories | `dataCategories` (GPS, health, DTC, customer, financial, biometric) |
| Data volume / scope | `PrivacyRiskDataVolume` |
| Processing frequency | `PrivacyRiskFrequency` |
| Processing duration | `PrivacyRiskDuration` |
| Number of data subjects | `PrivacyRiskSubjectScale` |
| Systematic monitoring | boolean |
| Location data | boolean (auto from `GPS_LOCATION` category) |
| Profiling | boolean |
| Automated decision-making | boolean |
| Vulnerable subjects | boolean |
| Data combination | boolean |
| Third-country transfer | boolean |
| External recipients | boolean |
| Likelihood of harm | `PrivacyRiskLikelihood` |
| Security measures | free text (stored, not auto-scored) |
| Potential harm | free text (stored, not auto-scored) |
| Org baseline risk | derived from categories/purposes (`HIGH` / `CRITICAL` triggers gate) |

### Score → org risk level (separate from DPIA gate)

| Score | `DataAuthorizationRiskLevel` |
|-------|---------------------------|
| 0–29 | LOW |
| 30–54 | MEDIUM |
| 55–74 | HIGH |
| 75–100 | CRITICAL |

### DPIA required when

- `riskScore >= DPIA_RISK_SCORE_THRESHOLD` (default **55**), **or**
- org risk level is **HIGH** or **CRITICAL**

## DPIA gates

| Gate | Behavior |
|------|----------|
| Activation (`PolicyLifecycleActivationGuardService`) | Blocks if `dpiaStatus` ∈ {`DPIA_REQUIRED`, `DPIA_IN_PROGRESS`, `DPIA_REJECTED`, `DPIA_REVIEW_DUE`} or current DPIA record still `DPIA_REQUIRED` |
| `DPIA_REJECTED` | Hard block — no activation until new assessment/version |
| Residual risk | Must be explicitly accepted (`residualRiskAccepted`) before `approve` |
| Four-eyes | Approver cannot be assigned privacy or security reviewer |
| Material change | `contentFingerprint` mismatch on processing activity → new assessment may be required (API: `GET .../risk-assessment/material-change`) |

### DPIA statuses

`DPIA_NOT_REQUIRED` · `DPIA_REQUIRED` · `DPIA_IN_PROGRESS` · `DPIA_APPROVED` · `DPIA_REJECTED` · `DPIA_REVIEW_DUE`

## API

Base: `/api/v1/organizations/:orgId/processing-activities/:activityId/dpia-workflow`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/risk-config` | `data_processing.dpia_view` |
| POST | `/risk-assessment` | `data_processing.dpia_assess` |
| GET | `/risk-assessment/current` | `data_processing.dpia_view` |
| GET | `/risk-assessment/material-change` | `data_processing.dpia_view` |
| GET/POST/PATCH | `/dpia` | `dpia_view` / `dpia_edit` |
| POST | `/dpia/submit` | `data_processing.dpia_edit` |
| POST | `/dpia/privacy-review` | `data_processing.dpia_review_privacy` |
| POST | `/dpia/security-review` | `data_processing.dpia_review_security` |
| POST | `/dpia/accept-residual-risk` | `data_processing.dpia_approve` |
| POST | `/dpia/approve` | `data_processing.dpia_approve` |
| POST | `/dpia/reject` | `data_processing.dpia_approve` |

## Stored entities

- `ProcessingActivityRiskAssessment` — factor snapshot, `riskScore`, `dpiaRequired`, `isCurrent`
- `ProcessingActivityDpia` — reviewers, measures, residual risk acceptance, `approvalStatus`, `reviewDate`, `evidenceReference`
- `ProcessingActivityDpiaDecision` — append-only audit trail

## Configuration (environment)

| Variable | Default | Purpose |
|----------|---------|---------|
| `DPIA_RISK_SCORE_THRESHOLD` | `55` | Score threshold for DPIA recommendation |
| `DPIA_REVIEW_DUE_LEAD_DAYS` | `30` | Days before `reviewDate` to mark `DPIA_REVIEW_DUE` |
| `DPIA_REVIEW_DUE_SUSPEND` | `false` | Suspend ACTIVE processing activity on review due |
| `DPIA_REVIEW_DUE_POLL_ENABLED` | `true` | Scheduler on/off |
| `DPIA_REVIEW_DUE_POLL_MS` | `3600000` | Scheduler interval |

## Review due

`DpiaReviewDueSchedulerService` marks approved DPIAs approaching `reviewDate` as `DPIA_REVIEW_DUE`, enqueues lifecycle audit (`DPIA_REVIEW_DUE`), and optionally suspends the processing activity when `DPIA_REVIEW_DUE_SUSPEND=true`.

## Test results

```bash
cd backend && npm run test:data-auth:dpia
```

Covers: risk scoring thresholds, HIGH/CRITICAL gate, activation blocks, residual-risk acceptance, four-eyes approval, append-only reject decisions.

## Disclaimer

Configurable scoring supports DPIA triage — **no automatic legal DPIA outcome**. Human reviewers and approvers remain responsible for the legal decision.
