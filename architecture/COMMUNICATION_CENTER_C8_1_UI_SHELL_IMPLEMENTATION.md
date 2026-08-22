# Communication Center C8.1 — UI Shell Implementation

**Date:** 2026-08-22
**Phase:** C8.1 (UI shell only) — hardened final
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha
**Depends on:** C0.2 RBAC (`communication.read`), C7 read API (not wired in C8.1)

---

## 1. Scope

C8.1 delivers the **visual and structural foundation** for the canonical Communication Center:

- Rental SPA route/view integration
- Sidebar navigation entry (RBAC-gated)
- Page header and inbox channel filters (All / WhatsApp / Voice / SMS)
- Desktop three-region workspace shell (inbox / timeline / context)
- Tablet and mobile responsive shells (stacked navigation, context sheet)
- Structural skeleton regions only — no API-derived empty claims
- i18n (EN + DE explicit; other locales inherit EN via spread)
- Unit and Playwright responsive tests

**Out of scope:** C7 API integration, conversation rows, message timeline, composer, Settings tab UI (C8.4), dashboard widget.

---

## 2. Existing UI audit (reused patterns)

| Concern | Reused from |
|--------|-------------|
| Page header | `frontend/src/components/patterns/page-header.tsx` (`PageHeader`) |
| Empty / error states | `frontend/src/components/patterns/states.tsx` |
| Skeletons | `frontend/src/components/ui/skeleton.tsx` |
| Three-column inbox layout proportions | `frontend/src/rental/components/whatsapp/WhatsAppInboxLayout.tsx` |
| Mobile pane stacking | WhatsApp `mobilePane` pattern + Support `Sheet` |
| Channel filter semantics | `aria-pressed` button group (WhatsApp filter style, `sq-press`) |
| RBAC helpers | `frontend/src/rental/lib/communication-permissions.ts` |
| URL filter sync | `frontend/src/rental/components/tasks/tasksListState.ts` |
| App view routing | `frontend/src/rental/App.tsx` (`currentView` state machine) |

---

## 3. Route

**Canonical rental view id:** `communication-center`

**Deep-link URL (SPA query params):**

```
/rental?view=communication-center
/rental?view=communication-center&communicationChannel=whatsapp
/rental?view=communication-center&conversationId=<id>&communicationPane=conversation
/rental?view=communication-center&conversationId=<id>&communicationPane=context
```

`communicationTab=settings` is parsed and **normalized to inbox** until C8.4 — no Settings placeholder UI is rendered.

No separate path route — consistent with existing rental SPA architecture.

---

## 4. Navigation placement

- **Location:** Primary navigation, immediately after **Tasks**
- **Icon:** Lucide `Inbox` (neutral, multi-channel)
- **Visibility:** `hasCommunicationPermission(hasPermission, 'read', userRole)`
- **Expanded + collapsed sidebar:** same `renderNavigationContent` — Communication Center appears exactly once in each mode
- **Unchanged:** WhatsApp Business and AI Voice Assistant remain under Automation (C8.4 consolidation deferred)

---

## 5. RBAC

| Permission | Nav | Page |
|------------|-----|------|
| `communication.read` (or legacy bridges per C0.2) | Visible | `CommunicationCenterView` shell |
| No permission | Hidden | Access-denied `EmptyState` on direct `?view=communication-center` |

`CommunicationCenterView` returns `null` while `useRentalOrg().loading` — no shell flash before permission is known.

Backend `PermissionsGuard` remains authoritative; frontend mirrors C0.2 helpers only.

---

## 6. Information architecture

**Decision:** Single canonical inbox with channel filters — not separate per-provider inbox tabs.

| Level | Items |
|-------|-------|
| Production primary surface | **Inbox only** |
| Inbox channel filters | All, WhatsApp, Voice, SMS |
| Settings (internal type) | Reserved for C8.4 — hidden from production UI |

---

## 7. Channel filter model

Provider-neutral filter state (`CommunicationChannel`) synced to `communicationChannel` URL param.

**C8.1 shell invariant:** changing channel filter clears `selectedConversationId` and resets `mobilePane` to `inbox` until C8.2 can prove the selection belongs to the new filter.

