# Workflow Runtime — Controlled Rollout Runbook

**Version V4.9.861** · **Phase 11 Prompt 51** · **2026-07-25**

This runbook describes the **server-side, tenant-safe rollout** of the new Workflow Runtime. All activation is enforced in the backend — the frontend cannot enable live execution alone.

## Rollout stages (ordered)

| Stage | Bridge path | Live engine | Shadow | External channels |
|-------|-------------|-------------|--------|-------------------|
| `DISABLED` | `legacy_only` | No | No | No |
| `SHADOW` | `shadow_compare` | No | Yes | No |
| `INTERNAL_ACTIONS_ONLY` | `workflow_live` | Yes (internal) | Yes | No |
| `SELECTED_WORKFLOWS` | allowlist-dependent | Pilot workflows only | Yes | No |
| `SELECTED_ORGANIZATIONS` | `workflow_live` | Yes (scoped orgs) | Yes | Per org flags |
| `EXTERNAL_COMMUNICATIONS_WITH_APPROVAL` | `workflow_live` | Yes | Optional | Per channel + approval |
| `GENERAL_AVAILABILITY` | `workflow_live` | Yes | Optional | Per channel |

**Effective stage** = `min(globalStage, orgStage)` with org allowlist checks. Default is **fail-closed** (`DISABLED`).

## Feature flags

### Global (environment — server only)

| Variable | Purpose | Default |
|----------|---------|---------|
| `WORKFLOW_RUNTIME_ROLLOUT_STAGE` | Global rollout stage | `DISABLED` |
| `WORKFLOW_RUNTIME_ORG_ALLOWLIST` | Comma-separated org IDs for `SELECTED_ORGANIZATIONS` | empty |
| `WORKFLOW_RUNTIME_KILL_SWITCH` | Global kill switch (all orgs → legacy) | `false` |
| `WORKFLOW_RUNTIME_KILL_EMAIL` | Block email actions | `false` |
| `WORKFLOW_RUNTIME_KILL_WHATSAPP` | Block WhatsApp actions | `false` |
| `WORKFLOW_RUNTIME_KILL_SMS` | Block SMS actions | `false` |
| `WORKFLOW_RUNTIME_KILL_VOICE` | Block voice actions | `false` |
| `WORKFLOW_RUNTIME_KILL_AI` | Block AI-generated content actions | `false` |
| `WORKFLOW_RUNTIME_KILL_CRITICAL` | Block critical actions | `false` |
| `WORKFLOW_RUNTIME_KILL_ACTION_TYPES` | Comma-separated action type kill list | empty |
| `WORKFLOW_RUNTIME_SHADOW_DEVIATION_THRESHOLD_PCT` | Max shadow deviation % for gates | `5` |
| `WORKFLOW_RUNTIME_GATE_TESTS_PASS` | CI gate: P0 + tenant tests green | `false` |
| `WORKFLOW_RUNTIME_MONITORING_ENABLED` | Monitoring linkage required for promotion | `false` |

### Per-organization (database + API)

Table: `org_workflow_runtime_rollout_settings`

| Field | Purpose |
|-------|---------|
| `stage` | Org-level stage cap |
| `workflow_allowlist` | Workflow IDs for `SELECTED_WORKFLOWS` |
| `channel_*_enabled` | Email, WhatsApp, SMS, voice, AI, critical |
| `kill_switch_*` | Org kill switch + per-channel |
| `monitoring_acknowledged` | Ops ack for monitoring linkage |

### API (ORG_ADMIN / MASTER_ADMIN)

