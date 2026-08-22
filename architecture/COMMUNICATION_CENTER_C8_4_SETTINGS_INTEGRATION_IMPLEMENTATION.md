# Communication Center C8.4 — Settings Integration Implementation

**Date:** 2026-08-22
**Phase:** C8.4 (including final security / read-semantics hardening)
**Branch:** `feature/communication-center-c8-4-settings-integration`
**PR:** #1174
**Base:** `main` after PR #1169 (C8.3)

## Scope

- Expose **Inbox | Settings** primary tabs in Communication Center
- Secondary nav: **Overview | WhatsApp | Voice | SMS**
- URL: `communicationTab=settings`, `communicationSettings=overview|whatsapp|voice|sms`
- Reuse existing provider settings surfaces in standalone pages and embedded settings
- Read-only SMS config via `GET /organizations/:orgId/sms/config` (safe DTO, no secrets, **no GET side effects**)
- RBAC, org-scoped race safety, i18n, responsive layout (390 / 1024 / 1440)

**Out of scope:** sent.dm credential provisioning UI, email channel, composer/send, sidebar dedup, Integration Hub redesign, live provider health probes.

---

## 1. WhatsApp component / hook reuse

| Concern | Owner |
|---------|--------|
| Settings UI shell | `frontend/src/rental/components/whatsapp/WhatsAppBusinessSettings.tsx` |
| Fetch / save / connect / disconnect | `frontend/src/rental/components/whatsapp/useWhatsAppBusinessSettings.ts` |
| Form panels / wizard | `WhatsAppSettingsPanel.tsx`, `WhatsAppSetupWizard.tsx` |

**Embedded:** `CommunicationSettingsPane` mounts `<WhatsAppBusinessSettings enabled={settingsActive} />` when `communicationSettings=whatsapp`.

**Standalone:** `WhatsAppBusinessView` (`view=whatsapp-business`) mounts the same `WhatsAppBusinessSettings` on its settings tab — no duplicated business logic.

---

## 2. Voice component / hook reuse

| Concern | Owner |
|---------|--------|
| Settings UI shell | `frontend/src/rental/components/voice-assistant/VoiceAgentSettings.tsx` |
| Fetch / save / readiness / voices | `frontend/src/rental/components/voice-assistant/useVoiceAgentSettings.ts` |
| Builder / telephony wizard | `VoiceAssistantBuilder.tsx`, `VoiceTelephonyWizard.tsx` |

**Embedded:** `CommunicationSettingsPane` mounts `<VoiceAgentSettings enabled={settingsActive} />` when `communicationSettings=voice`.

**Standalone:** `VoiceAssistantView` (`view=ai-voice-assistant`) mounts the same `VoiceAgentSettings` on its settings tab.

---

## 3. SMS public-read DTO

`backend/src/modules/sms/sms-config.public.ts` defines `SmsConfigPublicDto`:

```ts
{
  organizationId: string;
  hasConfigRow: boolean;
  isConnected: boolean;
  isActive: boolean;
  credentialsConfigured: boolean;        // OrgSmsConfig.apiKeyConfigured
  webhookSigningConfigured: boolean;     // OrgSmsConfig.webhookSigningSecretConfigured
  senderProfileConfigured: boolean;      // Boolean(senderProfileId)
  webhookEndpointConfigured: boolean;    // Boolean(webhookEndpointId)
  lastWebhookAt: string | null;
  updatedAt: string | null;
}
```

Frontend allowlist mapper: `communication-settings-sms-mapper.ts` (`mapSmsConfigPublic`) strips unexpected secret-shaped fields.

---

## 4. GET is side-effect free

`SmsConfigService.getPublicConfig()` performs `findUnique` only.

- **Never** calls `create`, `update`, or `upsert`
- Missing row → `buildSyntheticSmsConfigPublicDto(orgId)` with `hasConfigRow: false`, `updatedAt: null`
- Permanent regression test: `"GET sms config does not create OrgSmsConfig"`

---

## 5. Missing SMS config synthetic state

| DB state | `hasConfigRow` | `updatedAt` | UI status |
|----------|----------------|-------------|-----------|
| No `OrgSmsConfig` row | `false` | `null` | `NOT_CONFIGURED` |
| Row exists, `apiKeyConfigured=false` | `true` | row timestamp | `NOT_CONFIGURED` |
| Row exists, partial runtime flags | `true` | row timestamp | `CONFIGURED` or `DEGRADED` |
| Row connected + active + full runtime | `true` | row timestamp | `CONNECTED` |

Row existence alone does **not** imply configured.

---

## 6. SMS status authority (C5 / C5.2 flags only)

Resolver: `resolveSmsSettingsStatus()` in `communication-settings-status.ts`.

Runtime readiness requires all of:

- `credentialsConfigured`
- `webhookSigningConfigured`
- `webhookEndpointConfigured`
- `senderProfileConfigured`

| Status | Conditions |
|--------|------------|
| `NOT_CONFIGURED` | no row OR no API credential |
| `CONFIGURED` | credential and/or partial runtime without full connection |
| `CONNECTED` | `isConnected && isActive &&` full runtime readiness |
| `DEGRADED` | `isConnected` but inactive or missing required runtime pieces |
| `DISABLED` | connected but inactive (inactive-over-connected mismatch) |

