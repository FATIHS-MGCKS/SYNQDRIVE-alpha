# Notification Engine — Permissions, Receipts & Preferences

Version: **V4.9.357**  
Companion: `docs/notification-engine-api.md`

## 1. Rollenmatrix

Rollen stammen aus `MembershipRole` + Plattformrolle `MASTER_ADMIN`.  
**Customer** existiert nicht als `MembershipRole` — externe Kunden haben keinen Zugriff auf die Notification API.

| Rolle | API | Station-Scope | Event-Sichtbarkeit | Resolve | Archive | Datenschutz |
|-------|-----|---------------|-------------------|---------|---------|-------------|
| **MASTER_ADMIN** | ✓ | Nein (Bypass) | Alle Registry-Events | ✓ | ✓ | Voll |
| **ORG_ADMIN** | ✓ | Nein (`ALL`/leer) | OPS + Security-Admin-Events | ✓ | ✓ | Voll |
| **SUB_ADMIN** | ✓ | Ja wenn gesetzt | OPS + Security-Admin | ✓ | ✓ | Voll |
| **WORKER** | ✓ | Ja wenn gesetzt | OPS-Events | ✓ (techn.) | ✗ | Billing/Org redacted |
| **DRIVER** | ✓ | Nein | Registry-Subset (Bookings/Handovers) | ✗ | ✗ | Keine Billing-Params |
| **CUSTOMER** | ✗ | — | — | — | — | — |

Quelle: `registry/notification-event-registry.definitions.ts` → `supportedRoles` pro `eventType`.  
Matrix-Export: `access/notification-access.matrix.ts`.

### Domain-Zuordnung (Beispiele)

| Domain | Typische Rollen |
|--------|------------------|
| OPERATIONS | ORG_ADMIN, SUB_ADMIN, WORKER |
| VEHICLE_HEALTH | OPS |
| HANDOVERS / BOOKINGS | OPS + DRIVER (Subset) |
| BILLING | OPS only |
| SECURITY / SYSTEM (Integration) | ORG_ADMIN, SUB_ADMIN |

---

## 2. Station-Scope-Regeln

Gilt für **SUB_ADMIN** und **WORKER** wenn `membership.stationScope` ≠ `ALL`.

### Sichtbar wenn

1. `entityType=STATION` und `entityId = stationScope`
2. `actionTarget.stationId = stationScope`
3. Fahrzeug gehört zur Station (`homeStationId`, `currentStationId`, `expectedStationId`)
4. Buchung mit `pickupStationId` oder `returnStationId = stationScope`
5. **Org-weite Ausnahme** (siehe unten)

### Org-weite Ausnahmen (trotz Station-Scope)

- `eventType ∈ { INTEGRATION_DISCONNECTED, WEBHOOK_FAILURE }`
- `entityType = ORGANIZATION`
- `domain = SECURITY` + `severity = CRITICAL`

Implementierung: `access/notification-org-wide.policy.ts`, `notification-station-scope.service.ts`.

### Sonderfälle

| Fall | Verhalten |
|------|-----------|
| Fahrzeug wechselt Station | `recheckVehicleStationScope()` prüft **aktuellen** Stand bei Einzelabruf |
| Buchung Pickup ≠ Return | Sichtbar wenn **eine** Station dem Scope entspricht |
| Integration fällt aus | Org-weit für berechtigte Admin-Rollen |
| Compliance / Security CRITICAL | Org-weit, nicht deaktivierbar |

---

## 3. Receipt-Semantik (pro User)

Gespeichert in `notification_receipts`:

| Feld | Bedeutung |
|------|-----------|
| `readAt` | Persönlich gelesen |
| `acknowledgedAt` | Persönlich „gesehen und übernommen“ |
| `snoozedUntil` | Persönlich zurückgestellt bis Zeitpunkt |
| `hiddenAt` | Persönlich ausgeblendet (reserviert) |

### Org-weiter Lifecycle (`notifications.status`)

| Status | Bedeutung |
|--------|-----------|
| `OPEN` | Aktiver Zustand |
| `RESOLVED` | Fachlich erledigt (global für alle) |
| `ARCHIVED` | Administrativ archiviert |
| `ACKNOWLEDGED` / `SNOOZED` (Row) | Nur Producer/System — **nicht** via User-API |

### Regeln

