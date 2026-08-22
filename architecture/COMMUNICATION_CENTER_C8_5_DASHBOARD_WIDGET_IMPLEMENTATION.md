# Communication Center C8.5 — Dashboard Communication Widget Implementation

**Date:** 2026-08-22  
**Phase:** C8.5  
**Branch:** `feature/communication-center-c8-5-dashboard-widget-40bb`  
**Base:** `main` after PR #1174 (C8.4)

## 1. Scope

C8.5 adds a compact **Communication** dashboard widget that answers: *Which conversations need attention right now?*

**In scope**

- Dashboard widget shell in standard (non–operator-focus) layout
- Summary metrics: Unread, Needs attention, Unassigned
- Prioritized conversation preview rows (max 5)
- Deep links into Communication Center (inbox filters + selected conversation)
- Channel/status indicators, attention badges, unread counts
- Loading / empty / error / partial-failure states
- RBAC (`communication.read`), org race safety, responsive behavior (390 / 1024 / 1440)
- Unit + Playwright tests; dashboard non-regression

**Out of scope**

- Composer / send / reply / mark read / assignment / handoff mutations
- Provider settings, sent.dm provisioning, timeline in dashboard
- Native WhatsApp/SMS/Voice provider API reads
- Operator focus mode dashboard (widget excluded intentionally)
- Global dashboard grid redesign

---

## 2. Dashboard placement audit

Standard dashboard (`DashboardView.tsx`) layout:

| Region | Component |
|--------|-----------|
| Top left | Control KPI strip + Finance KPI strip |
| Top right | Utilization panel |
| Lower left (`notificationsSlot`) | Operations / Notifications (`ActionQueue` or `DashboardAttentionStack` with Fleet Readiness) |
| Lower right (`tasksSlot`) | `DashboardTasksOverviewPanel` |

Mobile stacking follows `DASHBOARD_LAYOUT.lowerAttentionGrid`: left column (notifications + communication) stacks above tasks.

---

## 3. Placement decision

**Decision:** mount `CommunicationDashboardWidget` in `notificationsSlot`, **below** Operations/Notifications, in the same left operational column as Tasks (adjacent on desktop).

**Rationale**

- Groups actionable operational attention with Notifications and Tasks
- Avoids Fleet Readiness / vehicle-health KPI area
- Preserves existing grid widths and card hierarchy
- Matches product intent: “what needs human action now”

Operator focus mode intentionally **excludes** the widget (no layout slot change in focus shell).

---

## 4. Canonical data sources

| Request | Endpoint | Purpose |
|---------|----------|---------|
| 1 | `GET /organizations/:orgId/communication/conversations/summary` | Exact metric counts |
| 2 | `GET /organizations/:orgId/communication/conversations?limit=30` | Candidate pool for client-side priority |

No new backend endpoint. C7 summary DTO already exposes:

- `unreadConversations`
- `requiresAttention` (human-required conversations)
- `unassigned`

List DTO: `CommunicationConversationListItem` (C7 read contract).

---

## 5. Summary contract

```ts
interface CommunicationConversationSummary {
  totalUnreadMessages: number;
  unreadConversations: number;
  unassigned: number;
  requiresAttention: number;
  byChannel: Partial<Record<CommunicationApiChannel, number>>;
}
```

Widget maps:

| UI label | Summary field |
|----------|---------------|
| Unread | `unreadConversations` |
| Needs attention | `requiresAttention` |
| Unassigned | `unassigned` |

Counts are backend-authoritative; never inferred from loaded rows.

---

## 6. Priority logic

Deterministic tiers (`communication-dashboard-priority.ts`):

| Tier | Condition |
|------|-----------|
| 1 | `status === 'HUMAN_REQUIRED'` |
| 2 | `unreadCount > 0` AND unassigned |
| 3 | `unreadCount > 0` |
| 4 | unassigned AND not terminal status |

**Terminal statuses excluded from unassigned-only tier:** `RESOLVED`, `FAILED` (unless unread).

Sort within tier: `lastActivityAt DESC`, then `id` ASC. Dedupe by `conversation.id`. Cap: 5 rows.

---

## 7. Request budget

**Target:** 2 requests per dashboard mount  
**Maximum:** 2 (summary + list)  
**No** per-row detail, events, context, or provider config requests.

Hook: `useCommunicationDashboard` — parallel `Promise.allSettled`, independent partial failure.

---

## 8. Row display model

Component: `CommunicationDashboardRow`

| Layer | Source |
|-------|--------|
| Title | `resolveConversationTitle` (C8.2) |
| Preview | `resolveConversationPreview` (C8.2), one line |
| Channel | Icon + localized channel label |
| Time | `formatCommunicationTimestamp` |
| Context | `buildConversationContextLabel` (optional, one line) |
| Badge | Human required > Unassigned (single primary badge) |
| Unread | Small count badge when `unreadCount > 0` (99+ cap) |

List DTO only — no `getConversation`, events, or metadata inspection.

---

## 9. Deep links