**Accessibility:** `role="group"` with `aria-label` + `aria-pressed` toggle buttons (not partial ARIA tabs). Keyboard: Tab focus, Enter/Space activation, visible focus ring, selected state via ring + background (not color-only).

---

## 8. Responsive breakpoint contract

Constants: `communication-center-breakpoints.ts`

| Band | CSS / matchMedia | Behavior |
|------|------------------|----------|
| **Mobile** | `max-width: 1023px` | Stacked panes; default inbox-only |
| **Tablet** | `1024px – 1279px` | Inbox + workspace; context via Sheet |
| **Desktop** | `≥ 1280px` | Inbox + workspace; persistent context column at `xl` when conversation selected |

### Playwright validation widths

| Label | Width | Contract tested |
|-------|-------|-----------------|
| Mobile | **390px** | Inbox-only default; selected conversation workspace; context Sheet |
| Compact | **768px** | Mobile stacked behavior — **not** the 1024–1279 tablet contract |
| Tablet | **1024px** (optional **1100px**) | Inbox + workspace; no persistent context column; Sheet open/close |
| Desktop | **1440px** | Empty two-region; three-region when `conversationId` set |

Legacy project names `tablet-768` and `desktop-1280` remain in Playwright config for other suites; C8.1 canonical proofs use `mobile-390`, `tablet-1024`, `desktop-1440`.

---

## 9. Desktop layout (≥1280px, conversation selected)

```
┌─────────────────────────────────────────────────────────────┐
│ PageHeader: Communication Center                            │
├──────────────┬──────────────────────────┬───────────────────┤
│ Inbox ~320px │ Timeline (flex)          │ Context ~280px    │
│ + filters    │ shell / future messages  │ (persistent xl)   │
└──────────────┴──────────────────────────┴───────────────────┘
```

Grid: `lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]` + `xl` third column when `conversationId` present.

Without selection: inbox + workspace empty state (two regions).

---

## 10. Tablet behavior (1024–1279px)

- Inbox + workspace visible
- Persistent context column **hidden**
- Context action in workspace header opens Sheet
- Closing Sheet returns to conversation workspace (`communicationPane=conversation`)

---

## 11. Mobile behavior (≤1023px)

Stacked panes via `communicationPane` state:

1. **Default:** inbox pane only
2. **`conversationId` + `communicationPane=conversation`:** workspace only; Back clears pane → inbox
3. **Context:** Sheet opens; close returns to conversation workspace

URL state remains coherent via `syncCommunicationCenterStateToUrl` + `popstate` listener.

---

## 12. Browser navigation (Back/Forward)

`CommunicationCenterShell` listens to `popstate` and re-reads URL into React state.

Verified flow: All → WhatsApp → Voice via filter clicks (pushState) → browser Back → WhatsApp → Back → All.

Pane and conversation params follow the same pattern on Back/Forward.

---

## 13. Component structure

```
frontend/src/rental/components/communication-center/
  communication-center-breakpoints.ts
  communication-center-navigation.ts
  communication-center.types.ts
  CommunicationCenterView.tsx
  CommunicationCenterShell.tsx
  CommunicationCenterHeader.tsx
  CommunicationChannelFilters.tsx
  CommunicationInboxPane.tsx
  CommunicationWorkspacePane.tsx
  CommunicationContextPane.tsx
  CommunicationEmptyState.tsx
  skeletons/
```

`CommunicationCenterTabs.tsx` removed from production — Settings deferred to C8.4.

---

## 14. Scroll / height strategy

Workspace container:

- Mobile: `max-lg:h-[min(70dvh,720px)]` — no forced `min-h-[480px]`
- Desktop: `lg:h-[min(72vh,820px)] lg:min-h-[480px]`

Per-panel `overflow-y-auto` with `min-h-0` / `min-w-0`. Page header outside scroll region. No fragile `100vh` on shell root.

---

## 15. Empty / shell states (no fake API claims)

