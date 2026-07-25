# Workflow Audit Logging, PII Redaction & AI Transparency (V4.9.853)

**Date:** 2026-07-25  
**Scope:** Durable audit trail, privacy-safe logging, and AI disclosure for Workflow Automation.

## Audit events

All events are stored in `org_workflow_audit_events` with org-scoped reads and retention class metadata.

| Event | When |
|-------|------|
| `WORKFLOW_CREATED` | Workflow created |
| `WORKFLOW_DRAFT_CHANGED` | Draft/definition updated |
| `WORKFLOW_PUBLISHED` | Publish submitted (may be pending activation) |
| `WORKFLOW_ACTIVATED` | Workflow enabled / approved activation |
| `WORKFLOW_DEACTIVATED` | Workflow disabled |
| `WORKFLOW_ARCHIVED` | Workflow deleted |
| `WORKFLOW_DRY_RUN` | Manual test / dry run |
| `WORKFLOW_EXTERNAL_TEST` | External integration test |
| `WORKFLOW_RUN_STARTED` | Runtime execution started |
| `WORKFLOW_CONDITION_EVALUATED` | Trigger conditions evaluated |
| `WORKFLOW_ACTION_STARTED` | Action execution started |
| `WORKFLOW_ACTION_SUCCEEDED` | Action completed successfully |
| `WORKFLOW_ACTION_RETRY` | Reserved for retry paths |
| `WORKFLOW_ERROR` | Structured error summary |
| `WORKFLOW_APPROVAL_REQUESTED` | Maker-checker / runtime approval requested |
| `WORKFLOW_APPROVAL_APPROVED` | Checker approved |
| `WORKFLOW_APPROVAL_REJECTED` | Checker rejected |
| `WORKFLOW_APPROVAL_EXPIRED` | Pending approval expired |
| `WORKFLOW_RUN_ABORTED` | Run failed/aborted |
| `WORKFLOW_DEAD_LETTER` | Dead-letter replay requested |
| `WORKFLOW_REPLAY` | Dead-letter replay executed after approval |
| `WORKFLOW_POLICY_BLOCKED` | Unsupported/blocked action |
| `WORKFLOW_RECIPIENT_RESOLVED` | Notification recipient resolved (redacted) |
| `WORKFLOW_PROVIDER_STATUS` | Provider/AI metadata recorded |

Governance-class events are mirrored to `activity_logs` (`ActivityEntity.WORKFLOW`).

## API

- `GET /organizations/:orgId/workflows/audit-events`
- `GET /organizations/:orgId/workflows/audit-events/:eventId`
- `GET /organizations/:orgId/workflows/audit-events/retention`

Run payloads returned by `GET …/runs` are redacted at read time.

## PII redaction rules

Applied on **write** (audit rows) and **read** (run/action payloads):

| Data | Rule |
|------|------|
| Phone numbers | Mask to `***1234` (last 4 digits) |
| Email addresses | Mask local part (`a***@domain.com`) |
| Customer names | Initials only when keyed as name fields |
| Document numbers | `[REDACTED]` |
| Tokens / API keys / long secrets | `[REDACTED]` |
| Message bodies / transcripts | Truncated (max 120 chars in standard logs) |
| Sensitive JSON keys | Key-based redaction (`token`, `secret`, `iban`, …) |

Secret scan runs before persistence; violations are force-redacted and logged.

Error summaries use `summarizeWorkflowError()` — no raw stack traces with PII in audit rows.

## AI transparency

- `buildAiMessageTransparency()` — marks AI-generated content, names responsible organization, records `modelId` + `promptVersion`, sets `humanAgentClaim: false`
- `buildAiCallOpeningScript()` — voice opening script disclosing digital assistant + AI assistance
- Stored in `aiTransparency` JSON on audit events for AI-related actions

## Retention classes

| Class | Default retention | Contents |
|-------|-------------------|----------|
| `TECHNICAL_LOG` | 90 days | Runs, actions, conditions, provider status |
| `REVISION_AUDIT` | 365 days | Definition create/update metadata |
| `GOVERNANCE_AUDIT` | ~7 years | Publish, approvals, policy blocks, dead-letter |

- `legalHold` column supported on audit events — **not auto-enabled** (Legal Hold requires explicit ops policy)
- Technical logs and revision/governance audit data are stored separately via `retentionClass`
- Deletion/blocking: purge jobs should respect `legalHold=true` and class-specific windows (scheduler hook planned; metadata exposed via retention endpoint)

## Code map

- `backend/src/modules/workflows/audit/*`
- `backend/prisma/migrations/20260725140000_workflow_audit_ai_transparency/`
- Hooks: `workflows.service.ts`, `workflow-engine.service.ts`, `workflow-action-executor.service.ts`, `workflow-maker-checker.service.ts`

## Security and Compliance Gate

**PASS** when:

- All listed lifecycle events emit durable audit rows
- PII redaction + secret scan active on audit write
- Cross-tenant audit reads denied
- AI disclosures include organization + model/prompt version
- Retention metadata documented; legal hold not auto-enabled
