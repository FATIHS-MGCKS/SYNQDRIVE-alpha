# Communication Center C10 Completion — Channel Configuration Navigation

**Date:** 2026-08-23  
**Phase:** C10 — Channel configuration migration  
**Branch:** `feature/communication-center-c10-completion`  
**Prerequisite audit:** PR #1212 / `COMMUNICATION_CENTER_C9_C12_PARITY_SIGNOFF_2026_08.md`  
**Base:** `main` @ post-#1205

## 1. Scope

Implements canonical Communication Center IA for **Channels** and **Automations** without duplicating provider UIs or removing legacy operational inboxes.

**In scope**

- Primary tabs: Inbox | **Channels** | AI Activity | **Automations** | Settings
- Channels landing (WhatsApp, Voice, SMS, Email) with provider metadata + readiness
- Channels → WhatsApp: reuse settings, templates, channel overview/stats (no inbox)
- Channels → Voice: compact status + deep-links to specialized Voice Assistant surfaces
- Channels → SMS: reuse read-only `SmsSettingsPanel`
- Channels → Email: canonical deep-link to Administration → Email settings
- Automations: thin landing + deep-link to `WorkflowAutomationView`
- Voice deep-link URL contract (`voiceOpsTab`, `voiceSettingsSection`, `voiceWizardStep`)
- RBAC, org-scoped loading, responsive layout, i18n (all governed locales: en, de, fr, nl, es, it, pl, cs)

**Out of scope**

- C9 operational parity (legacy WhatsApp/Voice inboxes remain)
- C13 legacy nav removal / retention / observability
- sent.dm credential provisioning
- Duplicating Voice builder, workflow engine, or email UI

## 2. Audit gaps addressed (PR #1212)

| Gap | C10 resolution |
|-----|----------------|
| No CC Channels IA | **Channels** primary tab + landing + per-channel sections |
| WhatsApp templates legacy-only | Reused `WhatsAppTemplateManager` under Channels → WhatsApp |
| WhatsApp channel stats legacy-only | Reused `WhatsAppOverviewTab` components (readiness + KPI cards) |
| Voice specialized surfaces unreachable from CC | Deep-links via `voiceOpsTab` / `voiceSettingsSection` / `voiceWizardStep` |
| Email config only under Administration | Channels → Email → open `settings/email-versand` |
| Automations not linked from CC | **Automations** tab → `workflow-automation` view |
| Settings held all channel config | Settings retained for org-wide/provider admin; Channels is canonical entry |

## 3. Final Channels IA

```
Communication Center
├── Inbox (Conversations)
├── Channels
│   ├── Overview (cards)
│   ├── WhatsApp (overview | configuration | templates)
│   ├── Voice (status + deep-links)
│   ├── SMS (read-only sent.dm status)
│   └── Email (status + open settings)
├── AI Activity
├── Automations (landing → Workflow Automation)
└── Settings (overview | whatsapp | voice | sms — temporary overlap)
```

URL params:

- `communicationTab=channels|automations`
- `communicationChannels=overview|whatsapp|voice|sms|email`

## 4. WhatsApp

- **Configuration:** `WhatsAppBusinessSettings` (shared with Settings)
- **Templates:** `WhatsAppTemplateManager` (CRUD via existing API)
- **Analytics/readiness:** `WhatsAppReadinessStrip`, `WhatsAppKpiCards`, `GET .../whatsapp/stats`
- **Open conversations:** routes to CC Inbox (`channel=whatsapp`), not legacy inbox
- **Quick actions classification:** **OPERATIONAL** (per-conversation `WhatsAppQuickActions`) — remains C9; not moved to Channels

## 5. Voice

Specialized surfaces open in `VoiceAssistantView` via deep-link:

| Surface | Deep-link |
|---------|-----------|
| Configure agent / telephony | `voiceOpsTab=settings` |
| Analytics | `voiceOpsTab=analytics` |
| Voice automations | `voiceOpsTab=automations` |
| Test assistant | `voiceSettingsSection=test` (configured) or `voiceWizardStep=tests` (onboarding wizard) |
| Conversations | CC Inbox `channel=voice` — **not** legacy conversations tab |

Master-admin control plane remains outside rental CC.

## 6. SMS

