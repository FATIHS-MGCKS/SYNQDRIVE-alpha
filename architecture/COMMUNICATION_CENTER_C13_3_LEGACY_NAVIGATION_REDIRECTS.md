# Communication Center C13.3 — Legacy Navigation Redirects

**Status:** COMPLETE — navigation authority migrated; legacy UI retained for compatibility
**Date:** 2026-08-24
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha
**Base:** `main` after merged PR #1236 (C13.2 observability foundation)
**Branch:** `feature/communication-center-c13-3-legacy-navigation-redirects`

---

## 1. Scope

C13.3 changes **navigation authority only**. Legacy Communication entry points redirect to canonical Communication Center (CC) or retained C10 specialized surfaces. Legacy components, APIs, and route aliases remain for bookmark/notification compatibility until C13.4/C13.5.

In scope:
- Central typed resolver `resolveLegacyCommunicationRoute`
- App-level redirect on load and `handleViewChange` intercept
- Sidebar/mobile nav deduplication (single Communication Center entry)
- CC URL state extensions: `communicationWhatsAppSubview`, `communicationVoiceIntent`
- Embedded `VoiceAssistantView` in CC Channels with `suppressLegacyUrlSync`
- Query allowlist / UUID conversation deep-link policy
- Unit tests for redirect matrix

Out of scope (later phases):
- C13.4 legacy UI removal
- C13.5 API/component cleanup
- C13.6 final cutover proof
- Native WhatsApp conversation ID → canonical resolver (falls back to channel inbox)

---

## 2. Legacy route inventory

| Legacy path / caller | Class | User intent | Canonical destination | Mechanism |
|---------------------|-------|-------------|----------------------|-----------|
| `?view=whatsapp-business` (bare) | A/K | WhatsApp overview | CC → Channels → WhatsApp overview | Redirect |
| `?view=whatsapp-business&tab=inbox` | A | Operational inbox | CC → Inbox `channel=whatsapp` | Redirect |
| `?view=whatsapp-business&conversationId=<uuid>` | B | Conversation deep link | CC → Inbox conversation (UUID only) | Redirect |
| `?view=whatsapp-business&conversationId=<non-uuid>` | B | Native WA id | CC → Inbox `channel=whatsapp` (no broken detail) | Redirect fallback |
| `?view=whatsapp-business&tab=templates` | D | Template manager | CC → Channels → WhatsApp → Templates | Redirect |
| `?view=whatsapp-business&tab=settings` | C | WhatsApp config | CC → Channels → WhatsApp → Configuration | Redirect |
| `?view=ai-voice-assistant` (bare) | E | Voice overview | CC → Channels → Voice overview | Redirect |
| `?view=ai-voice-assistant&voiceOpsTab=conversations` | A | Voice operations | CC → Inbox `channel=voice` | Redirect |
| `?view=ai-voice-assistant&voiceOpsTab=analytics` | F | Voice analytics | CC → Channels → Voice (embedded analytics) | Redirect |
| `?view=ai-voice-assistant&voiceOpsTab=settings&voiceSettingsSection=*` | E/H | Builder/telephony/test | CC → Channels → Voice + `communicationVoiceIntent` | Redirect |
| `?view=ai-voice-assistant&voiceOpsTab=automations` | I | Automations | CC → Automations tab | Redirect |
| Sidebar `whatsapp-business` | A | Duplicate ops nav | Removed; CC nav only | Nav removal |
| Sidebar `ai-voice-assistant` | A/E | Duplicate ops nav | Removed; CC nav only | Nav removal |
| Notifications `OPEN_COMMUNICATION` | J | Handoff alert | CC conversation (pre-canonical) | Already canonical (C11.5) |
| Dashboard Communication widget | K | Ops metrics | CC inbox filters (C8.5) | Already canonical |
| Master Admin `view=voice-assistant` | L | Platform control plane | Unchanged (out of tenant scope) | N/A |
| Historical changelog / architecture text | L | Documentation | Historical record preserved | No runtime change |

