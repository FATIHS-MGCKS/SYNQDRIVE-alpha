# Changes & Architektur — Voice AI Information Architecture (2026-07-18)

## Changes

- **Backend workspace API** — `GET/PATCH /organizations/:orgId/voice-assistant/workspace` derives org voice primary state (`NO_PLAN`, `ONBOARDING`, `READY_TO_ACTIVATE`, `ACTIVE`, `DEGRADED`, `SUSPENDED`) from subscription, rollout, provisioning, agent deployment, telephony, MCP, webhooks, readiness, and budget signals.
- **Server-persisted onboarding** — `VoiceAssistant.onboarding_step` + `onboarding_completed_steps` (migration `20260718140000_voice_onboarding_workspace`); replaces localStorage as resume source of truth.
- **Frontend IA layer** — `voice-information-architecture.ts` (URL params `voiceStep`, `voiceTab`, `voiceSettings`), `useVoiceWorkspace` (fetch + `pushState`/`popstate`), `VoiceSettingsPanel` (8 settings sections; diagnostics only under Diagnose).
- **VoiceAssistantView refactor** — single shell via `VoicePageShell` + `VoiceResponsiveTabs`; wizard controlled by server `allowedSteps`; technical IDs masked via `maskTechnicalId`.
- **Deep links** — `App.tsx` opens `ai-voice-assistant` when voice URL params are present; browser back/forward reconciled against server route validation.

## Architektur

### State derivation (server)

| Input | Role in primary state |
|-------|------------------------|
| `VoiceSubscription` | `NO_PLAN`, `SUSPENDED`, budget entitlement |
| Org / rollout flags | `ONBOARDING` gating, phased availability |
| Provisioning + agent deployment | `READY_TO_ACTIVATE`, deployment failure issues |
| Telephony + MCP + webhooks | readiness blockers, `DEGRADED` |
| Readiness checklist | activation eligibility |
| Budget / protection | `DEGRADED`, budget-blocked issues |

`VoiceWorkspaceService` returns: `primaryState`, `issues[]`, `navigation` (wizard step or ops tab + settings section), `completedSteps`, `allowedSteps`, `routeValidation`.

### Navigation model

**Onboarding (pre-activation):** plan → assistant → knowledge → permissions → phone → availability → tests → activation.

**Post-activation ops tabs:** overview, conversations, automations, analytics, settings.

**Settings sections:** assistant, knowledge, permissions, telephony, availability, privacy, budget, diagnostics.

URL query params mirror navigation; invalid jumps blocked server-side and reconciled client-side on load/popstate.

### Frontend data flow

```
VoiceAssistantView
  → useVoiceWorkspace(orgId)
      → GET workspace (state + navigation)
      → PATCH onboarding-step on wizard advance
      → history.pushState / popstate for tabs & settings
  → existing voice-assistant APIs for entity CRUD, billing, protection
```

Provider diagnostics (`VoiceProviderDiagnostic`) render only when `settingsSection === 'diagnostics'`.

### Deprecations

- `loadWizardStep` / `saveWizardStep` (localStorage) — deprecated; retained for backward-compatible tests only.
