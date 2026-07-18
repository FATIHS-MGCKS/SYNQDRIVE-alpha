# SynqDrive Voice AI UI/UX Production Audit

| Field | Value |
|-------|-------|
| **Phase** | Prompt 1B of 20 — Full Voice AI UI/UX production audit (read-only) |
| **Date** | 2026-07-18 (UTC) |
| **Repository HEAD** | `72ae6fd5` (`docs(voice): add remediation baseline`) |
| **VPS running commit** | `ac856881` (voice stack deployed, flags disabled, zero operational data) |
| **Method** | Repository read-only analysis, architecture doc review, automated characterization tests (29/29 PASS), production health probe (200). **No authenticated browser session available** — live UI states not screenshot-verified. |

> **No product files changed in this prompt. Only audit and evidence index committed.**

---

## 1. Executive Assessment

**Overall UI/UX maturity: 52% — partially usable architecture with significant production blockers in customer-facing surfaces.**

The Voice AI UI has a **sound information architecture skeleton**: an 8-step onboarding wizard for non-`ACTIVE` assistants and a 5-tab operations shell post-activation (`architecture/VOICE_AI_ORG_ONBOARDING_OPS_UI_2026-07-17.md`). Master Admin exposes an 8-section control plane with secure write dialogs (`architecture/VOICE_AI_MASTER_CONTROL_PLANE_UI_2026-07-17.md`).

However, **customer-facing components remain largely English-hardcoded** and expose **ElevenLabs/Twilio provider semantics** (Agent IDs, API key env hints, “purchase numbers in ElevenLabs”, “Sync from ElevenLabs”) that contradict the managed-service product intent defined in `architecture/VOICE_AI_PRODUCTION_ARCHITECTURE_ADR_2026-07-17.md`.

Combined with **zero live production voice data** (remediation baseline: 0 subscriptions, 0 numbers, 0 conversations), most operational UI states could not be browser-verified. Code and characterization tests confirm structure; visual/mobile/dark-mode acceptance is **NOT VERIFIED**.

**Finale UI/UX-Entscheidung: UI/UX NO-GO**

---

## 2. Scope and Method

### References read

| Document | Status |
|----------|--------|
| `architecture/VOICE_AI_REMEDIATION_BASELINE_2026-07-18.md` | Read |
| `architecture/VOICE_AI_POST_DEPLOYMENT_ACCEPTANCE_AUDIT_2026-07-18.md` | Read (prior session) |
| `architecture/VOICE_AI_PRODUCTION_ARCHITECTURE_ADR_2026-07-17.md` | Read (prior session) |
| `architecture/VOICE_AI_ORG_ONBOARDING_OPS_UI_2026-07-17.md` | Read |
| `architecture/VOICE_AI_MASTER_CONTROL_PLANE_UI_2026-07-17.md` | Read |
| `architecture/VOICE_AI_PRODUCTION_READINESS_REPORT_2026-07-17.md` | Referenced |
| `docs/testing/voice-ai-e2e-test-matrix.md` | Referenced |

### Analysis performed

- Full inventory of `frontend/src/rental/components/voice-assistant/*` (20 TSX + ops/utils)
- `frontend/src/rental/components/VoiceAssistantView.tsx`
- `frontend/src/master/components/VoiceAssistantAdminView.tsx` + `voice-control-plane/*`
- i18n key parity (`voice.*`: 134 keys DE / 134 keys EN)
- Provider-term grep across frontend voice paths
- Design reference sampling: `FleetConditionView.tsx`, `FleetConnectivityTab.tsx`, `components/patterns/*`
- Automated tests: `voice-assistant-ui.characterization.test.ts`, `voice-assistant.ops.characterization.test.ts`, `voice-control-plane-admin.test.ts` — **29/29 PASS**
- Production health: `GET https://app.synqdrive.eu/api/v1/health` → 200

### Not performed (constraints / access)

- Authenticated org or master-admin browser walkthrough
- Responsive screenshots at 320–desktop breakpoints
- Dark/light mode visual comparison
- Live accessibility audit in browser (axe/Playwright a11y)
- Opening real customer transcripts or phone numbers

---

## 3. Current Component and Route Map

### Organization rental surface

