# Notification Engine — ActionQueue Decouple (Prompt 16)

**Datum:** 2026-07-26

## Ziel

ActionQueue darf keine zweite Notification Engine sein. Operative Arbeitslisten, Tasks und Notifications haben getrennte Lifecycles.

## Klassifikation ActionQueue-Funktionen

| Funktion | Klasse | Quelle nach Cutover |
|----------|--------|---------------------|
| V2 API Meldungen | **Notification** | `notificationInbox` ← GET /notifications |
| Pickup/Return Handover-Tiles | **Operative Arbeitsliste** | `operationalWorkQueue` |
| DashboardInsights / BI | **Analytics** | dashboard-insights API (nicht Inbox) |
| Derived / predictive client cards | **Legacy** | bridges off → Producer |
| Insight→Task Materialization | **Task** | OrgTask + optional `metadata.notificationId` |
| Workflow notification.prepare | **Workflow Action** | OrgTask draft, nicht Inbox |

## Entfernte Doppelzustände

| Doppelzustand | Maßnahme |
|---------------|----------|
| `actionQueue` = Notifications + Handover + Insights | Split: `notificationInbox` vs `operationalWorkQueue` |
| Acknowledge setzte `status: ACKNOWLEDGED` optimistisch | Nur `userReceipt.acknowledgedAt` patchen |
| Snooze setzte org `SNOOZED` optimistisch | Nur `userReceipt.snoozedUntil` |
| Lifecycle aus org status allein | `mapNotificationLifecycleFromApi` (+ receipt) |
| Task complete → implizite Notification resolve | Registry-gated `NotificationTaskLinkService` |

## Neue Referenzen

| Referenz | Ort |
|----------|-----|
| `metadata.notificationId` | OrgTask (optional) |
| `metadata.notificationTaskDedupKey` | OrgTask prefill / dedup |
| `notification:task:{uuid}` | `dedupKey` für einmalige Task-Erzeugung |
| `notificationInbox` | DashboardViewModel → NotificationPanel |
| `operationalWorkQueue` | Handover-only ActionQueue wenn decoupled |

## Feature Flags

| Flag | Default | Bedeutung |
|------|---------|-----------|
| `VITE_ACTION_QUEUE_DECOUPLED` | `off` | FE: Inbox/Work-Queue Split |
| `ACTION_QUEUE_DECOUPLED` | `false` | BE: Task→Notification resolve registry aktiv |

**Rollback:** beide Flags auf `off`/`false`.

**Prod-Ziel (mit Prompt 15):** `NOTIFICATIONS_V2=true`, `VITE_NOTIFICATIONS_V2=on`, `VITE_ACTION_QUEUE_DECOUPLED=on`, `ACTION_QUEUE_DECOUPLED=true`, bridges off.

## Registry-Regeln (Auszug)

- Vehicle health / driving / technical observation: Task erlaubt, **kein** auto-resolve bei Task DONE
- Document intake review: Task erlaubt, resolve bei Task DONE erlaubt

## Tests

- `action-queue-decouple.test.ts` — lifecycle, inbox/work split, dedup
- `notification-task-link.service.spec.ts` — registry resolve gate
- `notifications-v2-cutover.test.ts` — weiterhin grün
