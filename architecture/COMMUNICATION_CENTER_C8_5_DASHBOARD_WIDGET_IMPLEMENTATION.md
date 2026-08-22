# Communication Center C8.5 — Dashboard Communication Widget Implementation

**Date:** 2026-08-22
**Phase:** C8.5 (incl. attention-queue correctness hardening)
**Branch:** `cursor/communication-center-c8-5-dashboard-widget-40bb`
**PR:** #1183
**Base:** `main` after PR #1174 (C8.4)

## 1. Scope

C8.5 adds a compact **Communication** dashboard widget that answers: *Which conversations need attention right now?*

**In scope**

- Dashboard widget shell in standard (non–operator-focus) layout
- Summary metrics: Unread, Needs attention, Unassigned
- **Globally correct** prioritized conversation preview rows (max 5)
- Deep links into Communication Center (inbox filters + selected conversation)
- Channel/status indicators, attention badges, unread counts
- Loading / empty / error / partial-failure states
- RBAC (`communication.read`), org race safety, responsive behavior (390 / 1024 / 1440)
- Unit + Playwright + PostgreSQL integration tests; dashboard non-regression

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

Operator focus mode intentionally **excludes** the widget.

---

## 4. Canonical data sources (hardened)

| Request | Endpoint | Purpose |
|---------|----------|---------|
| 1 | `GET /organizations/:orgId/communication/conversations/summary` | Exact metric counts (authoritative) |
| 2 | `GET /organizations/:orgId/communication/conversations/attention-preview?limit=5` | Globally correct attention queue rows |

**Rejected approach:** `GET /conversations?limit=30` + client-side tier ranking.

**Why rejected:** Recent-list ordering (`lastActivityAt DESC`) does not guarantee that a `HUMAN_REQUIRED` conversation outside the first N rows appears in the widget. A larger arbitrary window (50/100/500) does not solve correctness.

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

Metrics are **never** inferred from attention-preview rows.

---

## 6. Global priority semantics

Canonical tier semantics (shared by backend attention-preview and frontend `communication-dashboard-priority.ts`):

| Tier | Condition |
|------|-----------|
| 1 | `status === 'HUMAN_REQUIRED'` |
| 2 | `unreadCount > 0` AND unassigned |
| 3 | `unreadCount > 0` |
| 4 | unassigned AND not terminal status |

**Terminal statuses excluded from tier 4:** `RESOLVED`, `FAILED` (unless unread).

Within tier: `lastActivityAt DESC`, then `id ASC`. Dedupe by `conversation.id`. Cap: 5 rows.

---

## 7. Attention-preview backend (C7 extension)

**Endpoint:** `GET /organizations/:orgId/communication/conversations/attention-preview`

- Provider-neutral canonical read (not a dashboard-specific provider endpoint)
- RBAC: `communication.read`
- Org-scoped via `OrgScopingGuard`
- Response: `{ items: CommunicationConversationListItem[] }` (list DTO only; no pagination)
- Query: `limit` (default 5, max 10)

**Repository strategy:** up to four **bounded** tier queries (`take = remaining limit`), excluding already-selected IDs. No `findMany(all)` + in-memory sort.

Uses indexed fields: `organizationId`, `status`, `unreadCount`, `assignedUserId`, `lastActivityAt`.

Files:

- `communication-read.attention-preview.ts` — tier where builders
- `communication-read.repository.ts` — `listAttentionPreviewConversations`
- `communication-read.service.ts` / `communication-read.controller.ts`

---

## 8. Request budget

| Scenario | Summary | Attention preview | Total |
|----------|---------|-------------------|-------|
| Attention needed | 1 | 1 | **2** |
| No attention (all metrics zero) | 1 | 0 (short-circuit) | **1** |

Hook fetches summary first. Short-circuits attention-preview **only** when summary succeeded and all attention metrics are exactly zero. Summary failure still calls attention-preview.

No detail / events / context / provider config / native provider calls.

---

## 9. Row display model

Unchanged from initial C8.5 — `CommunicationDashboardRow` uses C8.2 display helpers on list DTO fields only.

---

## 10. Deep links

Unchanged — `buildCommunicationCenterUrl` / `buildCommunicationCenterState`.

---

## 11. RBAC

`communication.read` required; widget absent and zero Communication requests without permission.

---

## 12. Tenant / race safety

`useOrgScopedGenerationRef` guards summary and attention-preview responses on org switch.

---

## 13. Loading / empty / error

Sequential load: summary → (optional) attention-preview. Skeleton during either phase.

Empty when summary reports zero attention signals.

---

## 14. Partial failure

| Failure | Behavior |
|---------|----------|
| Summary fails, preview OK (rows) | Metrics unavailable (`—`); attention rows render |
| Summary OK, preview fails | Metrics visible; row-area error |
| Both fail | Compact full widget error + retry |
| Summary OK, all metrics zero | Preview **skipped** (short-circuit only after successful zero-attention summary) |

`null` summary means **unavailable**, not zero attention. Summary failure always falls through to attention-preview unless org/generation is stale.

---

## 15. Dashboard refresh integration

Widget reloads when `vm.lastManualSyncAt` changes (set by `refreshAll()` in operator focus mode and available on standard dashboard VM). No independent polling.

---

## 16. Responsive / accessibility / i18n / security

Unchanged from initial C8.5 implementation.

---

## 17. Tests

| Area | File |
|------|------|
| Tier semantics (unit) | `communication-dashboard-priority.test.ts` |
| >30 window regression (proves old approach fails) | `communication-dashboard-priority.global.test.ts` |
| Attention-preview tier builders | `communication-read.attention-preview.spec.ts` |
| Global correctness (35+ conv, tier fill, terminal) | `communication-read.postgres.integration.spec.ts` (AP1–AP3) |
| Hook short-circuit / race / refresh | `useCommunicationDashboard.test.ts` |
| E2E endpoint shape proof | `e2e/communication-dashboard-widget.spec.ts` |

---

## 18. Known limitations

1. Operator focus mode dashboard does not show Communication widget.
2. Standard dashboard `refreshAll()` is only wired via `lastManualSyncAt` — no periodic background refresh.

---

## 19. Next phase readiness

**READY FOR COMMUNICATION WRITE PHASE** — read path, globally correct attention queue, deep links complete.

---

## File map

| File | Role |
|------|------|
| `backend/.../communication-read.attention-preview.ts` | Tier where builders |
| `backend/.../communication-read.repository.ts` | Bounded tier queries |
| `backend/.../communication-read.controller.ts` | `attention-preview` route |
| `frontend/.../useCommunicationDashboard.ts` | Summary + preview hook |
| `frontend/.../communication-dashboard-priority.ts` | Shared tier semantics (tests + helpers) |
| `frontend/.../CommunicationDashboardWidget.tsx` | Widget shell |