| File | Component | Binding | Notes |
|------|-----------|---------|-------|
| `frontend/src/rental/App.tsx` | — | `currentView === 'ai-voice-assistant'` → `VoiceAssistantView` | Primary route |
| `frontend/src/rental/components/VoiceAssistantView.tsx` | `VoiceAssistantView` | Shell: wizard vs ops tabs | ~478 lines; holds save/activate/sync state |
| `frontend/src/rental/components/voice-assistant/VoiceOnboardingWizard.tsx` | `VoiceOnboardingWizard` | Shown when `shouldShowOnboardingWizard(assistant)` | 8 steps; uses i18n for labels |
| `frontend/src/rental/components/voice-assistant/VoiceWizardPlanStep.tsx` | `VoiceWizardPlanStep` | Wizard step `plan` | i18n + `DataCard`; API-driven plans |
| `frontend/src/rental/components/voice-assistant/VoiceAssistantBuilder.tsx` | `VoiceAssistantBuilder` | Wizard `assistant` + settings | **Mostly English hardcoded** |
| `frontend/src/rental/components/voice-assistant/VoiceWizardKnowledgeStep.tsx` | `VoiceWizardKnowledgeStep` | Wizard `knowledge` | i18n; links to org data |
| `frontend/src/rental/components/voice-assistant/VoicePermissionGroupsPanel.tsx` | `VoicePermissionGroupsPanel` | Wizard `permissions` + automations tab | i18n; grouped permissions |
| `frontend/src/rental/components/voice-assistant/VoiceTelephonyWizard.tsx` | `VoiceTelephonyWizard` | Wizard `phone` + settings telephony | **Critical provider leakage** |
| `frontend/src/rental/components/voice-assistant/VoiceTestCenter.tsx` | `VoiceTestCenter` | Wizard `tests` | English; ElevenLabs refs |
| `frontend/src/rental/components/voice-assistant/VoiceLaunchChecklist.tsx` | `VoiceLaunchChecklist` | Wizard `activation` | English labels via ops |
| `frontend/src/rental/components/voice-assistant/VoiceCommandHeader.tsx` | `VoiceCommandHeader` | Ops header (post-wizard) | English; ElevenLabs chip |
| `frontend/src/rental/components/voice-assistant/VoiceOpsSectionNav.tsx` | `VoiceOpsSectionNav` | 5-tab ops nav | i18n |
| `frontend/src/rental/components/voice-assistant/VoiceOperationsOverview.tsx` | `VoiceOperationsOverview` | Tab `overview` | i18n KPIs |
| `frontend/src/rental/components/voice-assistant/VoiceConversationsPanel.tsx` | `VoiceConversationsPanel` | Tab `conversations` | English; sync button |
| `frontend/src/rental/components/voice-assistant/VoiceUsageAnalyticsPanel.tsx` | `VoiceUsageAnalyticsPanel` | Tab `analytics` | Wrapper |
| `frontend/src/rental/components/voice-assistant/VoiceAnalyticsView.tsx` | `VoiceAnalyticsView` | Inside analytics panel | English; ElevenLabs empty state |
| `frontend/src/rental/components/voice-assistant/VoiceOpsKpiStrip.tsx` | `VoiceOpsKpiStrip` | **Not used by VoiceAssistantView** | Reused by `WhatsAppKpiCards` only |
| `frontend/src/rental/components/voice-assistant/VoicePermissionsMatrix.tsx` | `VoicePermissionsMatrix` | **Dead — no imports** | Superseded by groups panel |
| `frontend/src/rental/components/voice-assistant/VoiceSectionNav.tsx` | `VoiceSectionNav` | **Dead — no imports** | Superseded by `VoiceOpsSectionNav` |
| `frontend/src/rental/components/voice-assistant/BuilderField.tsx` | `BuilderField` | Builder fields | Shared primitive |
| `frontend/src/rental/components/voice-assistant/VoiceSelectorField.tsx` | `VoiceSelectorField` | Voice picker | ElevenLabs copy |
| `frontend/src/rental/components/voice-assistant/KnowledgeIntegrationHints.tsx` | `KnowledgeIntegrationHints` | Builder sidebar | English |
| `frontend/src/rental/components/voice-assistant/voice-assistant.ops.ts` | ops | Status labels, checklist | English strings |
| `frontend/src/rental/components/voice-assistant/voice-wizard.ops.ts` | ops | Step persistence | `localStorage` resume |
| `frontend/src/rental/components/voice-assistant/voice-conversation.utils.ts` | utils | Masking, duration | English direction labels |

### Master Admin surface

| File | Component | Binding |
|------|-----------|---------|
| `frontend/src/master/...` (master router) | — | Master nav → `VoiceAssistantAdminView` |
| `frontend/src/master/components/VoiceAssistantAdminView.tsx` | `VoiceAssistantAdminView` | 8-tab control plane (~796 lines) |
| `frontend/src/master/components/voice-control-plane/voice-control-plane-navigation.ts` | nav helpers | URL section state |
| `frontend/src/master/components/voice-control-plane/VoiceSecureActionDialog.tsx` | secure writes | Suspend, replay, deploy, rollback |

### Shared patterns reused

- `PageHeader`, `DataTable`, `DetailDrawer`, `MetricCard`, `StatusChip`, `EmptyState`, `ErrorState` from `frontend/src/components/patterns`
- `chromeTabBarClass` / `chromeSectionNavClass` from `components/patterns/chrome-tab-bar`
- `surface-premium`, `shadow-[var(--shadow-1)]`, `rounded-2xl` tokens (aligned with Fleet)

### Maintainability findings

| Issue | Severity |
|-------|----------|
| `VoicePermissionsMatrix`, `VoiceSectionNav` orphaned | P2 |
| `VoiceAssistantView` monolithic state owner (save, activate, sync, tabs, wizard) | P2 |
| Deep prop drilling into `VoiceOnboardingWizard` (~25 props) | P2 |
| Business logic in `voice-assistant.ops.ts` mixed with English presentation strings | P2 |
| Duplicate telephony UX: wizard embeds full `VoiceTelephonyWizard` in onboarding and settings | P3 |

---

## 4. SynqDrive Design Reference

### Reference profile (from Fleet, Dashboard, Invoice modules)

