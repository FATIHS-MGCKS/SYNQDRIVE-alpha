# Communication Center C13.4 — Legacy Operational UI Removal

**Status:** COMPLETE — superseded operational UI removed; C10 control plane retained
**Date:** 2026-08-24
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha
**Base:** `main` after merged PR #1239 (C13.3 legacy navigation redirects)
**Branch:** `feature/communication-center-c13-4-legacy-operational-ui-removal`

---

## 1. Scope

C13.4 removes duplicated **operational** Communication UI that C9–C12 and C13.3 established as owned by the canonical Communication Center. It does **not** delete backend APIs, C13.3 redirect compatibility, or C10 specialized configuration/control-plane surfaces.

In scope:
- Delete orphaned legacy WhatsApp operational monolith (`WhatsAppBusinessView` + inbox subtree)
- Decompose `VoiceAssistantView` to control-plane-only (remove embedded conversations tab/panel)
- Remove dead `VoiceSectionNav`
- Wire canonical CC Inbox handoff via `onOpenConversations` on retained Voice control plane
- Preserve C13.3 `resolveLegacyCommunicationRoute` and redirect tests
- C13.5 candidate inventory (no backend deletion)

Out of scope (later phases):
- C13.5 dead API/service/hook/i18n/CSS cleanup
- C13.6 final production cutover proof
- Broad bundle optimization or repository-wide i18n purge

---

## 2. Pre-removal authority

| Surface | Operational owner | Control-plane owner |
|---------|-------------------|---------------------|
| Conversation list / detail / replies / attachments / handoff | CC Inbox | — |
| WhatsApp templates / configuration / readiness | — | CC Channels → WhatsApp |
| Voice analytics / builder / telephony / test / automations | — | CC Channels → Voice (embedded control plane) |
| Voice operational conversations | CC Inbox `channel=voice` | — |
| Legacy `?view=whatsapp-business` / `?view=ai-voice-assistant` | Redirect only (C13.3) | — |

---

## 3. Component inventory

### WhatsApp (legacy operational — removed)

| Component | Classification | Action |
|-----------|----------------|--------|
| `WhatsAppBusinessView` | A — SUPERSEDED_OPERATIONAL_UI | **REMOVED** (zero production importers after C13.3) |
| `WhatsAppInboxLayout` | A | **REMOVED** |
| `WhatsAppConversationInbox` | A | **REMOVED** |
| `WhatsAppChatPanel` | A | **REMOVED** |
| `WhatsAppContextDrawer` | A | **REMOVED** |
| `WhatsAppMessageBubble` | A | **REMOVED** |
| `WhatsAppMessageComposer` | A | **REMOVED** |
| `WhatsAppQuickActions` | A | **REMOVED** |
| `WhatsAppOperationsHeader` | A | **REMOVED** |
| `WhatsAppSectionNav` | A | **REMOVED** |
| `WhatsAppOverviewTab` | A | **REMOVED** |

### WhatsApp (retained C10 control plane)

| Component | Classification | Action |
|-----------|----------------|--------|
| `WhatsAppBusinessSettings` | B — RETAINED_C10_CONTROL_PLANE | **KEPT** (CC Channels → Configuration) |
| `WhatsAppSettingsPanel` | B | **KEPT** |
| `WhatsAppSetupWizard` | B | **KEPT** |
| `WhatsAppTemplateManager` | B | **KEPT** (CC Channels → Templates) |
| `WhatsAppKpiCards` | C — SHARED_WITH_CANONICAL_CC | **KEPT** (overview KPIs) |
| `WhatsAppReadinessStrip` | C | **KEPT** |
| `whatsapp.ops.ts` | C | **KEPT** (readiness + KPI helpers) |

### Voice (legacy operational — removed)

| Component | Classification | Action |
|-----------|----------------|--------|
| `VoiceConversationsPanel` | A — SUPERSEDED_OPERATIONAL_UI | **REMOVED** |
| `VoiceSectionNav` | E — DEAD_CONFIRMED | **REMOVED** (zero imports) |

