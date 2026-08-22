# Communication Center C8.4 — Settings Integration Implementation

**Date:** 2026-08-22  
**Phase:** C8.4  
**Branch:** `feature/communication-center-c8-4-settings-integration`  
**Base:** `main` after PR #1169 (C8.3)

## Scope

- Expose **Inbox | Settings** primary tabs in Communication Center
- Secondary nav: **Overview | WhatsApp | Voice | SMS**
- URL: `communicationTab=settings`, `communicationSettings=overview|whatsapp|voice|sms`
- Reuse `WhatsAppBusinessSettings` + `VoiceAgentSettings` in standalone pages and embedded settings
- Read-only SMS config via `GET /organizations/:orgId/sms/config` (safe DTO, no secrets)
- RBAC, org-scoped race safety, i18n, responsive layout

**Out of scope:** sent.dm credential provisioning, email channel, composer/send, sidebar dedup, Integration Hub redesign.

## Audits

| Channel | Standalone route | Settings reuse | RBAC |
|---------|------------------|----------------|------|
| WhatsApp | `view=whatsapp-business` | `WhatsAppBusinessSettings` | `communication.manage` |
| Voice | `view=ai-voice-assistant` | `VoiceAgentSettings` | `voice-assistant.write` |
| SMS | none (new) | `SmsSettingsPanel` (read-only) | `communication.read` |
| Email/Resend | Administration → Email | **Not in C8.4** | N/A |

## URL state

`communication-center-navigation.ts` — settings tab no longer normalized to inbox; invalid `communicationSettings` → `overview`.

## Status authority

`communication-settings-status.ts` — CONNECTED / CONFIGURED / NOT_CONFIGURED / DEGRADED / DISABLED from backend flags only.

## Secret handling

No secret read endpoints. WhatsApp/Voice existing masked/configure-only UX preserved. SMS DTO exposes `credentialsConfigured` boolean only.

## RBAC

Settings tab visible when user can access any channel section. Channel sections hidden when unauthorized.

## Tenant isolation

`useOrgScopedGenerationRef` — stale org responses and save completions ignored.

## Navigation decision

**Option A:** Keep WhatsApp/Voice sidebar entries; Communication Center adds consolidated settings path. Old routes remain.

## Key files

- `CommunicationCenterShell.tsx`, `CommunicationSettingsPane.tsx`, `CommunicationSettingsOverview.tsx`
- `useWhatsAppBusinessSettings.ts`, `useVoiceAgentSettings.ts`, `useSmsSettings.ts`
- `backend/src/modules/sms/sms-config.service.ts`, `sms.controller.ts`

## Known limitations

1. SMS read-only — no credential provisioning UI  
2. No live provider health probes for badges  
3. Sidebar duplication with legacy entries remains  

## Next phase

**READY FOR NEXT COMMUNICATION PHASE** — composer, nav dedup, sent.dm provisioning, mark-read mutations.
