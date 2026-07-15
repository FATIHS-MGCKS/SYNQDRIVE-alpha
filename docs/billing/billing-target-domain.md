# Billing Target Domain

**Stand:** Prompt 3/44 — Canonical billing types  
**Bezug:** `docs/billing/billing-current-state.md` (Ist-Zustand)

Dieses Dokument beschreibt die **kanonische Ziel-Domäne** für SynqDrive Platform Billing.  
Implementierung: `backend/src/modules/billing/domain/` (Backend), `frontend/src/lib/billing-domain.ts` (Frontend-Spiegel).

---

## Canonical billing types

### Produktarten (`BillingProductKind`)

| Domain | Bedeutung |
|--------|-----------|
| `RENTAL` | SynqDrive Rental Grundtarif |
| `FLEET` | SynqDrive Fleet Grundtarif |
| `ADDON` | Zusatzmodul (architektonisch vorbereitet) |

**Vorbereitete Add-on-Keys (`BillingAddonKey`):** `VOICE_AGENT`, `AI_PACKAGE`, `WHATSAPP`

### Subscription-Status (`SubscriptionStatus`)

| Domain | Beschreibung |
|--------|--------------|
| `DRAFT` | Noch nicht aktiv/abrechenbar |
| `TRIALING` | Testphase |
| `ACTIVE` | Aktives Abo |
| `PAST_DUE` | Zahlung überfällig |
| `PAUSED` | Stripe-pausiert |
| `CANCEL_SCHEDULED` | Kündigung zum Periodenende (`cancelAtPeriodEnd`) |
| `CANCELLED` | Beendet |
| `INCOMPLETE` | Unvollständig / unbekannter Stripe-Status |

### Abrechnungsintervalle (`BillingIntervalKind`)

| Domain | Legacy Prisma |
|--------|---------------|
| `MONTH` | `BillingInterval.MONTHLY` |
| `YEAR` | *(noch nicht in Prisma — mapped vorläufig auf MONTHLY)* |

### Pricing Models (`PricingModel`)

| Domain | Legacy Prisma `BillingTierMode` |
|--------|----------------------------------|
| `VOLUME` | `VOLUME` |
| `GRADUATED` | `GRADUATED` |
| `FLAT` | *(noch nicht in DB)* |
| `USAGE_BASED` | *(noch nicht in DB)* |

### Rabattarten (`DiscountKind`)

| Domain |
|--------|
| `PERCENTAGE` |
| `FIXED_AMOUNT` |

### Rechnungsstatus (`InvoiceStatusDomain`)

| Domain | Prisma `InvoiceStatus` | Display (`InvoiceDisplayStatus`) |
|--------|------------------------|----------------------------------|
| `DRAFT` | `DRAFT` | `Pending` |
| `OPEN` | `OPEN` | `Pending` / `Overdue` (nach Fälligkeit) |
| `PAID` | `PAID` | `Paid` |
| `VOID` | `VOID` | **`Void` — niemals `Paid`** |
| `UNCOLLECTIBLE` | `UNCOLLECTIBLE` | `Overdue` |

### Zahlungsstatus (`PaymentStatusDomain`)

| Domain | Stripe-Quelle |
|--------|---------------|
| `PENDING` | `processing`, `requires_*` |
| `SUCCEEDED` | `succeeded` |
| `FAILED` | `failed`, `canceled` |
| `REFUNDED` | Charge vollständig refunded |
| `PARTIALLY_REFUNDED` | Charge teilweise refunded |

### Stripe-Modus (`StripeMode`)

| Domain | Quelle |
|--------|--------|
| `TEST` | `livemode === false` |
| `LIVE` | `livemode === true` |

### Sync-Status (`SyncStatus`)

| Domain | Legacy-Strings |
|--------|----------------|
| `PENDING` | `PREPARED`, `NOT_CONNECTED` |
| `SYNCED` | `SYNCED` |
| `FAILED` | `FAILED` |
| `DRIFTED` | `DRIFTED` |

---

## Mapping-Richtung

```
Stripe API strings  →  Domain types  →  Prisma persistence (legacy)
                         ↓
                    Display / API DTOs
```

**Regeln:**

1. Stripe-Status **niemals** ungeprüft als Domain- oder Display-Status verwenden.
2. Unbekannte externe Werte → sicherer Fallback + `BillingDomain` Logger-Warnung.
3. Eine Mapping-Implementierung pro Richtung — keine verteilten Switches.

### Zentrale Mapping-Dateien

| Datei | Verantwortung |
|-------|---------------|
| `domain/mappers/stripe-subscription-status.mapper.ts` | Stripe Subscription → `SubscriptionStatus` → Prisma `BillingStatus` |
| `domain/mappers/stripe-invoice-status.mapper.ts` | Stripe Invoice → `InvoiceStatusDomain` → Prisma `InvoiceStatus` |
| `domain/mappers/stripe-payment-status.mapper.ts` | PaymentIntent/Charge → `PaymentStatusDomain` |
| `domain/mappers/billing-legacy.mappers.ts` | Produkt, Intervall, Pricing, Rabatt, Sync, **Invoice Display** |

### Kompatibilitätsschicht

`stripe-status.mapper.ts` re-exportiert aus Domain-Mappern (deprecated Pfad für inkrementelle Migration).

---

## Legacy-Werte und noch nicht migrierte Felder

| Legacy | Status | Ziel-Prompt |
|--------|--------|-------------|
| Prisma `BillingStatus` (4 Werte) | Domain ist reicher; Mapper `mapSubscriptionDomainToPrismaBillingStatus` | Prompt 10 |
| Prisma `BillingInterval` nur `MONTHLY` | `YEAR` vorbereitet | Prompt 10 |
| Prisma `BillingTierMode` ohne FLAT/USAGE_BASED | Domain-Enums vorhanden | Prompt 10 |
| `ProductSlug.TAXI` | Mapped zu `RENTAL` product kind | Produkt-Split TBD |
| `BillingSubscription.priceVersionId` | Ignoriert bei Preisauflösung | Prompt 10 |
| Kein `BillingPayment` Modell | Payment domain nur in Mappern | Prompt 25 |
| Refunds nicht lokal persistiert | `PaymentStatusDomain.REFUNDED` vorbereitet | Prompt 25 |
| Mirror-Lines ohne `usageSnapshotId` | — | Prompt 25 |
| SaaS-Billing ohne Resend | — | Prompt 30+ |
| `displayStatus` als freier String in API | Jetzt kanonisch über `InvoiceDisplayStatus` | Prompt 25 (API-Typen) |

### Prompt-3-Korrektur: VOID ≠ PAID

Die zentrale Display-Map `mapInvoiceDomainToDisplayStatus` mappt `VOID` → `Void`.  
`BillingService` nutzt diese Map seit Prompt 3. **Legacy-Stelle behoben.**

Verbleibend für Prompt 25: vollständige Invoice-Domain-Persistenz, Refunds, Usage-Snapshot-Verknüpfung.

---

## Tests

`backend/src/modules/billing/domain/billing-domain.mappers.spec.ts`  
`frontend/src/lib/billing-domain.test.ts`

Ausführung Backend: `cd backend && npm test -- --testPathPattern=billing`
