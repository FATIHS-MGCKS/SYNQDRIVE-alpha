# Communication Center C8.1 — UI Shell Implementation

**Date:** 2026-08-22  
**Phase:** C8.1 (UI shell only)  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Depends on:** C0.2 RBAC (`communication.read`), C7 read API (not wired in C8.1)

---

## 1. Scope

C8.1 delivers the **visual and structural foundation** for the canonical Communication Center:

- Rental SPA route/view integration
- Sidebar navigation entry (RBAC-gated)
- Page header, primary tabs (Inbox / Settings)
- Inbox channel filters (All / WhatsApp / Voice / SMS)
- Desktop three-region workspace shell (inbox / timeline / context)
- Tablet and mobile responsive shells (stacked navigation, context sheet)
- Empty states and reusable skeleton components (not shown in default empty UI)
- i18n (EN + DE explicit; other locales inherit EN via spread)
- Unit and Playwright responsive tests

**Out of scope:** C7 API integration, conversation rows, message timeline, composer, settings migration, dashboard widget.

---

## 2. Existing UI audit (reused patterns)

| Concern | Reused from |
|--------|-------------|
| Page header | `frontend/src/components/patterns/page-header.tsx` (`PageHeader`) |
| Tabs | `frontend/src/components/ui/tabs.tsx` (Radix) |
| Empty / error states | `frontend/src/components/patterns/states.tsx` |
| Skeletons | `frontend/src/components/ui/skeleton.tsx` |
| Three-column inbox layout proportions | `frontend/src/rental/components/whatsapp/WhatsAppInboxLayout.tsx` |
| Mobile pane stacking | WhatsApp `mobilePane` pattern + Support `Sheet` |
| RBAC helpers | `frontend/src/rental/lib/communication-permissions.ts` |
| URL filter sync | `frontend/src/rental/components/tasks/tasksListState.ts` |
| Finance view URL parsing | `frontend/src/rental/components/finance-navigation.ts` |
| App view routing | `frontend/src/rental/App.tsx` (`currentView` state machine) |

---

## 3. Route

**Canonical rental view id:** `communication-center`

**Deep-link URL (SPA query params):**

```
/rental?view=communication-center
/rental?view=communication-center&communicationTab=inbox&communicationChannel=all
/rental?view=communication-center&conversationId=<uuid>
/rental?view=communication-center&communicationPane=conversation|context
```

No separate path route — consistent with existing rental SPA architecture.

---

## 4. Navigation placement

- **Location:** Primary navigation, immediately after **Tasks**
- **Icon:** Lucide `Inbox` (neutral, multi-channel)
- **Visibility:** `hasCommunicationPermission(hasPermission, 'read', userRole)`
- **Unchanged:** WhatsApp Business and AI Voice Assistant remain under Automation (C8.4 consolidation deferred)

---

## 5. RBAC

| Permission | Nav | Page |
|------------|-----|------|
| `communication.read` (or legacy bridges per C0.2) | Visible | `CommunicationCenterView` shell |
| No permission | Hidden | Access-denied `EmptyState` on direct `?view=communication-center` |

Backend `PermissionsGuard` remains authoritative; frontend mirrors C0.2 helpers only.

---

## 6. Information architecture

**Decision:** Single canonical inbox with channel filters — not separate per-provider inbox tabs.

| Level | Items |
|-------|-------|
| Primary tabs | Inbox, Settings |
| Inbox channel filters | All, WhatsApp, Voice, SMS |
| Settings (C8.1) | Placeholder shell only (C8.4 owns config migration) |

---

## 7. Inbox vs Settings

- **Inbox:** Operational workspace (list + timeline + context regions)
- **Settings:** Structural tab present; placeholder copy only — no provider config migration in C8.1

---

## 8. Channel filter model

Provider-neutral filter state (`CommunicationChannel`) synced to `communicationChannel` URL param. Filters affect future C8.2 list queries; C8.1 renders filter UI only.

---

## 9. Desktop layout