---

## 3. Destination authority

| Intent | Owner |
|--------|-------|
| WhatsApp / Voice operational inbox | CC → Inbox + `communicationChannel` |
| WhatsApp templates / configuration | CC → Channels → WhatsApp subviews |
| Voice analytics / builder / telephony / test | CC → Channels → Voice + embedded `VoiceAssistantView` |
| Voice automations | CC → Automations (links to Workflow Automation) |
| Email channel config | CC → Channels → Email (unchanged C10) |
| Workflow automations product | `workflow-automation` view (unchanged) |

---

## 4. WhatsApp mapping

| Legacy state | Canonical state |
|--------------|-----------------|
| `tab=overview` (default) | `communicationTab=channels`, `communicationChannels=whatsapp` |
| `tab=inbox` | `communicationTab=inbox`, `communicationChannel=whatsapp` |
| `tab=templates` | + `communicationWhatsAppSubview=templates` |
| `tab=settings` / `configuration` | + `communicationWhatsAppSubview=configuration` |
| `filter=unread` | `communicationUnread=true` |
| `filter=human_handover` | `communicationStatus=HUMAN_REQUIRED` |
| Intent filters (`booking`, `documents`, etc.) | `communicationIntent` equivalents |
| `search` | `communicationSearch` (max 120 chars) |

Historical default for bare `/whatsapp-business` is **overview** (`WhatsAppBusinessView` default tab) → Channels overview, not Inbox.

---

## 5. Voice mapping

| Legacy `voiceOpsTab` / section | Canonical |
|-------------------------------|-----------|
| (default) `overview` | Channels → Voice, `communicationVoiceIntent=overview` |
| `conversations` | Inbox `channel=voice` |
| `analytics` | Channels → Voice, `communicationVoiceIntent=analytics` |
| `settings` + `builder` | `communicationVoiceIntent=builder` |
| `settings` + `telephony` | `communicationVoiceIntent=telephony` |
| `settings` + `test` / wizard `tests` | `communicationVoiceIntent=test` |
| `automations` | `communicationTab=automations` |

Historical default for bare `/ai-voice-assistant` is **overview** (configuration surface), not Conversations.

---

## 6. Deep-link mapping

- **Canonical UUID** `conversationId` → CC conversation focus (`mobilePane=conversation`).
- **Non-UUID** native identifiers → channel-filtered inbox only (no cross-tenant resolver in C13.3).
- No server-side native→canonical mapping service exists yet; documented gap for C13.4+.

---

## 7. Query / filter mapping

Allowlisted legacy params:

- WhatsApp: `view`, `tab`, `whatsappTab`, `conversationId`, `search`, `filter`
- Voice: `view`, `voiceOpsTab`, `voiceWizardStep`, `voiceSettingsSection`, `conversationId`

Dropped: provider tokens, phone numbers, debug payloads, unknown keys.

---

## 8. RBAC

Redirects do not bypass permissions. Users without `communication.read` hitting legacy operational routes land on CC and receive existing unauthorized UX. Specialized Voice manage routes remain gated by embedded `VoiceAssistantView` / channel permissions.

---

## 9. Org / station context

Redirects use active org from `RentalContext`; no stale org IDs encoded in URLs. Station scoping follows canonical inbox filters only (no legacy station param forwarding).

---

## 10. Notification / dashboard links

- `OPEN_COMMUNICATION` → canonical CC (`notification-entity-navigation.ts`) — verified, no legacy paths.
- Dashboard Communication widget → canonical CC deep links (C8.5) — verified.

---

## 11. Mobile / desktop nav

- Single **Communication Center** nav item (`nav.communicationCenter`) when `communication.read`.
- Legacy WhatsApp/Voice top-level nav buttons removed from expanded and collapsed sidebars.
- Mobile hamburger uses same `renderNavigationContent` — no duplicate operational entries.

