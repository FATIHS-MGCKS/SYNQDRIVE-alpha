# Booking Permission Matrix

**Prompt:** 2 von 34 (Booking Production-Readiness)  
**Datum:** 2026-07-23  
**Repository:** `SYNQDRIVE-alpha`

---

## 1. Architektur

Booking-Berechtigungen folgen dem etablierten SynqDrive-IAM-Muster (Tasks, Payments, Legal Documents):

| Schicht | Datei | Rolle |
|---------|-------|-------|
| **Aktions-Codes** | `backend/src/modules/bookings/booking-permission.constants.ts` | Kanonische `booking.*` Actions + stabile Audit-Codes |
| **Modul-Mapping** | dieselbe Datei | Action → `{ module, read\|write\|manage }` |
| **Rollen-Defaults** | `backend/src/modules/bookings/booking-permission.defaults.ts` | Template-Helper pro Rolle |
| **Org-Templates** | `backend/src/modules/users/defaults/organization-role.defaults.ts` | System-Rollen mit Booking-Submodulen |
| **Service** | `backend/src/modules/bookings/booking-permission.service.ts` | `assert()` / `hasAction()` |
| **Decorator** | `backend/src/modules/bookings/decorators/require-booking-permission.decorator.ts` | `@RequireBookingPermission('booking.read')` |
| **Registry** | `backend/src/shared/auth/operational-permission.registry.ts` | Zentrale Action-Liste |
| **Backfill** | `backend/scripts/ops/backfill-booking-permissions.ts` | Bestehende Orgs migrieren |

**Wichtig:** Mitgliedschaft allein reicht nicht — jede Aktion erfordert explizite Modul-Flags im `permissions`-JSON (außer `MASTER_ADMIN` / `ORG_ADMIN`-Bypass im Guard).

---

## 2. Permission-Module

| Modul-Key | Zweck | Typische Actions |
|-----------|-------|------------------|
| `bookings` | Kern-Lifecycle | read, create, update, cancel, confirm, mark_no_show, complete, override |
| `bookings-sensitive` | PII, Risiko, Signaturen | read_sensitive, signature.read |
| `bookings-schedule` | Datums-/Zeitfenster-Änderungen | update_schedule |
| `bookings-customer` | Kundenwechsel | update_customer |
| `bookings-vehicle` | Fahrzeugwechsel | update_vehicle |
| `bookings-finance` | Preise, Rechnungen, Zahlungen | finance.read, finance.manage |
| `bookings-documents` | Buchungs-Dokumentenbundle | documents.read, documents.manage |
| `bookings-handover` | Pickup/Return-Protokolle | handover.read, handover.perform |
| `bookings-audit` | Audit-Trail, Activity Log | audit.read |

---

## 3. Action → Modul-Mapping

| Action | Modul | Level | Audit-Code |
|--------|-------|-------|------------|
| `booking.read` | `bookings` | read | `BOOKING_READ` |
| `booking.read_sensitive` | `bookings-sensitive` | read | `BOOKING_READ_SENSITIVE` |
| `booking.create` | `bookings` | write | `BOOKING_CREATE` |
| `booking.update` | `bookings` | write | `BOOKING_UPDATE` |
| `booking.update_schedule` | `bookings-schedule` | write | `BOOKING_UPDATE_SCHEDULE` |
| `booking.update_customer` | `bookings-customer` | write | `BOOKING_UPDATE_CUSTOMER` |
| `booking.update_vehicle` | `bookings-vehicle` | write | `BOOKING_UPDATE_VEHICLE` |
| `booking.cancel` | `bookings` | write | `BOOKING_CANCEL` |
| `booking.confirm` | `bookings` | write | `BOOKING_CONFIRM` |
| `booking.mark_no_show` | `bookings` | write | `BOOKING_MARK_NO_SHOW` |
| `booking.complete` | `bookings` | manage | `BOOKING_COMPLETE` |
| `booking.override` | `bookings` | manage | `BOOKING_OVERRIDE` |
| `booking.finance.read` | `bookings-finance` | read | `BOOKING_FINANCE_READ` |
| `booking.finance.manage` | `bookings-finance` | write | `BOOKING_FINANCE_MANAGE` |
| `booking.documents.read` | `bookings-documents` | read | `BOOKING_DOCUMENTS_READ` |
| `booking.documents.manage` | `bookings-documents` | write | `BOOKING_DOCUMENTS_MANAGE` |
| `booking.handover.read` | `bookings-handover` | read | `BOOKING_HANDOVER_READ` |
| `booking.handover.perform` | `bookings-handover` | write | `BOOKING_HANDOVER_PERFORM` |
| `booking.signature.read` | `bookings-sensitive` | read | `BOOKING_SIGNATURE_READ` |
| `booking.audit.read` | `bookings-audit` | read | `BOOKING_AUDIT_READ` |

---

## 4. Standard-Rollenzuordnung

### 4.1 Plattform-Rollen