- User A `read` → User B weiterhin unread
- User A `acknowledge` → nur `receipt.acknowledgedAt` von A, **kein** org-weites Status-Update
- Fachlich `resolve` → alle sehen `RESOLVED`
- Kein globaler „Responsible User“ — Assignment bleibt im Task-System

---

## 4. Acknowledge

| Typ | Speicherort | API |
|-----|-------------|-----|
| Persönlich „übernommen“ | `receipt.acknowledgedAt` | `POST .../acknowledge` |
| Global Verantwortung | — | Nicht implementiert (Tasks) |
| Org-Status ACKNOWLEDGED | `notifications.status` | Nur Producer |

`acknowledge` setzt automatisch auch `readAt`.

---

## 5. Snooze

| Aspekt | Regel |
|--------|-------|
| Scope | **Pro User** (`receipt.snoozedUntil`) |
| Org-weites Snooze | Nur wenn Producer `notifications.status=SNOOZED` setzt (selten) |
| Standard-Feed | Ausgeblendet wenn `snoozedUntil > now` |
| Counts | Aus unread/totalActive ausgeschlossen |
| CRITICAL | **Bypass** — kritische Meldungen bleiben in Counts sichtbar |
| Ablauf | Automatisch wieder sichtbar wenn `snoozedUntil` vorbei |
| API | `POST .../snooze` `{ until }`, `POST .../unsnooze` |

---

## 6. Preferences

Modell: `UserNotificationPreference` (pro `userId`, `organizationId`, `category`).

| Feld | Wirkung In-App |
|------|----------------|
| `inApp` | `false` → Kategorie ausgeblendet (außer Pflicht) |
| `criticalOnly` | Nur `CRITICAL` Severity in dieser Kategorie |
| `email` / `push` / `sms` | Für zukünftige Channel-Worker reserviert |
| SECURITY | Account-API erzwingt mindestens `inApp` oder `email` |

### Mapping Event → Preference

`notification-event-registry.definitions.ts` → `preferenceCategory` pro `eventType`.

Beispiel:

| Event | Category |
|-------|----------|
| `STATION_SHORTAGE` | BOOKINGS |
| `TECHNICAL_OBSERVATION_ACTIVE` | DAMAGE_MISUSE |
| `INTEGRATION_DISCONNECTED` | SECURITY |
| `DRIVING_ASSESSMENT_DEVICE_QUALITY` | VEHICLE_HEALTH |

Service: `access/notification-preference.service.ts`  
SQL-Filter: `access/notification-preference.query.ts`

### Quiet Hours / Digest

Noch nicht persistiert — Architektur-Hook in `NotificationPreferenceService` für künftige Zustellkanäle.

---

## 7. Pflichtmeldungen

Nicht vollständig deaktivierbar:

1. **SECURITY**-Kategorie (alle Severities)
2. **CRITICAL** + `deliveryPolicy.criticalOverridesPreferences`
3. Explizite Events: `INTEGRATION_DISCONNECTED`, `WEBHOOK_FAILURE`, `BLOCKED_VEHICLE`

Quelle: `access/notification-mandatory.policy.ts` + bestehende Account-SECURITY-Regel.

---

## 8. Datenschutz

`access/notification-privacy.policy.ts` redacted `templateParams` und `action.target`:

| Rolle | Einschränkung |
|-------|---------------|
| DRIVER | Keine Billing-Params; nur Booking/Handover-Domains voll |
| WORKER | Keine internen Org/Integration-Details; kein Billing |
| SUB_ADMIN / ORG_ADMIN | Voll |

Fremde Stationen → **404** (kein Leak). Fremde Orgs → **404**.

---

## 9. Implementierungskarte

| Modul | Pfad |
|-------|------|
| Access matrix | `access/notification-access.matrix.ts` |
| Station scope | `access/notification-station-scope.service.ts` |
| Org-wide | `access/notification-org-wide.policy.ts` |
| Receipts | `access/notification-receipt.service.ts` |
| Preferences | `access/notification-preference.service.ts` |
| Privacy | `access/notification-privacy.policy.ts` |
| Mandatory | `access/notification-mandatory.policy.ts` |
| API integration | `api/notification-api.service.ts` |

---

## 10. Frontend-Migration

- `acknowledge` / `snooze` wirken nur auf den **eigenen** Receipt
- Badge `unread` ist pro User
- `status=RESOLVED` ist für alle gleich
- Preferences aus `GET/PATCH /account/me/notifications` bleiben gültig
- Pflichtmeldungen erscheinen trotz deaktivierter Kategorie