| Token / pattern | Reference standard | Voice adherence |
|-----------------|-------------------|-----------------|
| Page width | `max-w-[1600px]` master; rental content fluid with padding | **PARTIAL** — voice uses full content width, no `PageHeader` on org view |
| Card radius | `rounded-2xl` primary cards | **PASS** — consistent |
| Glass / surface | `surface-premium` + `shadow-[var(--shadow-1)]` | **PASS** |
| Typography | `text-sm` titles, `text-[11px]` descriptions, `font-display` h1 on modern pages | **PARTIAL** — voice header uses display scale but many sub-panels use ad-hoc `text-[9px]`/`text-[10px]` |
| KPI grid | `MetricCard` / `DataCard` with tabular nums | **PARTIAL** — custom KPI grids in header |
| Tables | `DataTable` with responsive scroll | **PARTIAL** — conversations use custom table, not `DataTable` |
| Drawers | `DetailDrawer` pattern | **FAIL** org conversations use inline expand; master uses drawer |
| Section nav | `chromeSectionNavClass` frosted chrome | **PASS** ops nav |
| Status colors | `--status-positive`, `--status-watch`, `--status-critical` | **PASS** |
| Primary CTA | Brand soft fill `border-[color:var(--brand)]/35` | **PASS** |
| Mobile | `max-sm:` truncation, stacked grids | **NOT VERIFIED** visually |

### Voice deviations

- Org voice page lacks unified `PageHeader` (uses custom `VoiceCommandHeader` “AI Voice Command Center”)
- Master control plane **matches** modern admin patterns better than org customer view
- Invoice module shows superior i18n coverage — voice org surfaces lag behind

---

## 5. Organization Information Architecture

| State | First view | Clarity | Next action | Rating |
|-------|-----------|---------|-------------|--------|
| NO_SUBSCRIPTION | Wizard step `plan` | Clear via i18n | Select plan | **PARTIAL** 65% |
| TRIAL | Plan selected; wizard continues | Clear | Complete wizard | **PARTIAL** 60% |
| ACTIVE | Ops overview tab | Clear structure | View calls / analytics | **PARTIAL** 55% |
| PAST_DUE | No dedicated UI state | **NOT PRESENT** | — | **FAIL** 30% |
| SUSPENDED | Generic inactive/degraded chips | Unclear billing cause | Contact admin | **FAIL** 35% |
| CANCELLED | Falls back to wizard/inactive | Not distinguished | — | **FAIL** 30% |
| Onboarding not started | Wizard step 1 | Clear | Start plan | **PASS** 70% |
| Onboarding partial | Wizard with resume (`localStorage`) | Good resume | Continue step | **PASS** 75% |
| Ready to activate | Activation step + checklist | Partial — readiness % | Activate | **PARTIAL** 55% |
| Activation blocked | Readiness gaps list | Technical labels possible | Fix blockers | **PARTIAL** 50% |
| Provisioning running | Telephony wizard steps | Provider-oriented | Wait / refresh | **FAIL** 40% |
| Provisioning failed | Error in telephony status | English errors | Refresh | **PARTIAL** 45% |
| Agent deploy failed | Readiness check fail | Not user-translated | Support | **PARTIAL** 40% |
| Regulatory pending | **NOT PRESENT** in org UI | — | — | **NOT VERIFIED** |
| MCP unreachable | Readiness check only | Technical | Admin | **PARTIAL** 40% |
| Webhooks unreachable | Not shown to org users | N/A | — | **N/A** |
| Provider degraded | `DEGRADED` chip | English | — | **PARTIAL** 50% |
| Active healthy | Overview KPIs | Good layout | Operate | **PARTIAL** 60% |
| No conversations | Empty states | Clear | Sync / activate | **PARTIAL** 55% |
| Many conversations | List + filters | Table overflow risk mobile | Filter | **NOT VERIFIED** |
| Unfinalized conversations | Outcome `PENDING` badge | May skew analytics | — | **PARTIAL** 50% |
| Budget almost reached | Protection status on activation | Weak in ops overview | Set budget | **PARTIAL** 45% |
| Budget reached | **NOT PRESENT** dedicated blocker UI | — | — | **FAIL** 35% |
| Outbound disabled | Telephony toggles | Clear in wizard | Enable with confirm | **PASS** 65% |
| No staff forwarding | Availability step | i18n fields | Configure phone | **PARTIAL** 60% |

**Informationsarchitektur score: 58%**

---

## 6. First-Time Experience

### Wizard flow (8 steps)

| Step | Title i18n | Purpose clear | Progress | Save/back | Mobile | DE/EN | Score |
|------|-----------|---------------|----------|-----------|--------|-------|-------|
| Tarif | Yes | Yes | Stepper | Select persists API | NOT VERIFIED | Yes | 75% |
| Assistent | Partial | Yes | Yes | Save draft | NOT VERIFIED | **Mixed** | 55% |
| Wissen | Yes | Yes | Yes | Read-only links | NOT VERIFIED | Yes | 70% |
| Zugriffsrechte | Yes | Yes | Yes | Patch on change | NOT VERIFIED | Yes | 72% |
| Telefonnummer | Partial | **Provider setup feel** | Sub-steps | Assign API | NOT VERIFIED | **English** | 35% |
| Erreichbarkeit | Yes | Yes | Yes | Save | NOT VERIFIED | Yes | 68% |
| Tests | **English** | Yes | Yes | Session API | NOT VERIFIED | **English only** | 45% |
| Aktivierung | Yes | Yes | Checklist | Activate | NOT VERIFIED | Yes | 62% |

### Critical onboarding findings

- Wizard **feels like technical provider setup** on phone step (ElevenLabs account, Agent ID, API key env var)
- Customer is told to **purchase/import numbers in ElevenLabs** — contradicts managed service ADR
- `VoiceAssistantBuilder` system prompt section references ElevenLabs explicitly
- Wizard resume via `localStorage` works; no explicit “später fortsetzen” copy
- Cancel/discard draft protection: **weak** — navigating away may lose unsaved builder draft

**Onboarding score: 52%**

---