```
┌─────────────────────────────────────────────────────────────┐
│ PageHeader: Communication Center                            │
│ [ Inbox | Settings ]                                        │
├──────────────┬──────────────────────────┬───────────────────┤
│ Inbox ~320px │ Timeline (flex)          │ Context ~280px      │
│ + filters    │ empty / future messages  │ (when selected)     │
└──────────────┴──────────────────────────┴───────────────────┘
```

Grid: `lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]` + `xl` third column when conversation selected.

---

## 10. Tablet behavior (1024–1279px)

- Inbox + timeline visible
- Context panel via sheet (trigger from workspace header)

---

## 11. Mobile behavior (<1024px)

Stacked panes via `communicationPane` state:

1. Inbox list (default)
2. Conversation workspace (on `conversationId`)
3. Context sheet

Back control returns to inbox list.

---

## 12. Deep-link readiness

URL params parsed on shell mount and written on state changes (`syncCommunicationCenterStateToUrl`):

- `communicationTab`
- `communicationChannel`
- `conversationId`
- `communicationPane`

Refresh restores tab/channel/conversation shell state without in-memory-only routing.

---

## 13. Component structure

```
frontend/src/rental/components/communication-center/
  communication-center-navigation.ts
  communication-center.types.ts
  CommunicationCenterView.tsx
  CommunicationCenterShell.tsx
  CommunicationCenterHeader.tsx
  CommunicationCenterTabs.tsx
  CommunicationChannelFilters.tsx
  CommunicationInboxPane.tsx
  CommunicationWorkspacePane.tsx
  CommunicationContextPane.tsx
  CommunicationEmptyState.tsx
  skeletons/
```

---

## 14. Scroll strategy

Workspace container: `h-[min(72vh,820px)]` with per-panel `overflow-y-auto` and `min-h-0` / `min-w-0` — aligned with WhatsApp inbox layout. Page header and tabs remain outside the scroll region.

---

## 15. i18n

Keys under `communication.*` and `nav.communicationCenter` added to `en.ts` and `de.ts`. Locales spreading `en` (`fr`, `nl`, `es`, `it`, `pl`, `cs`) inherit English communication strings until localized.

---

## 16. Accessibility

- Radix `Tabs` for primary sections (tablist/tab/tabpanel semantics)
- Channel filters use `role="tablist"` / `role="tab"` with `aria-selected`
- Icon buttons include `aria-label` (back, open context)
- Semantic headings (`h1` page, `h2` panel titles)

---

## 17. Tests

| Suite | Path |
|-------|------|
| Navigation URL unit | `communication-center-navigation.test.ts` |
| Shell render / i18n | `communication-center-shell.test.tsx` |
| RBAC | `communication-center-rbac.test.tsx` |
| Nav permission contract | `communication-center-nav.test.ts` |
| Playwright responsive | `e2e/communication-center-responsive.spec.ts` |

---

## 18. Visual validation

Playwright screenshots at `mobile-390`, `tablet-768`, `desktop-1280` stored under `playwright-report/communication-center-*.png` during CI/local runs.

---

## 19. Dashboard non-regression

No changes to `DashboardView` grid or notification/task panels. E2E verifies dashboard still renders with communication nav additive only.

---

## 20. Known limitations

- No `GET /communication/conversations` integration
- No search input in inbox (deferred — avoids non-functional control in production)
- No composer region UI (reserved layout slot only)
- Settings tab is placeholder until C8.4
- Context panel sections show structural labels only

---

## 21. C8.2 readiness

Shell exposes stable contracts for:

- Inbox list injection into `CommunicationInboxPane`
- Timeline content in `CommunicationWorkspacePane`
- Context resolution data in `CommunicationContextPane`
- URL-driven `conversationId` + `communicationChannel` for list/timeline fetches

**Status:** READY FOR C8.2 inbox data integration.

---

**Changes / Architektur (Synqdrive Code):** Not updated — external workspace per repo convention; in-repo architecture record is this document.
