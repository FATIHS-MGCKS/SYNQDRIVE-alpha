# Product Profile — Operator (Mobile Field)

**Domain:** Field operator workflows  
**Route:** `/operator/*`  
**Code root:** `frontend/src/operator/`  
**Epistemic baseline:** CONFIRMED @ `413175e8c`

## UX intent

**Mobile-first** execution: today feed, scan, vehicles, tasks, handover/damages/AI upload flows on tablet/phone.

## Shell architecture (CONFIRMED)

```
OperatorShell
├── OperatorHandoverRefreshBridge / DeepLinkBridge / ConnectivityBanner
├── OperatorHeader
├── <main> max-w-lg (md: wider) + safe-area bottom padding
├── OperatorBottomNav (5 tabs)
└── OperatorActionSheets (stacked flows)
```

- **Desktop gate:** `OperatorDesktopOnlyNotice` when `useIsOperatorDevice()` false.
- **Theme:** observes `.dark` on `document.documentElement` (no separate theme store).

## Navigation (CONFIRMED)

| Tab | View |
|-----|------|
| today | `OperatorTodayView` |
| scan | `OperatorScanView` |
| vehicles | `OperatorVehiclesView` |
| tasks | `OperatorTasksView` |
| more | `OperatorMoreView` |

## Touch & interaction (CONFIRMED)

| Pattern | Implementation |
|---------|----------------|
| Cards | `OperatorGlassCard` — `surface-frosted` chrome vs `surface-premium` content |
| Press | `sq-press` + `active:scale-[0.99]` on interactive cards |
| Sheets | `OperatorBookingDetailSheet`, handover/damage flows, bottom nav safe inset |
| Status | `OperatorStatusChip` + patterns status utils (partial) |

## Shared dependencies (CONFIRMED)

Imports from `../components/ui`, `../components/patterns` (limited set), `../rental/FleetContext` for vehicle data.

**Does not use:** Master `PageContainer`, Rental Sidebar, desktop `AppShell` layout.

## Operator-specific UX rules

- Optimize for **one-hand** and **thumb zone** (bottom nav, sheets).
- Prefer **full-width cards** over multi-column Master tables.
- Avoid map L3 liquid on non-map operator surfaces (use L0/L1).

## Open gaps (UNKNOWN)

- Field testing matrix per device classes
- Production operator usage analytics