## 7. Plan Selection

| Check | Result |
|-------|--------|
| Start / Pro / Business | API-driven `VoiceWizardPlanStep` — **PASS** |
| Prices from backend | `formatMoneyCents` with locale — **PASS** |
| Included minutes, overage, numbers, locations, parallelism | Rendered from catalog — **PASS** |
| Setup fee | Shown when `setupFeeCents > 0` — **PASS** |
| Net note | **NOT PRESENT** explicit netto hint — **PARTIAL** |
| Plan change | Re-select overwrites via API — **PASS** |
| Recommended plan | **NOT PRESENT** — **PARTIAL** |
| Mobile cards | `grid-cols-1 md:grid-cols-3` — structure OK; **NOT VERIFIED** |
| Contradictory prices | Cannot verify without live API; code uses single catalog source — **NOT VERIFIED** |
| “Unlimited” | i18n key `voice.plan.unlimited` — verify backend semantics — **LIKELY** OK |

**Plan selection score: 72%**

---

## 8. Assistant Configuration

| Area | Assessment |
|------|------------|
| Name, company, language, voice, greeting | Present in `VoiceAssistantBuilder` — **PASS** functional |
| Voice preview | Load voices on demand; provider-down state — **PARTIAL** |
| Draft vs live deployment | **NOT CLEAR** in org UI — deployment is backend `VoiceAgentDeployment`; org UI shows `elevenLabsAgentId` in telephony — **FAIL** |
| Save | Works with toast — **PASS** |
| Rollback | **NOT PRESENT** in org UI (master only) — expected |
| Tariff limits | Not surfaced in builder — **PARTIAL** |
| Mobile | Dense multi-section form — **NOT VERIFIED** |
| Provider leakage | `VoiceSelectorField`: “Provider: ElevenLabs”, API key message — **FAIL** |

**Assistant configuration score: 48%**

---

## 9. Knowledge Experience

| Source | UI | Status |
|--------|-----|--------|
| Organization, stations, hours, rental rules, requirements, tariffs, categories | `VoiceWizardKnowledgeStep` cards | Connected/published chips |
| Documents, AGB, pickup/return, payment, emergency | **NOT PRESENT** as dedicated sources | Gap |
| Live vs static separation | Hints via `useVoiceKnowledgeLinks` | **PARTIAL** |
| Knowledge gaps | Freshness chip (`good`/`partial`/`needs_attention`) | **PASS** |
| Empty / incomplete | Shows “Needs attention” — **PASS** |
| Mobile | 2-column grid — **NOT VERIFIED** |

Knowledge is **not an empty placeholder** — it reflects real org link status. Depth is **partial** vs ADR knowledge architecture.

**Knowledge score: 62%**

---

## 10. Permissions Experience

| Check | Result |
|-------|--------|
| MCP tools exposed as business groups | `VoicePermissionGroupsPanel` — **PASS** |
| Risk classes | Mode radio: not allowed / read only / customer confirm / staff approval — **PASS** |
| Dangerous autonomous actions | Blocked when outbound off; confirm in legacy matrix — **PASS** in groups panel |
| Long checkbox list | Avoided in current panel — **PASS** |
| Frontend vs backend allowlist | Characterization tests exist backend-side; UI uses `voice-assistant-permissions.ops` — **LIKELY** aligned |
| Dead `VoicePermissionsMatrix` | Still in repo with English “Autonomous” copy — cleanup needed — **P2** |

**Permissions score: 70%**

---

## 11. Phone Number Onboarding

**Rating: FAIL — 32%**

`VoiceTelephonyWizard.tsx` is the highest-risk customer component.

| Customer-facing leakage | Line evidence |
|-------------------------|---------------|
| “ElevenLabs must be configured on the SynqDrive server” | L232 |
| “ask your administrator to set ELEVENLABS_API_KEY” | L238 |
| `Agent ID: {assistant.elevenLabsAgentId}` full display | L249–250 |
| “Select a number from ElevenLabs” | L262 |
| “Import or purchase numbers in ElevenLabs, then refresh” | L284 |
| `phoneNumberId` in select options | L310–311 |
| “Provider connection” step title | L231 |

Missing managed-service flows from product spec:

- New SynqDrive number request
- Forward existing number
- Port number
- SIP/PBX
- Regulatory status customer view
- SynqDrive-mediated number provisioning

---

## 12. Availability and Routing

| Feature | Present | Notes |
|---------|---------|-------|
| Business hours start/end | Yes | Single window per day — **PARTIAL** |
| Multiple windows per day | **No** | |
| Timezone | Field exists | |
| Holidays / special hours | **No** | |
| After-hours message | Yes | |
| Staff forwarding | Yes | |
| Fallback message | Yes | |
| Escalation triggers | Checkboxes in builder | |
| Max call duration / loop protection | **NOT IN UI** | Backend may have — not surfaced |
| “What happens when?” preview | **NOT PRESENT** | |

**Availability score: 55%**

---

## 13. Test Center and Activation

### Test Center (`VoiceTestCenter.tsx`)

| Check | Result |
|-------|--------|
| Guided scenarios | `VOICE_TEST_SCENARIOS` — **PASS** |
| Expected behavior | Shown per scenario — **PASS** |
| Live transcript panels | Placeholder only — **PARTIAL** |
| Readiness % | Displayed — may overstate if checks are env-only — **PARTIAL** |
| ElevenLabs agent ID truncated in UI | Shown to customer — **FAIL** |
| Simulation vs real call | Signed test session — **PASS** technical |
| English-only copy | **FAIL** i18n |