Central helper: `buildCommunicationCenterUrl` / `buildCommunicationCenterState` (`communication-center-url.ts`).

| Action | URL state |
|--------|-----------|
| Row click | `view=communication-center`, `conversationId`, `communicationChannel`, `communicationPane=conversation` |
| Unread metric | `communicationUnread=true` |
| Needs attention | `communicationStatus=HUMAN_REQUIRED` |
| Unassigned metric | `communicationAssignment=unassigned` |
| Header “Open Communication Center” | Inbox, no filters |

`App.tsx` → `onOpenCommunicationCenter` syncs URL + `handleViewChange('communication-center')`.

---

## 10. RBAC

- Widget renders only when `hasPermission('communication', 'read')`
- Hook `enabled: false` without permission → **no API calls**
- No disabled shell for unauthorized users

---

## 11. Tenant / race safety

`useOrgScopedGenerationRef` in `useCommunicationDashboard`:

- Late responses from prior org ignored
- State cleared on org change / disabled

---

## 12. Loading / empty / error

| State | Behavior |
|-------|----------|
| Loading | Compact skeleton (`NotificationCardSkeleton`, 3 rows) |
| Empty attention | “No conversations need attention” (positive neutral copy) |
| Both failed | Compact `ErrorState` + retry |
| Summary failed, list OK | Metrics `—`; rows render |
| List failed, summary OK | Metrics visible; rows error line |

---

## 13. Partial failure

Independent summary/list promises; valid data retained when sibling request fails. Retry reloads both.

---

## 14. Responsive behavior

- **1440:** aligns with adjacent operational cards; `max-lg:max-h-[min(320px,42vh)]` on widget
- **1024:** grid unchanged; metric chips in 3-column row
- **390:** metrics wrap; rows full-width tappable; scroll blur for overflow

---

## 15. Accessibility

- Widget: `section` + `aria-label`
- Metrics: `button` with visible focus ring
- Rows: `button` with `aria-label` including channel + title
- Unread count: `aria-label` via `communication.inbox.unreadCount`

---

## 16. i18n

Keys under `communication.dashboard.*` (en + de): title, subtitle, metrics, badges, empty, error, retry.

Reuses C8.2 keys for channels, previews, timestamps where applicable.

---

## 17. Security

- Preview rendered as plain React text (no HTML / linkification)
- No preview in logs, analytics, or data attributes
- List DTO allowlist only — no metadata URL inspection
- Voice rows use semantic call fallback, no transcript

---

## 18. Performance / request count

- Widget skeleton does not block whole dashboard render
- No independent polling; loads on mount (aligns with dashboard one-shot fetch model)
- 2 canonical GETs; client-side priority on ≤30 items

---

## 19. Dashboard non-regression

- No changes to Fleet Readiness, Notifications, Tasks, Business Pulse grid slots
- Widget added as sibling below notifications in existing left column
- Existing dashboard E2E + unit suites remain green

---

## 20. Tests

| Area | File |
|------|------|
| Priority tiers / dedupe / terminal exclusion | `communication-dashboard-priority.test.ts` |
| Deep-link URL builder | `communication-center-url.test.ts` |
| Hook org race + partial failure | `useCommunicationDashboard.test.ts` |
| Widget RBAC, row/metric clicks, secret boundary | `communicationDashboardWidget.test.tsx` |
| E2E 390 / 1024 / 1440, metric links, network proof | `e2e/communication-dashboard-widget.spec.ts` |

---

## 21. Known limitations

1. Operator focus mode dashboard does not show Communication widget.
2. Priority uses client-side ranking on first 30 list items — exact row order may omit lower-tier items outside the candidate window (metrics remain exact via summary).
3. Dashboard does not auto-refresh Communication data on `vm.refreshAll()` yet (mount-only; same as initial C8.5 scope).
4. Human-required metric deep link depends on C8.2 URL filter support (`communicationStatus=HUMAN_REQUIRED`) — implemented and tested.

---

## 22. Next phase readiness

**READY FOR COMMUNICATION WRITE PHASE** — read path, deep links, and attention surfacing are complete. Write operations (reply, assign, resolve) remain in Communication Center proper.

---

## File map

| File | Role |
|------|------|
| `frontend/src/rental/components/dashboard/communication/CommunicationDashboardWidget.tsx` | Widget shell |
| `frontend/src/rental/components/dashboard/communication/CommunicationDashboardSummary.tsx` | Metric chips |
| `frontend/src/rental/components/dashboard/communication/CommunicationDashboardRow.tsx` | Compact row |
| `frontend/src/rental/components/dashboard/useCommunicationDashboard.ts` | Data hook |
| `frontend/src/rental/components/communication-center/communication-dashboard-priority.ts` | Priority + dedupe |
| `frontend/src/rental/components/communication-center/communication-center-url.ts` | Deep-link helpers |
| `frontend/src/rental/components/DashboardView.tsx` | Placement |
| `frontend/src/rental/App.tsx` | Navigation wiring |