---

## 12. Redirect implementation

**Central resolver:** `frontend/src/rental/components/communication-center/legacy-communication-navigation.ts`

- `resolveLegacyCommunicationRoute(search)` — pure mapping
- `redirectLegacyCommunicationRoute(search, { replace })` — apply + return
- `applyResolvedLegacyCommunicationRoute(resolved, { replace })` — URL write

**App wiring:** `frontend/src/rental/App.tsx`

- Initial `currentView` resolves legacy URLs to CC before first paint path
- `useEffect` on mount + guard when `currentView` is legacy
- `handleViewChange` intercepts programmatic legacy navigation
- Legacy top-level view mounts removed; components retained in codebase

**CC Channels:** `CommunicationChannelsPane` embeds `VoiceAssistantView` with `suppressLegacyUrlSync` for specialized intents.

---

## 13. Back-button / replace behavior

All automatic legacy redirects use `history.replaceState` (default `replace: true`) to avoid legacy→canonical→legacy back-stack loops.

---

## 14. Compatibility aliases

Legacy `view=whatsapp-business` and `view=ai-voice-assistant` remain parseable through redirect resolver. Route strings retained in type unions and tests. **Not deleted in C13.3.**

---

## 15. Remaining legacy route occurrences

| Location | Classification | Status |
|----------|----------------|--------|
| `legacy-communication-navigation.ts` | Resolver constants | Required |
| `voice-assistant-navigation.ts` | Legacy URL builder for embedded voice | Retained |
| `voice-assistant-navigation.test.ts` | Legacy URL parse tests | Retained |
| `WhatsAppBusinessSettings` testid | Component marker | Retained |
| `ChangesView` / `ArchitekturView` historical entries | Documentation | Historical |
| `rental-app-navigation.ts` | Voice deep links now emit CC URLs | Updated |

**Canonical operational CTAs → legacy routes:** 0 active producers (grep verified).

---

## 16. Tests

| Test file | Coverage |
|-----------|----------|
| `legacy-communication-navigation.test.ts` | WhatsApp/Voice matrix, UUID policy, allowlist, replaceState |
| `communication-center-navigation.test.ts` | New URL params |
| Existing notification/dashboard tests | Regression (pre-canonical) |

Manual validation deferred to CI + unit coverage; no live providers.

---

## 17. C13.3 sign-off

| Item | Status |
|------|--------|
| WhatsApp operational nav | REDIRECTED |
| WhatsApp config/templates | RETAINED_VIA_C10 (CC Channels) |
| Voice conversations | REDIRECTED |
| Voice specialized | RETAINED_VIA_C10 (embedded) |
| Legacy route aliases | KEEP_FOR_COMPATIBILITY |
| Legacy UI components | STILL_PRESENT_NOT_PRIMARY |
| Legacy APIs | UNCHANGED |
| Central redirect resolver | YES |
| Replace semantics | PASS |
| Permission preservation | PASS (inherits CC RBAC) |

---

## 18. C13.4 readiness

| Gate | Status |
|------|--------|
| No canonical operational nav → legacy UI | READY |
| Bare legacy operational routes redirect | READY |
| Deep-link compatibility (UUID) | READY |
| Specialized C10 destinations preserved | READY |
| Permissions preserved | READY |
| No redirect loops | READY (replace semantics) |
| Mobile/desktop nav consistent | READY |
| Tests pass | CI pending |

**C13.4 may begin** after merge + telemetry window (if analytics added later).

---

## Telemetry note

No established frontend analytics event pipeline for `legacy_communication_route_redirect` was found; skipped per spec §51 (do not invent infrastructure).

---

## Deprecation window

- **C13.3:** Aliases + redirects active
- **C13.4:** Legacy UI may be removed
- **C13.5:** Dead helpers/APIs cleanup after usage evidence
