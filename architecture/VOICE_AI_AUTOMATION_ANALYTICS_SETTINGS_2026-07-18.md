# Voice AI — Automations, analytics & settings (7B)

**Date:** 2026-07-18  
**Scope:** Post-activation rental org voice operations — automations tab, analytics & usage, settings completion

## Summary

Voice automations bind to the existing **OrgWorkflow** engine (no second automation engine). Analytics derive quality metrics from **finalized conversations only**. Settings sections for availability, privacy, budget, and admin-only diagnostics are fully wired.

## Automations

Eight predefined use cases in `voice-automation.catalog.ts`:

| Use case | Trigger (workflow) |
|----------|-------------------|
| pickup_confirmation | manual.test |
| return_reminder | booking.completed |
| overdue_return | booking.returned |
| no_show | manual.test |
| missing_document | manual.test |
| open_payment | invoice.overdue |
| callback | customer.complaint.created |
| damage_followup | customer.complaint.created |

Each workflow stores `scope.voiceAutomation` metadata and uses `notification.prepare` with `channel: 'voice'`.

**UI (`VoiceAutomationsPanel`):** status, trigger, audience, assistant, cooldown, last run, outcome, budget summary, preview (dry-run), enable/disable with confirmation, detail sheet.

**Protection:** cooldown, max calls per run, destination countries, `requiresConfirmation`, budget policy from `protection/status`.

## Analytics & usage

**`voice-analytics.ops.ts`:** solution rate, escalation rate (finalized only), peak hours, top intents (aggregated, no PII), provider error count, process gap hints.

**`VoiceAnalyticsView` + `VoiceUsageBillingSection`:** minutes, included/overage, forecast, estimated cost label (never shown as final), finalized-only badge.

## Settings

| Section | Component |
|---------|-----------|
| availability | `VoiceAvailabilityPanel` (existing) |
| privacy | `VoicePrivacySettingsPanel` — `businessHours.privacyRetention` |
| budget | `VoiceBudgetSettingsPanel` — `protection/budget-policy` |
| diagnostics | `VoiceDiagnosticsPanel` — admin only, masked IDs, agent deployment readiness/deploy/rollback with confirmation |

Diagnostics tab hidden for non-admin roles in `VoiceSettingsPanel`.

## APIs

- `GET|POST|PATCH` workflows (existing)
- `GET /voice-assistant/protection/status`, `PATCH .../budget-policy`
- `GET /voice-assistant/billing/usage|forecast|subscription|plans`
- `GET|PATCH /voice-assistant/agent-deployment/draft|diff|readiness`, `POST deploy|rollback`

## Data rules

- Estimated vs final costs clearly labeled; no estimates as final billing
- Unfinalized calls excluded from solution/escalation rates
- No customer PII in aggregate charts (intent labels from normalized summaries only)
- No secrets in diagnostics UI

## Frontend modules

| Module | Role |
|--------|------|
| `voice-automation.catalog.ts` | 8 use case definitions |
| `voice-automation.ops.ts` | Workflow merge, create/update payloads |
| `VoiceAutomationsPanel.tsx` | Automations tab UI |
| `voice-analytics.ops.ts` | Client-side analytics derivation |
| `VoiceAnalyticsView.tsx` | Quality & aggregate charts |
| `voice-privacy.ops.ts` | Privacy retention parse/serialize |
| `VoicePrivacySettingsPanel.tsx` | Privacy settings |
| `VoiceBudgetSettingsPanel.tsx` | Budget settings |
| `VoiceDiagnosticsPanel.tsx` | Admin diagnostics |

## i18n

`voice.automation.*`, `voice.analytics.*`, `voice.budget.*`, `voice.privacy.*`, `voice.diagnostics.*` (DE/EN).