### Activation

| Check | Result |
|-------|--------|
| Readiness checklist | `VoiceLaunchChecklist` — **PASS** |
| Blocker vs warning separation | Readiness `missing` list — **PARTIAL** |
| Privacy confirmation | i18n checkbox — **PASS** |
| Budget limit | Optional cents input — **PASS** |
| Go-live confirmation | Activate button — **PASS** |
| Provider health in checklist | English labels — **PARTIAL** |

**Test center score: 46% | Activation score: 58%**

---

## 14. Active Overview

`VoiceOperationsOverview` + `VoiceCommandHeader`:

| Element | Assessment |
|---------|------------|
| Status hero | `VoiceCommandHeader` — dense meta grid — **PARTIAL** |
| Today’s calls, resolved, forwarded | Computed from conversations — **PASS** when data exists |
| Minutes remaining | Billing API — **PASS** |
| Problems strip | Provider warning + readiness — **PARTIAL** |
| Recent calls | List with link to conversations — **PASS** |
| Provider in header | “ElevenLabs ·” chip — **FAIL** customer leakage |
| KPI density | Moderate — acceptable | 
| Empty values | “Not available” when conversations not loaded — **PASS** honest |

**Active overview score: 54%**

---

## 15. Conversations

| Feature | Status |
|---------|--------|
| List, filter, search, pagination | Present — **PASS** |
| Direction, outcome, duration, time | Present — **PASS** |
| Caller masking | `maskCallerNumber()` — **PASS** |
| Cost column | **NOT PRESENT** | 
| Privacy indicator | **NOT PRESENT** |
| Transcript expand | Inline expand — **PARTIAL** access control not visible in UI |
| “Sync from ElevenLabs” button | L196, L320 — **FAIL** leakage |
| English hardcoded | Filters, buttons, empty state — **FAIL** i18n |
| Task creation from call | Present — English — **PARTIAL** |
| Booking/vehicle links | **NOT PRESENT** in list |

**Conversations score: 50%**

---

## 16. Automations

Automations tab renders `VoicePermissionGroupsPanel` (same as permissions) — **not** workflow automation templates (Abholbestätigung, Rückgabeerinnerung, etc.) described in prompt.

| Expected | Actual |
|----------|--------|
| Outbound automation rules | **NOT PRESENT** in UI |
| Trigger / schedule / budget per automation | **NOT PRESENT** |
| Mass-call protection UI | Only permission modes | 

**Automations score: 25% — early / mislabeled**

---

## 17. Analytics and Usage

| Feature | Status |
|---------|--------|
| Usage panel wrapper | `VoiceUsageAnalyticsPanel` i18n — **PASS** |
| Analytics charts | `VoiceAnalyticsView` — **PARTIAL** |
| Empty state | “sync from ElevenLabs” — **FAIL** |
| Estimated vs final | **NOT CLEAR** in UI |
| Unfinalized conversations in metrics | Risk documented in backend; UI doesn’t warn — **PARTIAL** |
| Mobile charts | **NOT VERIFIED** |

**Analytics score: 48%**

---

## 18. Settings and Diagnostics

Settings tab composes: `VoiceAssistantBuilder`, `VoiceTelephonyWizard`, availability fields.

| Issue | Severity |
|-------|----------|
| Duplicates onboarding fields | P2 |
| No dedicated diagnostics section for org admins | P3 — by design? ADR allows master diagnostics |
| Destructive actions | Deactivate in header — no extra confirm — **PARTIAL** |
| Secret leaks | ELEVENLABS_API_KEY mentioned — **P0** |

**Settings score: 45%**

---

## 19. Master Admin Platform Overview

| Check | Result |
|-------|--------|
| Provider health cards | ElevenLabs, Twilio IE1, MCP, Queue — **PASS** for admin context |
| DLQ, latency, incidents | Shown — **PASS** |
| Real health vs env check | Depends on backend `platform-status` — baseline says flags off — **PARTIAL** |
| Mobile | 2-col metric grid — **NOT VERIFIED** |
| Operative usefulness | Good skeleton — **PASS** 70% |

**Master platform overview score: 68%**

---

## 20. Master Admin Organization Management

| Check | Result |
|-------|--------|
| Org list with plan, status, minutes, budget | **PASS** |
| Raw org ID in usage table | Shown as monospace — acceptable for master — **PASS** |
| Phone masked | Backend contract — **PASS** |
| Workspace on row click | `DetailDrawer` — **PARTIAL** vs full workspace page |
| Suspend with secure dialog | **PASS** |
| Mixed DE/EN | Labels mixed — **PARTIAL** |

**Master org management score: 65%**

---

## 21. Provisioning Experience

Master provisioning tab: org select, “Jobs laden”, “Provisionierung fortsetzen”, job table.

| Phase (ADR) | UI step |
|-------------|---------|
| Voice Subscription | In workspace jobs — **PARTIAL** |
| Twilio Subaccount | `openProvisionResume` — **PASS** admin |
| Regulatory / Phone / Agent / MCP / Webhooks / Test / Activation | Job table columns — **PARTIAL** visibility |
| Retry / idempotency | Secure dialogs — **PASS** |
| Unclear actions | “Jobs laden” — low context — **P2** |

Workspace is **drawer-based**, not dedicated route per org — **PARTIAL** vs expected workspace spec.

**Provisioning UI score: 60%**

---

## 22. Mobile and Responsive Audit

**Status: NOT VERIFIED** — no authenticated browser session; no screenshots captured.