### Voice (retained control plane)

| Component | Classification | Action |
|-----------|----------------|--------|
| `VoiceAssistantView` | B — DECOMPOSED to control-plane-only | **KEPT** (embedded in CC Channels) |
| `VoiceOpsSectionNav` | B | **KEPT** (4 tabs: overview, automations, analytics, settings) |
| `VoiceOperationsOverview` | B | **KEPT** (KPIs; CTA → canonical Inbox) |
| `VoiceUsageAnalyticsPanel` / `VoiceAnalyticsView` | B | **KEPT** |
| `VoiceAgentSettings` | B | **KEPT** (builder / telephony) |
| `VoiceTestCenter` | B | **KEPT** |
| `VoiceOnboardingWizard` | B | **KEPT** |
| `VoicePermissionGroupsPanel` | B | **KEPT** (automations permissions) |
| `VoiceCommandHeader` | B | **KEPT** (sync no longer navigates to conversations) |

### Compatibility (unchanged)

| Artifact | Classification | Action |
|----------|----------------|--------|
| `legacy-communication-navigation.ts` | D — COMPATIBILITY_ONLY | **KEPT** |
| `voice-assistant-navigation.ts` (`conversations` URL parse) | D | **KEPT** for redirect parsing |
| C13.3 redirect tests | D | **KEPT** |

---

## 4. WhatsApp removals

- Deleted entire `WhatsAppBusinessView` monolith and 10 operational child components.
- CC Channels already mounted retained components directly since C13.3; no `WhatsAppBusinessView` production import remained.
- Operational inbox, chat, composer, context drawer, and legacy section nav are production-dead.

---

## 5. WhatsApp retained control plane

CC Channels → WhatsApp:
- **Overview:** `WhatsAppReadinessStrip` + `WhatsAppKpiCards` with CTA to CC Inbox
- **Configuration:** `WhatsAppBusinessSettings`
- **Templates:** `WhatsAppTemplateManager`

No legacy product shell or duplicate operational presentation.

---

## 6. Voice decomposition

`VoiceAssistantView` remains the embedded control-plane shell for specialized Voice intents in CC Channels. Changes:
- Removed `VoiceConversationsPanel` render path and Conversations tab from `VoiceOpsSectionNav`
- Added `onOpenConversations` prop → canonical CC Inbox `channel=voice`
- Guard: if legacy `opsTab=conversations` state arrives, hand off to `onOpenConversations` instead of rendering operational UI
- Manual sync (`VoiceCommandHeader` onSync) runs sync without navigating to conversations tab
- Overview KPIs still load conversation aggregates for display; operational browsing is CC Inbox only

---

## 7. Voice operational removals

| Removed | Reason |
|---------|--------|
| `VoiceConversationsPanel` | C9.2 parity + C13.3 redirect: operational voice conversations → CC Inbox |
| Conversations tab in `VoiceOpsSectionNav` | Duplicate operational surface |
| `VoiceSectionNav` | Dead legacy nav (zero imports) |

---

## 8. Voice retained control plane

| Intent | Component |
|--------|-----------|
| Overview KPIs | `VoiceOperationsOverview` |
| Analytics | `VoiceUsageAnalyticsPanel` |
| Builder / telephony | `VoiceAgentSettings` |
| Test center | `VoiceTestCenter` |
| Onboarding | `VoiceOnboardingWizard` |
| Automations permissions | `VoicePermissionGroupsPanel` |
| Manual sync (troubleshooting) | `VoiceCommandHeader` onSync + analytics onRequestSync |

Recording configuration remains in `VoiceAgentSettings` / builder — not removed.

---

## 9. URL compatibility

- C13.3 `resolveLegacyCommunicationRoute` unchanged.
- `voiceOpsTab=conversations` still accepted by redirect resolver → CC Inbox `channel=voice`.
- Retained Voice control plane does **not** write `voiceOpsTab=conversations`.
- Embedded Voice uses canonical `communicationVoiceIntent` via `suppressLegacyUrlSync`.

