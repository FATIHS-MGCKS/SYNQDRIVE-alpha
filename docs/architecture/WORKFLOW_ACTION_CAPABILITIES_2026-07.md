# Workflow action capabilities (2026-07)

## Goal

Prevent unknown, incomplete, or non-production workflow actions from being saved, activated, or executed. The server maintains the authoritative capability matrix; the client only renders it.

## Capability statuses

| Status | Meaning |
|--------|---------|
| `AVAILABLE` | Registered handler, selectable, executable |
| `INTERNAL_ONLY` | Reserved for internal/system flows (not in UI) |
| `EXPERIMENTAL` | Behind capability gate (not activatable) |
| `DISABLED` | Known type but blocked (e.g. channel adapters) |
| `UNSUPPORTED` | Catalogued but no handler (e.g. cleaning status) |

## Error codes

- `WORKFLOW_ACTION_UNKNOWN`
- `WORKFLOW_ACTION_DISABLED`
- `WORKFLOW_ACTION_UNSUPPORTED`
- `WORKFLOW_ACTION_MISSING_HANDLER`
- `WORKFLOW_ACTION_INVALID_CONFIG`
- `WORKFLOW_ACTION_NOT_ACTIVATABLE`
- `WORKFLOW_ACTION_EXPERIMENTAL_NOT_ALLOWED`

## API

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/workflows/action-capabilities` | Server allowlist + revision |
| `POST` | `/workflows/:id/preview-actions` | Dry-run style capability plan |
| `POST` | `/workflows/:id/test` | Blocks LIVE run when actions invalid |

## Production-available actions

- `task.create`
- `alert.create`
- `vehicle.status.update`
- `notification.prepare` (draft only — no external send)
- `workflow.approval.request`
- `ai.suggest_action`

## Blocked until adapters exist

- `channel.email.send`, `channel.whatsapp.send`, `channel.sms.send`, `voice.call.initiate`
- `ai.execute`, `ai.send_message`, `ai.book_appointment`
- `customer.contact.send`, `invoice.charge`, `booking.cancel`

## Remediation

Migration `20260725120000_workflow_action_capabilities` adds `remediation_required` fields and disables workflows with known invalid stored actions.

Capability revision: `WORKFLOW_ACTION_CAPABILITY_REVISION` in `workflow-action-capabilities.ts` — bump when matrix changes.