Code-level indicators:

| Risk | Evidence |
|------|----------|
| Wide conversation table | Custom `<table>` without `DataTable` horizontal scroll wrapper |
| Telephony wizard select + buttons | Full width — likely OK |
| Wizard stepper | Horizontal scroll `chromeTabBar` pattern in wizard — **LIKELY** OK |
| Touch targets | Some buttons `text-[10px] py-1.5` — may be below 44px — **LIKELY** fail |
| Charts in analytics | Grid layouts — unknown overflow |

**Mobile score: NOT VERIFIED (code estimate 45%)**

---

## 23. Light and Dark Mode

**Status: NOT VERIFIED** visually.

Code uses semantic tokens (`surface-premium`, `text-foreground`, `text-muted-foreground`, status CSS variables) — **LIKELY** compatible with theme system used elsewhere.

Risks from code:

- Hardcoded `text-red-500` in `VoiceAnalyticsView` error state
- `text-amber-600` in master org errors — may not use status tokens

**Dark/Light score: NOT VERIFIED (code estimate 60%)**

---

## 24. Accessibility

### Code-level audit

| Check | Result |
|-------|--------|
| Semantic headings | Mixed — some `h3`/`h4`, header uses `h1` — **PARTIAL** |
| Form labels | `BuilderField` provides labels — **PARTIAL** |
| `aria-label` | Present on wizard stepper, ops nav, some filters — **PARTIAL** |
| `role="tablist"` | Wizard + master tabs — **PASS** |
| Focus trap in dialogs | `VoiceSecureActionDialog` — uses pattern components — **LIKELY** |
| Live regions | **NOT PRESENT** for async save/sync |
| Table headers | Conversations table — **PARTIAL** |
| Automated a11y tests | **NOT RUN** |

**Accessibility score: 48% (code-only)**

---

## 25. Internationalization

| Metric | Value |
|--------|-------|
| `voice.*` keys DE | 134 |
| `voice.*` keys EN | 134 |
| Parity | **PASS** key count |

### Major non-i18n components (hardcoded English)

| File | Examples |
|------|----------|
| `VoiceCommandHeader.tsx` | “AI Voice Command Center”, “Provider”, “Not connected”, “ElevenLabs ·” |
| `VoiceTelephonyWizard.tsx` | Entire component ~English |
| `VoiceTestCenter.tsx` | “Test Center”, “Session active”, scenario UI |
| `VoiceConversationsPanel.tsx` | “Sync from ElevenLabs”, filter labels |
| `VoiceAnalyticsView.tsx` | “No analytics yet”, “Sync conversations” |
| `VoiceAssistantBuilder.tsx` | Section titles, “Save changes”, field labels |
| `VoiceSelectorField.tsx` | Provider help text |
| `voice-assistant.ops.ts` | All status labels |
| `voice-conversation.utils.ts` | “Unknown caller”, “Outbound”/“Inbound” |
| `voice-assistant-permissions.ops.ts` | Tool labels in test scenarios |

Wizard steps using `t()` coexist with English children — **mixed language UX** when locale is DE.

**i18n score: 42%**

---

## 26. Technical Provider Leakage

| Term / exposure | Classification | Location |
|-----------------|----------------|----------|
| ElevenLabs brand in customer header | **Should not be visible** | `VoiceCommandHeader.tsx` L138–145 |
| `ELEVENLABS_API_KEY` env hint | **Should not be visible** | `VoiceTelephonyWizard.tsx` L238 |
| Full `elevenLabsAgentId` | **Diagnosis / master only** | `VoiceTelephonyWizard.tsx` L249–250 |
| Truncated agent ID in test center | **Diagnosis only** | `VoiceTestCenter.tsx` L164 |
| “Sync from ElevenLabs” | **Should not be visible** | `VoiceConversationsPanel.tsx`, `VoiceAnalyticsView.tsx` |
| “Purchase numbers in ElevenLabs” | **Should not be visible** | `VoiceTelephonyWizard.tsx` L284 |
| `phoneNumberId` in UI | **Master only** | Telephony select options |
| Twilio in customer header meta | **Diagnosis only** | `voice-assistant.ops.ts` provider labels |
| ElevenLabs / Twilio in master admin | **Allowed** | `VoiceAssistantAdminView.tsx` |
| MCP / Webhook in master | **Allowed** | Control plane platform tab |
| System prompt “sent to ElevenLabs” | **Should not be visible** | `VoiceAssistantBuilder.tsx` L388 |

**Provider leakage score: FAIL for customer org UI**

---

## 27. Component Reuse and Maintainability

| Recommendation | Priority |
|----------------|----------|
| Remove dead `VoicePermissionsMatrix`, `VoiceSectionNav` | P2 |
| Extract `VoiceOrgPageHeader` using `PageHeader` pattern | P2 |
| Centralize voice copy in i18n; ops returns keys not strings | P1 |
| Split `VoiceAssistantView` state into hook/store | P2 |
| Replace custom conversation table with `DataTable` | P2 |
| Customer telephony → managed-service wizard component | P0 |
| Promote `VoicePermissionGroupsPanel` patterns to automations real module | P1 |

---

## 28. UI/UX Production Readiness Matrix