Base: `GET|PATCH /api/v1/organizations/:orgId/workflows/runtime-rollout/*`

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/settings` | Org rollout settings + effective stage |
| `PATCH` | `/settings` | Update non-risky settings (not external/GA stage) |
| `GET` | `/flags?workflowId=` | Effective flags for org/workflow |
| `GET` | `/gates` | Pre-deployment gate evaluation |
| `POST` | `/stage-promotion` | Request stage promotion (maker-checker for risky) |
| `POST` | `/stage-promotion/:requestId/decide` | Approve/reject promotion |
| `PATCH` | `/kill-switch` | Org kill switch (per channel optional) |

## Kill switches

| Scope | Mechanism | Effect on in-flight runs |
|-------|-----------|--------------------------|
| Global | `WORKFLOW_RUNTIME_KILL_SWITCH=true` | New actions blocked; existing action completes |
| Provider | `WORKFLOW_RUNTIME_KILL_EMAIL` etc. | Blocks matching channel only |
| Organization | `PATCH .../kill-switch` | Org-scoped block |
| Action type | `WORKFLOW_RUNTIME_KILL_ACTION_TYPES` | Blocks specific action types |

Kill switch toggles are audited (`WORKFLOW_KILL_SWITCH_TOGGLED`). Settings rows are **not deleted** — rollback clears kill flags without data loss.

## Maker-checker (risky activation)

Stages `EXTERNAL_COMMUNICATIONS_WITH_APPROVAL` and `GENERAL_AVAILABILITY` require:

1. Pre-deployment gates **PASS** (`GET .../gates`)
2. `POST .../stage-promotion` → pending `workflow_runtime_rollout_change_requests`
3. Second admin: `POST .../stage-promotion/:id/decide` with `{ "decision": "APPROVED" }`

Direct `PATCH /settings` with risky stage returns **400**.

## Pre-deployment gates

| Gate ID | Requirement |
|---------|-------------|
| `P0_TESTS` | `WORKFLOW_RUNTIME_GATE_TESTS_PASS=true` |
| `TENANT_TESTS` | Same CI flag |
| `SHADOW_DEVIATION` | Deviation % ≤ threshold (from shadow comparisons) |
| `DEAD_LETTER_RATE` | Manual ops review |
| `PROVIDER_WEBHOOKS` | CI / provider verification |
| `MONITORING_ACTIVE` | `WORKFLOW_RUNTIME_MONITORING_ENABLED` + org `monitoringAcknowledged` |
| `ROLLBACK_TESTED` | CI flag |
| `COMPLIANCE_CONFIG` | Org rollout settings row exists |

Run locally:

```bash
cd backend && npm run test:workflow-automation:verify
# then set WORKFLOW_RUNTIME_GATE_TESTS_PASS=true for promotion
```

## Recommended rollout procedure

### 1. Shadow pilot

```bash
WORKFLOW_RUNTIME_ROLLOUT_STAGE=SHADOW
WORKFLOW_RUNTIME_MONITORING_ENABLED=true
```

Enable org shadow settings (`.../workflows/shadow/settings`) and monitor deviations.

### 2. Internal actions

```bash
WORKFLOW_RUNTIME_ROLLOUT_STAGE=INTERNAL_ACTIONS_ONLY
```

Org: `PATCH .../runtime-rollout/settings` `{ "stage": "INTERNAL_ACTIONS_ONLY", "criticalActionsEnabled": true }`

### 3. Workflow pilot

```bash
WORKFLOW_RUNTIME_ROLLOUT_STAGE=SELECTED_WORKFLOWS
```

Org: `{ "stage": "SELECTED_WORKFLOWS", "workflowAllowlist": ["<workflow-uuid>"] }`

### 4. Org pilot

```bash
WORKFLOW_RUNTIME_ROLLOUT_STAGE=SELECTED_ORGANIZATIONS
WORKFLOW_RUNTIME_ORG_ALLOWLIST=org-uuid-1,org-uuid-2
```

### 5. External communications

Request promotion via maker-checker after gates PASS. Enable channels selectively:

```json
{
  "channelEmailEnabled": true,
  "channelWhatsappEnabled": false,
  "monitoringAcknowledged": true
}
```

### 6. General availability

Maker-checker approval to `GENERAL_AVAILABILITY`.

## Rollback (no data loss)

1. **Fast:** Set `WORKFLOW_RUNTIME_KILL_SWITCH=true` or org kill switch — immediate legacy path, settings preserved.
2. **Stage rollback:** `PATCH /settings` `{ "stage": "DISABLED" }` or lower stage (non-risky stages direct; risky stages use promotion flow in reverse by setting global env).
3. **Env fallback:** When global + org stage are `DISABLED`, task-automation bridge respects legacy `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE` (`legacy` | `shadow` | `cutover`).

In-flight workflow runs: actions already executing complete; subsequent actions receive `rolloutBlocked` in action output. No duplicate legacy + workflow execution on the bridge.

## Monitoring linkage

- Set `WORKFLOW_RUNTIME_MONITORING_ENABLED=true`
- Org admin acknowledges via `monitoringAcknowledged: true`
- Gate `MONITORING_ACTIVE` must pass before risky promotion
- Audit events: `WORKFLOW_ROLLOUT_STAGE_CHANGED`, `WORKFLOW_KILL_SWITCH_TOGGLED`

## No double execution

`TaskAutomationExecutionRouterService` resolves a single path per event:

- `legacy_only` → legacy task automation only
- `shadow_compare` → legacy + workflow preview (no execute)
- `workflow_live` → workflow engine only (no legacy)
- `blocked` → log + skip

`WorkflowEngineService` uses rollout flags for live vs shadow. `WorkflowActionExecutorService` enforces channel and stage policy per action.

## Related documentation

- Shadow mode: `docs/operations/workflow-shadow-mode-2026-07.md`
- Production tests: `docs/testing/workflow-automation-production-test-matrix-2026-07.md`
- Tests: `backend/src/modules/workflows/rollout/workflow-runtime-rollout.spec.ts`

## Pre-deployment checklist

- [ ] `npm run test:workflow-automation:verify` green
- [ ] Shadow deviation under threshold for pilot org(s)
- [ ] Provider webhooks verified (voice/WhatsApp)
- [ ] Monitoring dashboards active
- [ ] Rollback drill completed (kill switch + stage DISABLED)
- [ ] Compliance / org rollout settings row created
- [ ] `WORKFLOW_RUNTIME_GATE_TESTS_PASS=true` set for promotion window

**Gate status:** evaluate via `GET .../workflows/runtime-rollout/gates` → `status: PASS | FAIL`
