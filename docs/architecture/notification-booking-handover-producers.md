# Notification Engine — Booking Pickup & Return Producers (W2 / Prompt 13)

**Datum:** 2026-07-26  
**Branch:** `remediation/notification-engine-production-readiness-2026-07`  
**Wave:** W2 (Booking & Overdue)  
**Basis:** `docs/audits/notification-producer-migration-matrix-2026-07.md`

## Migrierte Ereignisse

| Eventtyp | Quelle | Entity | occurredAt | Recovery |
|----------|--------|--------|------------|----------|
| `PICKUP_OVERDUE` | `PickupOverdueDetector` → `syncBookingHandoverFromInsights` | BOOKING (`bookingId`) | `scheduledStartAt` / `pickupAt` | Pickup abgeschlossen, Storno, außerhalb Detector → SUCCESS sweep |
| `RETURN_OVERDUE` | `syncReturnOverdueNotifications` (ACTIVE booking query) | BOOKING | `endDate` (0 min Grace) | Return-Protokoll / nicht mehr ACTIVE → SUCCESS sweep |
| `TIGHT_HANDOVER` | `TightHandoverDetector` → `syncBookingHandoverFromInsights` | BOOKING (next booking) | `nextPickupAt` | Gap ≥ Buffer oder Buchung weg → SUCCESS sweep |
| `RETURN_NEEDS_INSPECTION` | `ReturnNeedsInspectionDetector` → `syncBookingHandoverFromInsights` | BOOKING | `returnAt` | Nicht mehr im Detector-Set → SUCCESS sweep |

**Legal booking (bereits kanonisch):** `LEGAL_BUNDLE_INCOMPLETE`, `LEGAL_DOCUMENT_DELIVERY_FAILED`, `LEGAL_PICKUP_BLOCKED_MISSING_PROOF` via `LegalDocumentOperationalNotificationService`.

**Noch ohne Producer:** `PICKUP_DUE`, `RETURN_DUE`, `HANDOVER_INCOMPLETE`, `DEPOSIT_PROBLEM`, `PAYMENT_FAILED`, Storno/Konflikt-Events (Registry only).

## Dedupe-Regeln

- **Fingerprint:** `org|{eventType}|BOOKING|{bookingId}|{conditionCode}|v{n}`
- **PICKUP_OVERDUE / RETURN_OVERDUE / RETURN_NEEDS_INSPECTION:** `conditionCode` = registry default (`pickup_overdue`, `return_overdue`, `return_inspection`)
- **TIGHT_HANDOVER:** `conditionCode` = `tight_handover:{outgoingBookingId}:{incomingBookingId}`
- **sourceEventId:** insight `dedupeKey` (z. B. `pickup_overdue:{bookingId}`)
- Wiederholte Cron-Läufe → gleiche Fingerprint-Zeile, `occurrenceCount` steigt

## Recovery-Regeln

- Aktive Fingerprints aus aktuellem Lauf; alle offenen BOOKING-Notifications der betroffenen Eventtypen ohne Match → SUCCESS ingest (`cleared: true`)
- `occurredAt` für Resolve ≥ `lastSeenAt` (kein STALE_RECOVERY)
- Return overdue: Query filtert `handoverProtocols: none RETURN` und `status: ACTIVE`

## Entity-Verknüpfung

- `entityId` = `bookingId` (primär)
- `actionTarget.bookingId` + `actionTarget.vehicleId` (ergänzend)
- `customerId` nur in Adapter-Metadaten/Metriken, nicht als Notification-Entity

## V1-Cutover

Bei `NOTIFICATIONS_V2=true` werden `PICKUP_OVERDUE`, `TIGHT_HANDOVER`, `RETURN_NEEDS_INSPECTION` nicht mehr in `dashboard_insights` publiziert (`V2_CANONICAL_INSIGHT_TYPES`).

## Tests

`notification-booking-handover-producers.spec.ts` — Cron-Dedupe, Severity-Eskalation, Resolve, zwei Buchungen/Fahrzeug, Org-Trennung, RETURN_OVERDUE, TIGHT_HANDOVER condition key.
