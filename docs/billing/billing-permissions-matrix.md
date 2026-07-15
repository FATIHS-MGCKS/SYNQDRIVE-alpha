# Billing — Permissions Matrix

**Stand:** Prompt 42/44 · `billing: prompt 42 billing permissions hardening`  
**Scope:** Tenant SaaS-Billing, Kundenfinanzen (Rechnungen/Zahlungen), Master-Billing

---

## Grundsätze

1. **Zwei getrennte Geldflüsse** — SynqDrive-SaaS (`billing`) vs. Endkundenfinanzen (`invoices`, `payments-*`).
2. **Backend erzwingt** — UI-Gates sind nur Komfort; jeder API-Aufruf läuft durch Guards.
3. **Organisationsgrenzen** — Tenant-JWT darf keine fremde `orgId` abfragen (`resolveOrgScope`, `OrgScopingGuard`).
4. **Master getrennt** — Plattform-Endpunkte unter `/admin/billing/*` sind nicht über Tenant-Rollen erreichbar.
5. **Endkunden (Customer)** haben **keine** `OrganizationMembership` und damit keinen Zugriff auf interne Billing-APIs.

---

## Tenant-Permissions (Vermieter)

| Fähigkeit | Modul | Level | Typische API |
|-----------|-------|-------|--------------|
| SynqDrive-Abo lesen | `billing` | `read` | `GET /billing/subscription/overview` |
| SynqDrive-Rechnungen lesen | `billing` | `read` | `GET /billing/invoices` |
| Zahlungsmethode lesen | `billing` | `read` | `GET /billing/payment-methods` |
| Zahlungsmethode verwalten | `billing` | `write` | `POST /billing/payment-methods/.../set-default` |
| Customer Portal öffnen | `billing` | `write` | `POST /billing/stripe/customer-portal` |
| Kundenrechnungen lesen | `invoices` | `read` | `GET /organizations/:orgId/invoices/list` |
| Kundenrechnungen verwalten | `invoices` | `write` | `POST /organizations/:orgId/invoices` |
| Kundenzahlungen verwalten | `payments` | `write` | Booking-/Org-Payment-Requests |
| Stripe Connect verwalten | `payments-connect` | `manage` | `POST /organizations/:orgId/payments/connect/onboard` |
| Stripe Connect Status lesen | `payments-connect` | `read` | `GET /organizations/:orgId/payments/connect/status` |
| Erstattungen | `payments-refund` | `write` | Refund-Endpunkte (Service-Layer) |

**Guard-Stack Tenant SaaS:** `RolesGuard` → `PermissionsGuard` → `resolveOrgScope()`  
**Guard-Stack Kundenrechnungen:** `OrgScopingGuard` → `RolesGuard` → `PermissionsGuard`  
**Guard-Stack Connect:** `OrgScopingGuard` → `PaymentsFeatureGuard` → `PaymentsPermissionGuard`

---

## Rollenmatrix (Default-Templates)

Legende: ✅ erlaubt · ❌ verweigert · ⚠️ nur mit explizitem Override

| Rolle | SaaS-Abo lesen | SaaS-Rechnungen | Zahlungsmethode lesen | Zahlungsmethode/Portal | Kundenrechnungen lesen | Kundenrechnungen schreiben | Kundenzahlungen | Stripe Connect |
|-------|----------------|-----------------|----------------------|------------------------|------------------------|---------------------------|-----------------|----------------|
| **Org Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ manage |
| **Sub Admin** (Default) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Sub Admin** + `billing.write` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Accounting** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | read only |
| **Worker** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | read only | ❌ |
| **Driver** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Customer** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Regeln pro Rolle

- **Org Admin:** Vollzugriff auf Mandantenmodule inkl. SaaS-Billing und Zahlungsmodule. `PermissionsGuard` bypass für `ORG_ADMIN`-Membership (DB-geprüft).
- **Sub Admin:** Standard nur `billing.read`; Schreibzugriff auf SaaS-Zahlungsmethoden/Portal **nur** bei explizitem `billing.write`.
- **Worker/Driver:** Kein SaaS-Billing. Worker sieht ggf. Zahlungsstatus (`payments.read`), aber keine Connect-Verwaltung.
- **Customer:** Kein interner API-Zugriff — keine Org-Membership.

---

## Master-Permissions (Plattform)