---

## 10. RBAC

No permission paths removed:
- `voice-assistant.read` / `voice-assistant.write` still reach builder, analytics, telephony, test via CC Channels
- WhatsApp configuration/templates still gated by `canManageWhatsAppSettings`
- C13.3 specialized permission matrix tests retained

---

## 11. Mobile / tablet / desktop

Retained control-plane panels render inside CC Channels shell (no nested legacy product nav). Existing responsive patterns preserved; no additional legacy tab bar inside Voice embed.

---

## 12. Accessibility

- Removed Conversations tab eliminates dead `aria-controls` target for that panel
- Remaining four-tab nav order: overview → automations → analytics → settings

---

## 13. Tests

Updated:
- `voice-assistant-ui.characterization.test.ts` — 4-tab control plane, no `VoiceConversationsPanel`
- `legacy-communication-navigation.test.ts` — comment update (no `WhatsAppBusinessView` dependency)

All communication-center + voice navigation tests pass (528 tests in scoped run).

---

## 14. Remaining production references

| Symbol | Production refs |
|--------|-----------------|
| `WhatsAppBusinessView` | 0 |
| `WhatsAppConversationInbox` | 0 |
| `WhatsAppChatPanel` | 0 |
| `VoiceConversationsPanel` | 0 (test asserts absence) |
| `VoiceAssistantView` | 1 (`CommunicationChannelsPane` embed) |
| `voiceOpsTab=conversations` | Redirect resolver + URL parser only |
| `view=whatsapp-business` | Redirect resolver only |

---

## 15. C13.5 candidate inventory

| Artifact | Why potentially dead | Remaining refs | C13.5 action |
|----------|---------------------|----------------|--------------|
| `api.voiceAssistant.conversations` (overview KPI load) | May move to dedicated stats endpoint | `VoiceAssistantView` overview | Evaluate aggregate API |
| `filterConversations` in `whatsapp.ops.ts` | Inbox-only filtering | Unit test only | Remove if test removed |
| `countHumanReview` in `whatsapp.ops.ts` | Legacy inbox helper | 0 production | Remove |
| `voice.ops.tab.conversations` i18n keys | Tab removed | Translation files | i18n purge |
| `VoiceAnalyticsView` transcript browse UI | Operational transcripts in CC | Analytics panel | Verify scope |
| Legacy `buildVoiceAssistantUrl({ opsTab: 'conversations' })` | Should not be produced | Parser compatibility | Audit writers |
| WhatsApp operational API client methods (send, context drawer actions) | No frontend caller | Backend active | Backend audit |
| `VoiceConversationsPanel` CSS/modules | Deleted component | 0 | N/A |
| Feature flags for legacy mounts | C13.3 removed mounts | Audit env | Flag cleanup |

---

## 16. Remaining gaps

- `VoiceAssistantView` name retained (not renamed to `CommunicationVoiceControlPlane`) to minimize churn; shell is control-plane-only in practice.
- Overview KPIs still fetch conversation list for aggregates — backend/API cleanup deferred to C13.5.
- No live-provider E2E in C13.4 (same as prior phases).

---

## 17. C13.4 sign-off

| Check | Result |
|-------|--------|
| Legacy operational top-level mounts | 0 |
| Hidden duplicate operational surfaces | 0 |
| Canonical CC dependency on legacy operations | 0 |
| C13.3 redirect compatibility | PASS |
| WhatsApp templates / configuration | PASS |
| Voice analytics / builder / telephony / test | PASS |
| Backend deleted | NO |
| Legacy APIs deleted | NO |

**Sign-off:** PASS

---

## 18. C13.5 readiness

**READY** — frontend operational components removed with explicit candidate inventory; backend and URL compatibility preserved for proof-based cleanup in C13.5.