| Region | C8.1 production behavior |
|--------|--------------------------|
| Inbox list | Structural blank `communication-inbox-list-shell` — **no** "No conversations yet" |
| Workspace (no selection) | Neutral "Select a conversation" empty state |
| Context (selected) | Single neutral `communication.context.shellEmpty` — **not** five repetitive failed-resolution sections |
| Conversation rows | None — no fake list data |

---

## 16. i18n governance

- **Explicit locales:** EN (`en.ts`), DE (`de.ts`) — all `communication.*` keys present in both
- **Spread locales:** `fr`, `nl`, `es`, `it`, `pl`, `cs` use `Record<TranslationKey, string>` with `...en` spread — English fallback is canonical policy for communication keys until localized
- **Type safety:** `TranslationKey` from `en.ts`; `tsc -b` enforces DE parity
- **No dedicated i18n CLI** in repo; governance = TypeScript structural parity + vitest copy assertions + Playwright EN/DE smoke

Reserved keys (`communication.tabs.*`, `communication.settings.placeholder.*`) remain in dictionaries for C8.4 but are unused in production UI.

---

## 17. Typography

Panel titles and filter chips use established SynqDrive operational sizes (`text-[13px]` headers, `text-[10px]` filter chips with `sq-press`) aligned with Tasks / WhatsApp patterns — no global typography changes.

---

## 18. Tests

| Suite | Path | Count |
|-------|------|-------|
| Navigation URL unit | `communication-center-navigation.test.ts` | 7 |
| Shell render / i18n / popstate | `communication-center-shell.test.tsx` | 7 |
| RBAC + loading | `communication-center-rbac.test.tsx` | 3 |
| Nav permission contract | `communication-center-nav.test.ts` | 2 |
| Sidebar nav contract | `communication-center-sidebar-nav.test.ts` | 3 |
| Playwright responsive | `e2e/communication-center-responsive.spec.ts` | 18 |

### Playwright matrix (A–W)

A. Nav visible with `communication.read`
B. Nav absent without permission
C. Direct route denied
D. Default inbox/all
E. Channel change URL sync
F. Browser Back/Forward channel restore
G. Channel change clears incompatible conversation
H. 390 mobile inbox default
I. 390 selected + back
J. 390 context sheet
K. 1024 tablet inbox + workspace
L. Tablet context sheet
M. 1440 desktop empty
N. 1440 three-region selected
O. Channel filter keyboard (`aria-pressed`)
P. No fake conversation rows
Q. No unverified zero-conversations copy
R. Settings placeholder not exposed
S. EN copy
T. DE copy
U. i18n structural parity (`tsc` + unit)
V. Dashboard non-regression
W. Expanded/collapsed nav source contract

---

## 19. Visual validation / screenshot matrix

Playwright artifacts (project `desktop-1440`, `mobile-390`, `tablet-1024`):

| File | Viewport | State |
|------|----------|-------|
| `communication-center-mobile-390-inbox.png` | 390 | Default inbox |
| `communication-center-mobile-390-selected.png` | 390 | Selected conversation |
| `communication-center-tablet-1024-selected.png` | 1024 | Selected + context Sheet exercised |
| `communication-center-desktop-1440-empty.png` | 1440 | No conversation selected |
| `communication-center-desktop-1440-selected.png` | 1440 | Three-region layout |

Stored under `frontend/playwright-report/` during test runs.

---

## 20. Dashboard non-regression

No changes to `DashboardView` grid logic. E2E verifies dashboard tasks panel still renders with Communication Center nav additive (single nav entry).

---

## 21. Known limitations

- No `GET /communication/conversations` integration
- No search input in inbox (deferred)
- No composer region UI (reserved layout slot only)
- Settings tab hidden until C8.4
- Context shows structural empty state only

---

## 22. C8.2 readiness

Shell exposes stable contracts for:

- Inbox list injection into `CommunicationInboxPane`
- Timeline content in `CommunicationWorkspacePane`
- Context resolution data in `CommunicationContextPane`
- URL-driven `conversationId` + `communicationChannel` for list/timeline fetches
- Channel-change selection reset invariant

**Status:** READY FOR C8.2 inbox data integration.

---

**Changes / Architektur:** Updated in this document (C8.1 hardening pass).