No provider network calls for status.

---

## 7. Settings-primary RBAC decision

`canAccessCommunicationSettings()` grants the **Settings primary tab** only when the user can **manage** at least one channel:

- WhatsApp: `communication.manage`
- Voice: `voice-assistant.write`
- SMS (future manage UI): `communication.manage`

`communication.read` alone (Inbox operational access) does **not** open Settings.

Deep links `?communicationTab=settings` normalize back to Inbox when unauthorized (`CommunicationCenterShell` effect).

---

## 8. SMS read vs settings-access distinction

| Capability | Permission / rule |
|------------|-------------------|
| Backend `GET /sms/config` | `communication.read` (operationally safe public DTO) |
| Settings primary tab | provider manage permission(s) |
| SMS section inside Settings | `canViewSmsSettingsInSettings` = Settings access **and** `communication.read` |

A WhatsApp-only administrator with `communication.manage` but without `communication.read` does not see the SMS section until read is granted.

---

## 9. Org / save race safety

`useOrgScopedGenerationRef` used in:

- `useWhatsAppBusinessSettings`
- `useVoiceAgentSettings`
- `useSmsSettings`
- `useCommunicationSettingsOverview`

Stale org responses and save completions are ignored when org changes mid-flight. Save toasts do not fire for stale org completions.

---

## 10. Secret boundary

- Backend public DTO omits `apiKey`, `webhookSigningSecret`, tokens
- Frontend `mapSmsConfigPublic` allowlists fields
- Settings load errors render localized copy, not raw provider messages
- Overview channel errors use `communication.settings.loadError` only

---

## 11. Overview request strategy

`useCommunicationSettingsOverview` issues **bounded** parallel reads when Overview is active:

| User permission | Requests |
|-----------------|----------|
| `communication.manage` | 1× `api.whatsapp.getConfig` |
| `voice-assistant.write` | 1× `api.voiceAssistant.get` |
| Settings access + `communication.read` | 1× `api.sms.getConfig` |

Maximum at full permissions: **3** status reads. No full settings forms mounted on Overview.

---

## 12. Request suspension

| Shell state | Inbox hooks | Settings hooks |
|-------------|-------------|----------------|
| Inbox active | inbox + conversation hooks enabled | settings pane unmounted (`enabled=false`) |
| Settings active | conversation hook `enabled=false` when no selected conversation path | only active section's component loads (`enabled` prop) |

`useCommunicationConversation` is disabled when `!inboxActive`.

---

## 13. Responsive behavior (390 / 1024 / 1440)

- **390 mobile:** primary tabs + horizontal settings nav scroll; overview cards stack; SMS panel readable; `assertNoHorizontalOverflow` in E2E
- **1024 tablet:** secondary nav usable; settings shell without inbox 3-pane leak
- **1440 desktop:** overview + deep links + history navigation E2E

Breakpoints: `communication-center-breakpoints.ts`, shell `matchMedia` hooks.

---

## 14. Old route compatibility

| Route | Behavior |
|-------|----------|
| `view=whatsapp-business` | `WhatsAppBusinessView` → shared `WhatsAppBusinessSettings` |
| `view=ai-voice-assistant` | `VoiceAssistantView` → shared `VoiceAgentSettings` |

No Communication Center shell nested inside legacy routes. RBAC unchanged from pre-C8.4 standalone pages.

---

## 15. Sidebar duplication decision

**Option A (current):** Keep legacy WhatsApp / Voice sidebar entries **and** Communication Center consolidated settings. Old routes remain first-class.

---

## 16. Tests

### Backend
- `sms-config.service.spec.ts` — pure read, parallel GET, no-create regression
- `sms.controller.spec.ts` — guards, permission metadata
- `sms-config.http-security.integration.spec.ts` — 200 synthetic / existing row, 403 RBAC, no secrets

### Frontend
- `communication-settings-permissions.test.ts`
- `communication-settings-status.test.ts`
- `communication-settings-sms-mapper.test.ts`
- `communication-settings-secrets.test.tsx`
- `communication-center-shell.test.tsx` — read-only deep link
- `useCommunicationSettingsOverview.test.ts` — channel RBAC + org switch
- `useSmsSettings.race.test.ts`
- `useWhatsAppBusinessSettings.race.test.ts` — load + save org switch
- `useVoiceAgentSettings.race.test.ts`
- `communication-settings-standalone.test.tsx`

### E2E (Playwright)
- `communication-center-settings.spec.ts` — 390 / 1024 / 1440, read-only deep link, URL back/forward, no provider browser calls

---

## 17. Known limitations

1. SMS read-only — no credential provisioning / manage UI (future `communication.manage` section)
2. No live provider health probes for badges
3. Sidebar duplication with legacy entries remains
4. Save error toasts use generic titles; provider error bodies are not rendered in load surfaces

---

## 18. Next phase readiness

**READY FOR NEXT COMMUNICATION PHASE** after PR #1174 merge — composer, nav dedup, sent.dm provisioning UI, mark-read mutations.

**Not started:** C8.5+ work intentionally deferred.