| Rolle | Verhalten |
|-------|-----------|
| **Master Admin** | Bypass via `PermissionsGuard` — alle Actions |
| **Org Admin** | Bypass via `PermissionsGuard` — alle Actions innerhalb des Mandanten |

### 4.2 Organisations-Rollen (System-Templates)

| Template | `membershipRole` | Booking-Profil |
|----------|------------------|----------------|
| `org_admin` | ORG_ADMIN | Vollzugriff (alle Submodule) |
| `sub_admin` | SUB_ADMIN | Operativ voll, kein complete/override |
| `disposition` | SUB_ADMIN | Create/Update/Schedule/Customer/Vehicle, kein Sensitive/Handover-Perform |
| `accounting` | SUB_ADMIN | Read + Finance manage + Audit |
| `station_manager` | SUB_ADMIN | Operativ + Handover perform + Documents manage |
| `employee` | WORKER | Nur `booking.read` |
| `driver` | DRIVER | `booking.read` + `handover.read` — **kein** Sensitive/Finance/Signature |
| `field_agent` | WORKER | Read + Handover perform + Documents read |
| `service` | WORKER | Kein Booking-Zugriff |
| `read_only` | WORKER | Read + Finance/Documents/Audit read |

### 4.3 Customer (extern)

**Kein** `MembershipRole.CUSTOMER` im IAM-System. Endkunden sind keine Org-Mitglieder und erhalten keine `booking.*`-Permissions über Membership-JSON. Kundenportal-Zugriff (falls vorhanden) läuft über separate Auth — außerhalb dieses Modells.

---

## 5. Least-Privilege-Regeln

1. **Driver:** Kein `bookings.write`, kein `bookings-sensitive`, kein `bookings-finance`, kein `bookings-documents` — nur operative Sicht + Handover-Read.
2. **Worker (employee):** Nur Listen-/Detail-Read ohne Sensitive/Finance.
3. **Field Agent:** Handover perform + Documents read, aber keine Buchungserstellung oder Finanzdaten.
4. **Disposition:** Buchungsoperationen ohne Sensitive/Complete/Override/Audit.
5. **Accounting:** Finanz-Fokus, keine Handover-Perform oder Create.
6. **Sensitive/Finance/Signature** sind immer separate Module — nie implizit durch `bookings.read`.

---

## 6. Migration & Backfill

### Neue Organisationen

`OrganizationRoleService.ensureDefaultRoles()` lädt aktualisierte Templates aus `organization-role.defaults.ts` automatisch.

### Bestehende Organisationen

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-booking-permissions.ts
```

Das Script merged Template-Defaults in alle `organization_roles` mit `isSystemTemplate = true`. Bestehende Custom-Rollen bleiben unberührt.

**Breaking-Change-Mitigation:**

- Driver-Rolle verliert `bookings.write` (war fälschlich zu weit) → sicherer Default
- Bestehende `bookings.read/write/manage` auf Custom-Rollen bleiben erhalten, neue Submodule werden aus Template ergänzt

---

## 7. HTTP-Endpunkt-Zuordnung (geplant Prompt 3)

| Endpunkt | Geplante Permission |
|----------|---------------------|
| `GET /bookings` | `booking.read` |
| `GET /bookings/:id` | `booking.read` |
| `GET /bookings/:id/detail` | `booking.read` + `booking.read_sensitive` (für PII-Tabs) |
| `POST /bookings` | `booking.create` |
| `PATCH /bookings/:id` | `booking.update` (+ schedule/customer/vehicle je nach Feld) |
| `DELETE /bookings/:id` | `booking.cancel` |
| `POST /bookings/:id/no-show` | `booking.mark_no_show` |
| `POST /bookings/wizard-draft/:id/confirm` | `booking.confirm` |
| `POST /bookings/:id/handover/pickup` | `booking.handover.perform` |
| `POST /bookings/:id/handover/return` | `booking.handover.perform` + `booking.complete` |
| Payment/Document-Subroutes | `booking.finance.*` / `booking.documents.*` |

*Controller-Enforcement folgt in Prompt 3 — dieses Prompt liefert nur das kanonische Modell.*

---

## 8. Tests

| Datei | Abdeckung |
|-------|-----------|
| `booking-permission.defaults.spec.ts` | Default-Helper, Driver/Field-Agent Least-Privilege |
| `booking-permission.matrix.spec.ts` | Alle System-Templates × Kern-Actions |
| `operational-permission.registry.spec.ts` | Registry enthält alle `booking.*` Actions |

```bash
cd backend && npm test -- --testPathPattern='booking-permission|operational-permission.registry'
```

---

## 9. Verwandte Dokumentation

- `docs/audits/booking-remediation-baseline-2026-07.md` — Ist-Zustand Prompt 1
- `architecture/IAM_EFFECTIVE_ACCESS_ENGINE_2026-07-21.md` — Effective-Access-Engine
- `architecture/LEGAL_DOCUMENT_PERMISSIONS_2026-07-22.md` — Referenz-Implementierung