| Area | PASS/PARTIAL/FAIL/NV | Maturity % | Brief justification |
|------|----------------------|------------|---------------------|
| Informationsarchitektur | PARTIAL | 58% | Wizard/ops split good; subscription states weak |
| Onboarding | PARTIAL | 52% | Phone step provider-centric |
| Aktive Übersicht | PARTIAL | 54% | Structure OK; provider chip |
| Gespräche | PARTIAL | 50% | Functional list; leakage + i18n |
| Automationen | FAIL | 25% | Permissions only, not automations |
| Analytics | PARTIAL | 48% | Charts exist; empty state leakage |
| Einstellungen | PARTIAL | 45% | Duplicates onboarding |
| Telefonnummern | FAIL | 32% | Not managed-service UX |
| Testcenter | PARTIAL | 46% | English; agent ID shown |
| Master Admin | PARTIAL | 66% | Solid control plane skeleton |
| Mobile | NOT VERIFIED | 45% est. | No browser proof |
| Dark/Light | NOT VERIFIED | 60% est. | Token usage OK unverified |
| Accessibility | PARTIAL | 48% | Partial aria; no live regions |
| i18n | FAIL | 42% | Major components English |
| Designkonsistenz | PARTIAL | 58% | Surface tokens OK; header diverges |
| **Gesamt-UI/UX** | **FAIL** | **52%** | P0 leakage + i18n block release |

---

## 29. P0 Findings

### VOICE-UI-P0-001

| Field | Value |
|-------|-------|
| Priority | P0 |
| Status | Open |
| Area | Phone / Telephony |
| Component | `VoiceTelephonyWizard.tsx` |
| Route | Org voice wizard + settings |
| Viewport | All |
| Description | Customer UI instructs admin to set `ELEVENLABS_API_KEY` and purchase/import numbers in ElevenLabs account |
| User impact | Exposes internal ops; breaks managed-service promise |
| Business impact | Support burden; trust loss; customers must understand provider |
| Technical cause | Legacy ElevenLabs self-service telephony wizard retained |
| Code evidence | L232–238, L284 |
| Screenshot | NOT VERIFIED |
| Fix direction | Replace with SynqDrive-managed number provisioning flow; server-side errors only in diagnostics |
| Dependencies | Backend provisioning (`VOICE_AI_TWILIO_TENANT_PROVISIONING`) |
| Verification | CONFIRMED |

### VOICE-UI-P0-002

| Field | Value |
|-------|-------|
| Priority | P0 |
| Status | Open |
| Area | Telephony |
| Component | `VoiceTelephonyWizard.tsx` |
| Route | Org voice |
| Viewport | All |
| Description | Full ElevenLabs Agent ID displayed to org users |
| User impact | Technical identifier leakage |
| Business impact | Security/support surface expansion |
| Technical cause | `agentOk` branch renders `assistant.elevenLabsAgentId` |
| Code evidence | L248–250 |
| Screenshot | NOT VERIFIED |
| Fix direction | Remove from customer UI; show “Assistent bereit” status only |
| Dependencies | None |
| Verification | CONFIRMED |

### VOICE-UI-P0-003

| Field | Value |
|-------|-------|
| Priority | P0 |
| Status | Open |
| Area | Conversations / Analytics |
| Component | `VoiceConversationsPanel.tsx`, `VoiceAnalyticsView.tsx` |
| Route | Ops tabs |
| Viewport | All |
| Description | “Sync from ElevenLabs” exposed as primary customer action |
| User impact | Customer must understand provider sync model |
| Business impact | Unprofessional; contradicts ADR |
| Technical cause | Legacy sync UX |
| Code evidence | Conversations L196, L320; Analytics L82, L91 |
| Screenshot | NOT VERIFIED |
| Fix direction | Rename to “Gespräche aktualisieren”; hide provider name |
| Dependencies | Background sync job UX |
| Verification | CONFIRMED |

---

## 30. P1 Findings

### VOICE-UI-P1-001 — Customer header shows “ElevenLabs ·” chip (`VoiceCommandHeader.tsx` L138–145) — CONFIRMED

### VOICE-UI-P1-002 — Widespread English hardcoding in DE locale (`VoiceAssistantBuilder`, `VoiceTestCenter`, `VoiceCommandHeader`, ops utils) — CONFIRMED

### VOICE-UI-P1-003 — Automations tab is permissions-only; product automations missing — CONFIRMED

### VOICE-UI-P1-004 — No subscription billing states (PAST_DUE, SUSPENDED, CANCELLED) in org UI — CONFIRMED

### VOICE-UI-P1-005 — Readiness percentage may imply false progress (env checks weighted equally) — LIKELY

### VOICE-UI-P1-006 — `VoiceSelectorField` tells customers about ElevenLabs API key configuration — CONFIRMED

### VOICE-UI-P1-007 — Master org workspace is drawer not structured multi-section workspace — CONFIRMED

### VOICE-UI-P1-008 — Conversation UI lacks booking/customer/vehicle deep links — CONFIRMED

---

## 31. P2 Findings

### VOICE-UI-P2-001 — Dead components: `VoicePermissionsMatrix.tsx`, `VoiceSectionNav.tsx` — CONFIRMED

### VOICE-UI-P2-002 — `VoiceAssistantView` monolith + 25-prop wizard drilling — CONFIRMED

### VOICE-UI-P2-003 — Custom conversations table vs shared `DataTable` — CONFIRMED

### VOICE-UI-P2-004 — Settings duplicates onboarding telephony/availability — CONFIRMED

### VOICE-UI-P2-005 — Master “Jobs laden” unclear operational meaning — CONFIRMED

### VOICE-UI-P2-006 — Small touch targets (`text-[10px]` buttons) — LIKELY

### VOICE-UI-P2-007 — No org-facing diagnostics role-gated section — CONFIRMED

