# Master Admin Billing — Post-Remediation Report (UI-6.3)

**Datum:** 2026-08-18  
**Phase:** UI-6.3 Implementierung  
**Basis:** `master-admin-billing-deep-audit.md`, `master-admin-canonical-billing-blueprint.md`

---

## 1. Vorher / Nachher

| Dimension | Vorher (Audit) | Nachher (UI-6.3) |
|-----------|----------------|-------------------|
| Billing IA | 6 Bereiche inkl. redundanter Payment-/Sync-Tabs | 6 kanonische Bereiche: Übersicht, Verträge, Rechnungen, Tarife, Abgleich, Audit |
| Subscription List | Voll-Load `organizations`, Prisma-Status, Wide Table 1280px | Server operational API, Domain-Status, Attention, Mobile Cards |
| Subscription Detail | Drawer-only, gemischte Status | Full-Page Detail + Vertragsaktionen-Drawer |
| Source of Truth | UI leitete Attention/Status teilweise client-seitig | Backend `BillingAttentionSummary`, Domain Lifecycle |
| Reconciliation | Org-ID in Tabelle, rohe Drift-Typen | Angereicherte Drifts mit Org-Name, Lokal/Stripe-Werten |
| Overview | MRR-Vanity ohne Kontext, 12er Client-Attention | Ops Health Chip, 6 KPIs, server Attention Queue |

---

## 2. Billing IA

- Navigation: `overview` | `subscriptions` | `invoices` | `pricing` | `reconciliation` | `audit`
- Legacy-Deep-Links: `organizations` → `subscriptions`, `invoices-payments` → `invoices`, `system-sync` → `reconciliation`
- URL: `subscriptionId` für Vertragsdetail (ersetzt `orgId` in Billing-Kontext)
- Entfernt als Top-Level: Zahlungsmethoden, Payment Attempts, Refunds, Credit Notes, Resend/Outbox in Billing-Nav

---

## 3. Subscription List

- Endpoint: `GET /admin/billing/subscriptions/operational`
- Spalten: Aufmerksamkeit, Organisation, Vertragsstatus, Abrechnung, Plan, Testphase, Verlängerung, Actions
- Filter + Sort + Pagination serverseitig (enriched filter nach Attention/Billing Health)
- URL-State: `billingSearch`, `billingPage`, `billingDomainStatus`, `billingHealth`, `billingAttention`, …
- Mobile: Card-Liste ohne Pflicht-Wide-Table

---

## 4. Subscription Detail

- Endpoint: `GET /admin/billing/subscriptions/operational/:organizationId`
- Sektionen: Identity Hero, Lifecycle, Abrechnungsgesundheit, Kommerziell, Technisch (collapsed)
- Orthogonale Chips: Lifecycle / Billing Health / Reconciliation
- Vertragsaktionen über bestehenden `BillingOrgDetailDrawer` + `MasterSubscriptionController` (keine neue Mutation-Wahrheit)

---

## 5. Statusmodell

- Zentrale Chips: `BillingStatusChips.tsx` (Attention, Domain, Billing Health, Reconciliation)
- Domain-Status ausschließlich via `resolveSubscriptionDomainStatus` (Backend)
- Kein Prisma `subscription.status` in Master-Billing-UI

---

## 6. Trials

- Kanonisches `BillingTrialDto`: source (`SYNQDRIVE` | `STRIPE`), `conversionState`, `daysRemaining`
- Keine Frontend-only Trial-Verlängerung

---

## 7. Plans & Pricing

- Unveränderte `BillingPricingTab` — Preview/Publish-Flows bleiben backend-gesteuert
- Header-Action „Neuer Preisstand“ (statt irreführender Export/Staffel-Buttons)

---

## 8. Invoices

- Eigener Bereich `invoices` ohne Payment-Sub-Tabs
- Bestehende `BillingInvoicesTab` + Drawer beibehalten
- Payment-Kontext im Invoice Detail (bestehend)

---

## 9. Reconciliation

- `GET /admin/billing/reconciliation/drifts/operational` — angereicherte Zeilen
- UI: Organisation-Name, Lokal/Stripe-Werte, Severity, Auto-Fix/Gelöst
- Sub-Tabs: Abweichungen | Plattform-Sync | Webhooks

---

## 10. Privileged Actions

- Bestehend: MFA + Idempotency + `MasterSubscriptionController`
- Detail: „Vertragsaktionen“ öffnet Drawer mit Preview/Confirm/Reason-Pattern
- Kein optimistisches Stripe-Endstatus nach HTTP 200

---

## 11. Source-of-Truth Validation

| Daten | Source |
|-------|--------|
| Lifecycle | Domain `subscription-lifecycle.ts` |
| Attention | `billing-attention.util.ts` (server) |
| Billing Health | Abgeleitet aus Attention |
| Reconciliation | `billingReconciliationDrift` + Sync-Status |
| Mutations | `BillingSubscriptionAdminService` / Stripe via Webhooks |

---

## 12. Responsive

- Subscription List: Desktop DataTable + Mobile Cards
- Reconciliation: Desktop Table + Mobile Cards
- Overview: KPI-Grid 2/3/6 Spalten

---

## 13. Accessibility

- `aria-label` auf Such- und Filter-Controls
- Status über Text+Chip-Tone (nicht nur Farbe)
- Keyboard: Tab-Navigation über `MasterPageTabs`

---

## 14. Security

- Routes: `MASTER_ADMIN` + bestehende `MasterBillingGuard` / MFA auf Mutationen
- Keine Stripe Secrets im Frontend
- Operational Endpoints read-only (MASTER_ADMIN)

---

## 15. Performance

- Overview: paralleler Fetch Overview + Attention Queue
- Subscription List: Pagination statt Full-Org-Load für Billing-Liste
- Hinweis: Operational List enriched noch in-memory nach Org-Fetch — DB-Pagination bei Skalierung nachziehen

---

## 16. Regression

- ✅ `billing-control-center.test.ts` (6 Tests)
- ✅ `master-billing-navigation.test.ts` (9 Tests)
- ✅ `billing-attention.util.spec.ts` (4 Tests)
- ✅ Frontend `npm run build`
- ✅ Org Detail → Billing Handoff (`subscriptionId` URL)
- ⚠️ Manuelle Acceptance-Szenarien (Stripe Test) — nicht in Cloud Agent ausgeführt

---

## 17. Verbleibende Findings

1. Operational subscription list: enriched filters noch nach In-Memory-Compose — echte DB-Pagination für Attention-Filter bei >500 Orgs
2. Invoice Drawer: hardcoded Stripe TEST-Mode in Alt-Code prüfen (nicht in diesem Diff geändert)
3. Privileged Action Dialog: einheitliches Reason-Feld über alle Mutationen noch nicht extrahiert
4. E2E Acceptance-Matrix (17 Szenarien) — Staging/manuell empfohlen

---

## Scores (0–100)

| Kriterium | Score |
|-----------|-------|
| Billing Clarity | 82 |
| Subscription Clarity | 85 |
| Source-of-Truth Integrity | 88 |
| Invoice UX | 72 |
| Reconciliation UX | 80 |
| Action Safety | 78 |
| Information Hierarchy | 84 |
| Responsive UX | 80 |
| Accessibility | 75 |
| Technical Cleanliness | 82 |
| Production Readiness | 80 |

**Gesamt (gewichtet): ~81/100** (vorher Audit ~49/100)
