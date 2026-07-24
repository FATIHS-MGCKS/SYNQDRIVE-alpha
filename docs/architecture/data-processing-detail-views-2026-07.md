# Data Processing Detail Views (Prompt 36)

Date: 2026-07-24  
Branch: `cursor/data-processing-detail-views-26b5`  
Depends on: Prompt 35 wizard (`cursor/data-processing-wizard-26b5`)

## Scope

Professional detail, review, version, and revocation views for:

| Entity | Drawer | Data source |
|--------|--------|-------------|
| ProcessingActivity | `ProcessingActivityDetailDrawer` | `GET .../processing-activity-register/:id` + versions + review cycle |
| LegalBasisAssessment | `EntityDetailDrawer` | `GET .../legal-basis-assessments/:id` |
| EnforcementPolicy | Embedded in activity detail | Register detail nested list |
| ProviderAccessGrant | `EntityDetailDrawer` | `GET .../provider-access-grants/:id` |
| DataSubjectConsent | `EntityDetailDrawer` | `GET .../data-subject-consents/:id` |
| DataSharingAuthorization | `EntityDetailDrawer` | `GET .../data-sharing-authorizations/:id` |
| DataProcessingAgreement | `DpaDetailDrawer` | `GET .../data-processing-agreements/:id` |
| Legacy authorization | `DataAuthorizationDetailDrawer` | Existing legacy API |

Orchestration: `DataProcessingDetailHost` + hub row clicks.

## Detail view sections (per domain)

Each drawer surfaces domain-relevant subsets of:

- Current version (`versionNumber`, `isCurrentVersion`)
- Lifecycle status + semantics
- Owner / reviewer / next review
- Legal basis links
- DPIA status + blockers
- Scope / data categories
- Retention
- Provider status + conflicts
- Enforcement policy summaries
- Runtime coverage (activities)
- Audit / review / status event timelines
- Linked resources (safe navigation, no raw UUID primary labels)
- Open measures via `completeness.blockingGaps` + governance blockers

Active records show **not editable** notice; supersede creates new version.

## Dialog matrix

| Action | Dialog | Reason required | Impact preview |
|--------|--------|-----------------|----------------|
| Request review | `LifecycleActionDialog` | No | Yes |
| Request changes | `LifecycleActionDialog` | Yes | No |
| Approve | `LifecycleActionDialog` | No | Four-eyes |
| Schedule activation | `LifecycleActionDialog` | No + date | No |
| Activate | `LifecycleActionDialog` | No | Yes |
| Suspend | `LifecycleActionDialog` | Yes | Yes |
| **Revoke** | `LifecycleActionDialog` | **Yes** | Yes + separates from reject |
| **Reject** | `LifecycleActionDialog` | **Yes** | Yes + separates from revoke |
| Supersede / new version | `LifecycleActionDialog` | No + validUntil (activity) | Yes |
| Resume | `LifecycleActionDialog` | Optional | No |
| Grant / withdraw consent | `LifecycleActionDialog` | Withdraw: yes | No |
| Authorize / revoke sharing | `LifecycleActionDialog` | Revoke: yes | No |
| Activate / terminate DPA | `LifecycleActionDialog` | Terminate: yes | No |

Execution: `executeLifecycleAction` → `api.dataProcessing.lifecycle.*` (no optimistic UI; reload after success).

## Status transitions (frontend gates)

Frontend action availability mirrors backend via `availableLifecycleActions()`:

```
DRAFT → request-review
IN_REVIEW → approve | reject | request-changes
APPROVED|SCHEDULED → schedule-activation | activate
ACTIVE → suspend | revoke
SUSPENDED → resume
non-terminal current → supersede (except DRAFT/IN_REVIEW)
REVOKED|REJECTED|EXPIRED → supersede only
```

Provider: `PENDING → activate`, `ACTIVE → revoke`  
Consent: `PENDING|RECORDED → grant`, `GRANTED → withdraw`  
Sharing: `DRAFT|PENDING → authorize`, `AUTHORIZED|ACTIVE → revoke`  
DPA: `DRAFT → activate-dpa`, `ACTIVE → terminate`, current → supersede

## Revocation display

- `RevocationWorkflowPanel` shows workflow status + step timeline
- Failed workflows expose resume CTA (permission-gated)
- Revoke dialog shows impact before confirm; reason mandatory
- HTTP 409 / lifecycle conflicts → `parseLifecycleApiError` → user-facing conflict message

## Permissions

- Read: hub + detail load (`data-authorization` read)
- Lifecycle write actions: `data-authorization` write
- Approve / reject / activate / revoke / suspend: `data-authorization` manage
- Resume: backend `data_processing.resume` (manage path on frontend)

## Tests

```bash
cd frontend && npm test -- data-processing
```

| Suite | Coverage |
|-------|----------|
| `data-processing-detail.ui.test.tsx` | Dialogs, blockers, four-eyes, mobile footer |
| `data-processing-lifecycle.permissions.test.ts` | REJECT vs REVOKE, permission gates |
| `data-processing-lifecycle.errors.test.ts` | 409 / conflict codes |
| `data-processing-lifecycle.api.test.ts` | Action routing integration |

## Files

```
frontend/src/rental/components/settings/data-processing/detail/
  DataProcessingDetailHost.tsx
  ProcessingActivityDetailDrawer.tsx
  DpaDetailDrawer.tsx
  EntityDetailDrawer.tsx
  LifecycleActionDialog.tsx
  shared/
frontend/src/rental/lib/
  data-processing-lifecycle.api.ts
  data-processing-lifecycle.permissions.ts
  data-processing-lifecycle.errors.ts
  data-processing-timeline.mappers.ts
  data-processing-detail.types.ts
```