- Reuses `SmsSettingsPanel`
- Truthful `NOT_CONFIGURED` when sent.dm credentials absent
- No fabricated send/setup capability

## 7. Email

- Transactional email V1 — **not** in Conversations inbox
- Channels → Email shows Resend/platform status summary
- **Open email settings** → `settings` view + `email-versand` tab (org admin)

## 8. Automations

- Thin `CommunicationAutomationsPane` + CTA
- Reuses `WorkflowAutomationView` (no duplicate engine)
- Gated by `workflow-automation.read`

## 9. Settings responsibility

Settings tab retains C8.4 provider panels for users with `communication.manage` (and voice admin). Channels is the **canonical customer-facing entry** for channel configuration. Temporary overlap is documented; no duplicate API contracts.

## 10. Deep-link contracts

| Target | Mechanism |
|--------|-----------|
| CC Conversations + channel | `communicationTab=inbox` + `communicationChannel=` |
| Voice Assistant ops tab | `view=ai-voice-assistant&voiceOpsTab=` |
| Voice settings subview (configured) | `voiceSettingsSection=test|builder|telephony` |
| Voice onboarding test step | `voiceWizardStep=tests` (only while wizard active) |
| Email settings | App navigation → `settings` + `email-versand` session tab |
| Workflow automation | App navigation → `workflow-automation` |

## 11. RBAC

| Surface | Permission |
|---------|------------|
| Channels landing | `communication.read` |
| WhatsApp/Voice config sections | `communication.manage` / voice admin |
| SMS section | `communication.read` + settings access |
| Email section | `ORG_ADMIN` / `MASTER_ADMIN` |
| Automations CTA | `workflow-automation.read` |

## 12. Tenant / race safety

- `useCommunicationChannelsOverview`, `useWhatsAppChannelPane`, email pane use `useOrgScopedGenerationRef`
- Org switch invalidates in-flight channel status requests

## 13. Responsive

- Channels landing: single-column cards on mobile (390)
- Primary tabs: horizontal scroll on narrow viewports
- Voice action grid: stacks on small screens

## 14. Accessibility

- Semantic `nav` for channels sub-navigation
- `aria-label` on status chips
- Keyboard-accessible channel cards and deep-link buttons

## 15. i18n

- C10 keys under `communication.primary.channels`, `communication.primary.automations`, `communication.channels.*`, and `communication.automations.*` are defined in **all governed locales**: `en`, `de`, `fr`, `nl`, `es`, `it`, `pl`, `cs`
- Parity enforced by `communication-center-c10.i18n.test.ts` (missing keys, non-English copy in non-en locales, no duplicate keys)

## 16. Voice Test Center deep-link

| Assistant state | URL contract | Surface |
|-----------------|--------------|---------|
| Onboarding (`showWizard=true`) | `voiceWizardStep=tests` | `VoiceOnboardingWizard` tests step |
| Configured (`showWizard=false`) | `voiceOpsTab=settings&voiceSettingsSection=test` | Reused `VoiceTestCenter` in `VoiceAssistantView` settings path |

`resolveVoiceTestNavigationIntent()` in `voice-assistant-navigation.ts` migrates legacy `voiceWizardStep=tests` links to the configured test surface when onboarding is complete. Unknown URL params fall back safely.

## 17. Tests

- `communication-center-navigation.test.ts` — channels/automations URL state
- `communication-channels-permissions.test.ts` — RBAC
- `voice-assistant-navigation.test.ts` — voice deep-link contract + test intent resolution
- `communication-center-c10.i18n.test.ts` — all-locale C10 key parity
- `communication-center-shell.test.tsx` — channels tab rendering
- Frontend build (`tsc -b`, `vite build`) PASS

## 18. Remaining C9 gaps (unchanged)

**WhatsApp:** AI composer/suggestion, quick actions, intent filters, template send from thread  
**Voice:** transcript/summary in canonical timeline, task-from-call, ElevenLabs sync, rich filters

## 19. C10 sign-off

**PASS** — canonical channel configuration entry points and deep-links implemented without UI duplication.

## 19. C13 readiness impact

**NOT YET — C9 REQUIRED**

C10 unblocks configuration migration. Legacy `whatsapp-business` / `ai-voice-assistant` operational nav must remain until C9 operational parity is complete.