### VOICE-UI-P2-008 — Mixed DE/EN in master admin actions (“Suspend”, “Workspace”) — CONFIRMED

---

## 32. P3 Improvements

### VOICE-UI-P3-001 — Add `PageHeader` to org voice for Fleet parity

### VOICE-UI-P3-002 — Recommended plan badge on plan step

### VOICE-UI-P3-003 — Net price note on plan cards

### VOICE-UI-P3-004 — “Resume later” explicit wizard copy

### VOICE-UI-P3-005 — Live regions for save/sync toasts for screen readers

### VOICE-UI-P3-006 — Cost column in conversations when billing available

### VOICE-UI-P3-007 — Holiday/special hours in availability

### VOICE-UI-P3-008 — Training example export from conversations

---

## 33. Required Target Experience

1. **Customer never sees** ElevenLabs, Twilio, Agent IDs, API keys, or sync terminology — only SynqDrive status (“Telefonie bereit”, “Assistent aktiv”, “Gespräche aktualisieren”).
2. **Phone onboarding** = choose SynqDrive number / forward / port — SynqDrive runs regulatory + provider steps in background with progress timeline.
3. **Full DE/EN** parity across all org-visible strings.
4. **Automations tab** shows real outbound workflow templates with guardrails.
5. **Master admin** retains technical detail with masking, secure actions, provisioning phases — optionally promote org workspace to dedicated route.
6. **Mobile-verified** responsive layouts with `DataTable` scroll and 44px touch targets.
7. **Accessibility**: live regions, focus management, contrast-verified dark/light.

---

## 34. Recommended Component Architecture

```
VoiceAssistantView (shell only)
├── useVoiceAssistantController() — data + mutations
├── VoiceOrgPageHeader (PageHeader pattern, i18n)
├── [draft] VoiceOnboardingWizard
│   ├── steps/*.tsx (all i18n)
│   └── VoiceManagedTelephonyStep (replaces VoiceTelephonyWizard customer surface)
└── [active] VoiceOpsLayout
    ├── VoiceOpsSectionNav
    └── tab panels
        ├── VoiceOperationsOverview
        ├── VoiceConversationsPanel (DataTable)
        ├── VoiceAutomationsPanel (new — workflow engine)
        ├── VoiceUsageAnalyticsPanel
        └── VoiceSettingsPanel (no duplicate telephony wizard)
```

Master: keep `VoiceAssistantAdminView` + extract `VoiceOrgWorkspacePage` when org selected.

---

## 35. Required Implementation Order

1. **P0 leakage removal** — telephony, sync buttons, agent ID, API key copy (customer paths only)
2. **i18n sweep** — `VoiceCommandHeader`, `VoiceTelephonyWizard` → managed telephony, `VoiceTestCenter`, conversations, analytics, builder, ops label keys
3. **Managed telephony UX** — new step component wired to provisioning APIs
4. **Automations panel** — real templates + integration with workflow engine
5. **Subscription state banners** — PAST_DUE, SUSPENDED, CANCELLED
6. **Master workspace** — optional full-page org workspace
7. **Mobile + a11y verification** — Playwright visual + axe suite
8. **Dead code removal** — matrix, section nav
9. **Design alignment** — PageHeader, DataTable, touch targets

---

## 36. Evidence Index

| ID | Type | Path | Description |
|----|------|------|-------------|
| E-01 | Code | `frontend/src/rental/components/voice-assistant/VoiceTelephonyWizard.tsx` | Provider leakage lines 232–284 |
| E-02 | Code | `frontend/src/rental/components/voice-assistant/VoiceCommandHeader.tsx` | ElevenLabs chip L138–145 |
| E-03 | Code | `frontend/src/rental/components/voice-assistant/VoiceConversationsPanel.tsx` | Sync from ElevenLabs L196 |
| E-04 | Code | `frontend/src/rental/components/voice-assistant/VoiceAnalyticsView.tsx` | Empty state L82 |
| E-05 | Test | `voice-assistant-ui.characterization.test.ts` | 11/11 PASS — wizard + ops structure |
| E-06 | Test | `voice-assistant.ops.characterization.test.ts` | 13/13 PASS |
| E-07 | Test | `voice-control-plane-admin.test.ts` | 5/5 PASS |
| E-08 | Runtime | `GET /api/v1/health` | 200 OK 2026-07-18T01:27:59Z |
| E-09 | Architecture | `architecture/VOICE_AI_REMEDIATION_BASELINE_2026-07-18.md` | Zero prod voice data |
| E-10 | i18n | `translations/de.ts` + `en.ts` | 134 `voice.*` keys each |

**Screenshots:** None captured — `docs/audits/evidence/voice-ai-ui/` contains index only; authenticated UI not accessible in audit environment.

---

## 37. Final UI/UX Decision

### UI/UX NO-GO

**Rationale:**

| Criterion | Status |
|-----------|--------|
| P0/P1 findings open | **3 P0, 8 P1** |
| Mobile verified | **NOT VERIFIED** |
| Dark/Light verified | **NOT VERIFIED** |
| Accessibility sufficient | **PARTIAL** — below bar |
| Provider tech in customer UI | **FAIL** — widespread |
| First-time + ops UI professional | **FAIL** — telephony + i18n |

**Conditional path to UI/UX GO:** Close all P0/P1, complete i18n, replace customer telephony with managed-service flow, verify mobile/dark/a11y with screenshot evidence, implement real automations tab or rename until ready.

---

*End of audit — Prompt 1B*