| Fähigkeit | Schutz | Typische API |
|-----------|--------|--------------|
| Verträge lesen/verwalten | `MASTER_ADMIN` + `master-billing` | `/admin/billing/organizations/:orgId/subscription/*` |
| Preise verwalten | `MASTER_ADMIN` | `/admin/billing/pricebooks/*` |
| Rabatte simulieren/verwalten | `MASTER_ADMIN` | `POST /admin/billing/price-versions/:id/simulate` |
| SaaS-Rechnungen lesen | `MASTER_ADMIN` | `GET /admin/billing/invoices` |
| Manuelle Zahlung | `MASTER_ADMIN` + `master-billing` | `POST /admin/billing/invoices/:id/manual-payments` |
| Systemstatus / Stripe | `MASTER_ADMIN` | `GET /admin/billing/stripe-status` |
| Webhook Retry | `MASTER_ADMIN` (Outbox/Resend-Module) | Master Resend-/Webhook-Tabs |
| E-Mail Retry | `MASTER_ADMIN` | Billing-E-Mail-Delivery Admin |
| Reconciliation | `MASTER_ADMIN` + `master-billing` | `POST /admin/billing/reconciliation/run` |

**Lesende Master-Routen:** `@Roles('MASTER_ADMIN')`  
**Sensible Mutationen:** zusätzlich `@RequireMasterBilling()` + `MasterBillingGuard`  
**Delegierte Plattform-Operatoren:** JWT `platformPermissions: ['master-billing']` ohne `MASTER_ADMIN`-Rolle

Tenant-`ORG_ADMIN` hat **keinen** Zugriff auf Master-Endpunkte.

---

## Organisationsgrenzen

| Angriff | Schutz | Ergebnis |
|---------|--------|----------|
| Tenant ruft `?orgId=fremd` auf `/billing/*` | `resolveOrgScope` / `resolvePermissionOrgId` | `403 Forbidden` |
| Tenant ruft `/organizations/fremd/invoices` auf | `OrgScopingGuard` | `403 Forbidden` |
| MASTER_ADMIN ohne `orgId` | `resolveOrgScope` | `404 orgId required` |
| Service lädt fremde SaaS-Rechnung | `requireOrganizationInvoice()` | `404 Not Found` |

---

## UI vs. API (Hidden-Button-Angriff)

| Szenario | UI | API |
|----------|----|-----|
| Worker öffnet SynqDrive-Abo | Tab ausgeblendet (`billing.read`) | `403` via `PermissionsGuard` |
| Sub Admin öffnet Customer Portal | Button disabled (`billing.write`) | `403` auf `POST …/customer-portal` |
| Accounting öffnet SaaS-Rechnungen | Nicht in Verwaltung → Abo | `403` auf `GET /billing/invoices` |
| Driver listet Kundenrechnungen | Sidebar ohne Finanz-Rechte | `403` auf `GET …/invoices/list` |
| Manipulierter Fetch trotz fehlendem Button | — | Guard lehnt vor Service-Layer ab |

**Wichtig:** Frontend `hasPermission()` basiert auf JWT; Backend prüft immer die aktuelle `OrganizationMembership` in der Datenbank.

---

## Test-Inventar

| Datei | Abdeckung |
|-------|-----------|
| `billing.permissions.matrix.spec.ts` | Rollenmatrix, API-Bypass, Org-Spoofing, Master-Operator |
| `billing.permissions.characterization.spec.ts` | `PermissionsGuard` + `billing.read`/`write` |
| `billing.controller.security.characterization.spec.ts` | Controller-Metadaten, Org-Isolation, Master-Mutationen |
| `invoices.permissions.characterization.spec.ts` | `invoices.read`/`write` auf allen Routen |
| `payment-permission.defaults.spec.ts` | Payment-Module × Rollen-Templates |
| `master-billing.guard.spec.ts` | Plattform-Permission `master-billing` |
| `payments-access.service.spec.ts` | Feature-Flag, Cross-Org, ORG_ADMIN-Bypass |
| `frontend/.../finance-navigation.test.ts` | Sidebar-Gates `payments-connect.read` |

Ausführen:

```bash
cd backend && npm test -- billing.permissions.matrix invoices.permissions.characterization billing.controller.security
```

---

## Implementierungsreferenzen

- Permission-Keys: `backend/src/shared/auth/permission.constants.ts`
- Rollen-Templates: `backend/src/modules/users/defaults/organization-role.defaults.ts`
- Tenant Billing Controller: `backend/src/modules/billing/billing.controller.ts`
- Kundenrechnungen: `backend/src/modules/invoices/invoices.controller.ts`
- Connect: `backend/src/modules/payments/payments-connect.controller.ts`
- UI-Module: `frontend/src/rental/components/users-roles/constants.ts`
