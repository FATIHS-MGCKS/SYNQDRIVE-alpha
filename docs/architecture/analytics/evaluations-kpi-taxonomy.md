# Kanonische KPI-Taxonomie — SynqDrive Auswertungen

**Version:** 1.0.0  
**Datum:** 2026-07-24  
**Prompt:** 4/54 — Auswertungen-Professionalisierung  
**Status:** Verbindlich für Backend, Frontend, Exporte und Prognosen (Implementierung folgt in späteren Prompts)

**Basis-Audits:**

- `docs/audits/evaluations/evaluations-technical-inventory-2026-07.md` (Prompt 1)
- `docs/audits/evaluations/evaluations-data-flow-map-2026-07.md` (Prompt 2)
- `docs/audits/evaluations/evaluations-baseline-test-report-2026-07.md` (Prompt 3)

**View-Scope:** Primär `financial-insights` (Finanz-Auswertungen) inkl. eingebettetem `InsightsCockpit`; sekundär Admin-View `data-analyse` (Telemetry/Data Quality). Dashboard-Embeds, die dieselbe Logik nutzen, referenzieren dieselben `metricId`s.

---

## 1. Normative Regeln

1. **Eine Kennzahl = eine `metricId`.** Keine UI-Labels, Prop-Namen oder i18n-Keys als Primärschlüssel.
2. **Jede Aggregation muss Zeitbasis, Währungsfilter und Statusfilter explizit benennen** (siehe Felder je Kennzahl).
3. **Beobachtet ≠ geschätzt ≠ prognostiziert** — siehe Abschnitt 2. Implementierungen dürfen geschätzte Kennzahlen nicht als beobachtete Umsätze ausweisen.
4. **Org-Scope ist Default.** `organizationId` ist immer implizit; `stationId` / `vehicleId` / `customerId` nur wenn explizit unterstützt.
5. **EUR-Filter:** Finanz-Kennzahlen mit `currencyScope: EUR` schließen Rechnungen mit `currency ∉ {EUR, €}` aus, bis Multi-Currency kanonisch definiert ist.
6. **Zeitzone (interim):** Finanz-KPIs nutzen heute **Client-Lokalzeit** für Kalendermonate; Insight-Detectors nutzen **Server-UTC** (`ctx.now`). Bis zur Org-TZ-Policy (Prompt 5+) sind Abweichungen an Monatsgrenzen dokumentiert, nicht „Bug“.
7. **PII:** Kennzahlen mit `mayContainPii: true` dürfen in Exporten nur mit entsprechender Berechtigung und Redaction-Policy erscheinen.

### Kennzahl-Schema (Pflichtfelder)

| Feld | Beschreibung |
|------|----------------|
| `metricId` | Stabile technische ID (`fin.*`, `ins.*`, `da.*`, `fc.*`, `ops.*`) |
| `nameDe` / `nameEn` | Anzeigename |
| `domains` | Mindestens ein Bereich aus der Master-Liste (Abschnitt 3) |
| `description` | Fachliche Definition (was zählt / was nicht) |
| `formula` | Präzise Berechnung in Pseudocode/SQL-ähnlicher Notation |
| `dataSources` | Tabellen, APIs, Services |
| `unit` | `EUR`, `EUR_CENTS`, `percent`, `count`, `minutes`, `days`, `score`, `enum`, `text` |
| `currency` | `EUR` \| `org_reporting` \| `mixed` \| `n/a` |
| `aggregation` | `sum`, `count`, `avg`, `ratio`, `max`, `min`, `last`, `list_top_n`, `status` |
| `period` | `snapshot`, `MTD`, `calendar_month`, `rolling_Nd`, `per_trip`, `per_vehicle`, `per_evaluation_run` |
| `filters` | Unterstützte Dimensionen |
| `comparisonPeriods` | Zulässige Vergleiche (`mom`, `yoy`, `prev_period`, `none`) |
| `measurementKind` | `observed` \| `derived` \| `rule_based_estimate` \| `statistical_forecast` |
| `mayContainPii` | `true` \| `false` |
| `implementationStatus` | `active` \| `active_degraded` \| `prepared` \| `planned` \| `deprecated` |

---

## 2. Begriffstrennung (verbindlich)

| Begriff | Kanonische Bedeutung | metricId(s) | Nicht verwechseln mit |
|---------|---------------------|-------------|------------------------|
| **Fakturierter Umsatz** | Ausgestellter, nicht stornierter Ausgangs-Umsatz; Datum = `effectiveInvoiceDate` (invoiceDate → createdAt); Status ∉ Revenue-excluded; **ohne** DRAFT-Buchungsentwürfe | `fin.issued_revenue_strict_mtd` | Periodengerechter Umsatz, Zahlungseingang |
| **Periodengerechter Umsatz (aktuell: „Issued Revenue MTD“)** | Union aus fakturiertem Umsatz **und** bezahltem Umsatz im Zeitraum (dedupe by `invoice.id`); entspricht `mtdRevenueInRange()` | `fin.mtd_issued_revenue` | Reiner fakturierter Umsatz; Cashflow |
| **Zahlungseingang** | Tatsächlich als PAID markierte Ausgangs-Umsätze; Datum = `paidAt` | `fin.mtd_paid_revenue`, `fin.cash_inflow_mtd` | Fakturierter Umsatz, Bank-Cashflow |
| **Cashflow** | Geldbewegung (Ein − Aus); heute nur **Proxy** über Invoice-`paidAt` ohne Bank/Stripe-Ledger | `fin.cash_inflow_mtd` (Teilmenge) | Umsatz, Gewinn |
| **Kosten (Auswertungen)** | Eingangsrechnungen (Vendor/Upload), Rechnungsdatum im Zeitraum | `fin.mtd_expenses` | COGS, Anlage, Abschreibung, DB |
| **Deckungsbeitrag** | Umsatz minus **variable** Kosten je Kostenträger — **nicht implementiert** | `fin.contribution_margin_mtd` (planned) | `fin.mtd_net_result` |
| **Gewinn / Nettoergebnis (vereinfacht)** | Periodengerechter Umsatz minus Ausgaben-Rechnungen (keine Kostenstellen) | `fin.mtd_net_result` | Deckungsbeitrag, EBITDA |
| **Offene Forderungen** | Ausgangs-Forderungen: outgoing, nicht bezahlt, **nicht überfällig** | `fin.open_receivables` | Überfällige, Gesamt-Außenstand |
| **Überfällige Forderungen** | Offene Forderung mit `status=OVERDUE` **oder** `dueDate < now` | `fin.overdue_receivables` | Geschätztes Finanzrisiko |
| **Umsatzpotenzial** | Regelbasierte Schätzung entgangener Erlöse bei Leerstand (nicht realisiert, nicht verbucht) | `ins.low_utilization.revenue_potential_eur` | Verlorener Umsatz, fakturierter Umsatz |
| **Tatsächlich verlorener Umsatz** | Nachweislich nicht realisierter Umsatz (Storno, No-Show mit Gebühr aus, unwiederbringlich) — **kein dediziertes KPI auf Auswertungen** | — (planned: `fin.revenue_lost_actual_mtd`) | Umsatzpotenzial |
| **Regelbasierte Schätzung** | Deterministische Heuristik aus bekannten Feldern (z. B. `dailyRateEur × Tage`) | `ins.low_utilization.revenue_potential_eur`, `ins.health_booking_financial_impact_eur` | ML-Prognose |
| **Statistische Prognose** | Modellbasierte Vorhersage mit Unsicherheit — **nicht auf Auswertungen-Seite** | `fc.*` (planned) | Regelbasierte Schätzung |
| **Reservierter Umsatz** | Vorausbezahlte Buchungsentwürfe (`OUTGOING_BOOKING` + `DRAFT`) im Zeitraum | `fin.reserved_revenue_mtd` | Fakturierter Umsatz |

### Invoice-Klassifikation (Referenz für alle `fin.*`)

Quelle: `frontend/src/rental/components/invoices/invoiceClassification.ts` (spiegeln `backend/.../invoice-domain.util.ts`).

```
isRevenueInvoice(inv):
  type ∈ {OUTGOING_BOOKING, OUTGOING_MANUAL, OUTGOING_FINAL}
  AND normalize(status) ∉ {DRAFT, CANCELLED, CANCELED, VOID, CREDITED}

isExpenseInvoice(inv):
  type ∈ {INCOMING_VENDOR, INCOMING_UPLOADED}
  AND normalize(status) ∉ {DRAFT, CANCELLED, CANCELED, VOID, REJECTED}

isReceivableInvoice(inv):
  isOutgoing(type) AND status ∉ NON_OPEN_OUTGOING
  AND NOT (status=PAID OR paidAt set)

isOverdueReceivable(inv, now):
  isReceivable(inv) AND (status=OVERDUE OR dueDate < now)

effectiveInvoiceDate(inv):
  first valid of invoiceDate, createdAt

isEurInvoice(inv):
  upper(currency ?? 'EUR') ∈ {EUR, €}
```

---

## 3. Domänen-Masterliste

Jede Kennzahl ist mindestens einer Domäne zugeordnet:

| Domäne | Zweck |
|--------|-------|
| Revenue | Umsatz, Rankings, Reservierungen |
| Cashflow | Zahlungseingänge, liquide Bewegungen |
| Receivables | Offene und überfällige Forderungen |
| Costs | Eingangsrechnungen / Ausgaben |
| Contribution Margin | Deckungsbeitrag (geplant) |
| Bookings | Buchungsbezogene Risiken und Aktivität |
| Utilization | Auslastung, Leerstand |
| Fleet Availability | Verfügbare Fahrzeuge je Station/Zeit |
| Downtime | Stillstand, Leerstandstage |
| Maintenance | Servicefenster, Service vor Buchung, überfällige Wartung |
| Damage | Schäden / Missbrauch (indirekt über Misuse) |
| Compliance | TÜV, BOKraft, Service-Compliance |
| Customers | Kundenbezogene Aggregationen |
| Stations | Stationsengpässe |
| Operational Quality | Insight-Frische, operative Signale |
| Data Quality | Telemetrie, Signale, Pipeline |
| Risks | Aggregiertes Finanz-/Betriebsrisiko |
| Recommendations | Empfohlene Maßnahmen |
| Forecasts | Statistische Prognosen (geplant) |

---

## 4. Kennzahl-Katalog

### 4.1 Revenue

#### `fin.mtd_issued_revenue`

| Feld | Wert |
|------|------|
| nameDe | Periodengerechter Umsatz (MTD) |
| nameEn | Periodic Revenue MTD |
| domains | Revenue |
| description | Summe aller periodengerechten Ausgangs-Umsatzpositionen im laufenden Kalendermonat. Enthält fakturierte **und** im Monat bezahlte Positionen (dedupliziert). Entspricht UI „Issued Revenue MTD“. |
| formula | `SUM(totalCents) WHERE inv ∈ mtdRevenueInRange(invoices, monthStart, now)`; `mtdRevenueInRange = UNIQUE_BY_ID(issuedRevenueInRange ∪ paidRevenueInRange)` |
| dataSources | `org_invoices` via `GET /api/v1/organizations/:orgId/invoices`; `financial-insights.logic.ts` |
| unit | EUR (intern: EUR_CENTS) |
| currency | EUR |
| aggregation | sum |
| period | MTD (Kalendermonat, Client-Lokalzeit) |
| filters | `organizationId` (required); optional zukünftig: `stationId` via `vehicleId`/`bookingId` join |
| comparisonPeriods | `mom` (`fin.mom_revenue_delta_pct`) |
| measurementKind | observed (mit Union-Semantik) |
| mayContainPii | false (aggregiert) |
| implementationStatus | active |

#### `fin.issued_revenue_strict_mtd`

| Feld | Wert |
|------|------|
| nameDe | Fakturierter Umsatz (MTD) |
| nameEn | Invoiced Revenue MTD |
| domains | Revenue |
| description | Nur nach Rechnungsdatum fakturierte Ausgangs-Umsätze; **ohne** reine PaidAt-Aufnahme bereits außerhalb issued. |
| formula | `SUM(totalCents) WHERE inv ∈ issuedRevenueInRange(invoices, monthStart, now)` |
| dataSources | `org_invoices`; `issuedRevenueInRange()` |
| unit | EUR |
| currency | EUR |
| aggregation | sum |
| period | MTD |
| filters | `organizationId` |
| comparisonPeriods | `mom` |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active (Teilmenge von `fin.mtd_issued_revenue`; derzeit nicht separat in UI) |

#### `fin.mtd_paid_revenue` / `fin.cash_inflow_mtd`

| Feld | Wert |
|------|------|
| nameDe | Zahlungseingang Umsatz (MTD) |
| nameEn | Cash Collected Revenue MTD |
| domains | Revenue, Cashflow |
| description | Bezahlte Ausgangs-Umsätze nach Zahlungszeitpunkt `paidAt`. **Kein** Bankkonto — nur Invoice-Status PAID. `fin.cash_inflow_mtd` ist Alias mit Domäne Cashflow. |
| formula | `SUM(totalCents) WHERE inv ∈ paidRevenueInRange(invoices, monthStart, now)`; requires `status=PAID` AND valid `paidAt` |
| dataSources | `org_invoices` |
| unit | EUR |
| currency | EUR |
| aggregation | sum |
| period | MTD |
| filters | `organizationId` |
| comparisonPeriods | `mom` (planned) |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active (`fin.cash_inflow_mtd` = alias) |

#### `fin.reserved_revenue_mtd`

| Feld | Wert |
|------|------|
| nameDe | Reservierter Umsatz (MTD) |
| nameEn | Reserved Revenue MTD |
| domains | Revenue, Bookings |
| description | Vorausbezahlte Buchungsrechnungen in DRAFT — noch nicht fakturiert, aber wirtschaftlich reserviert. Eine Zeile pro `bookingId` (neueste nach `createdAt`). |
| formula | `SUM(totalCents) WHERE inv ∈ reservedRevenueInRange(invoices, monthStart, now)` |
| dataSources | `org_invoices` (`OUTGOING_BOOKING`, `DRAFT`) |
| unit | EUR |
| currency | EUR |
| aggregation | sum |
| period | MTD |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | prepared (Logik existiert; Dashboard Pulse nutzt es; Auswertungen-UI zeigt es nicht) |

#### `fin.avg_invoice_value_mtd`

| Feld | Wert |
|------|------|
| nameDe | Durchschnittlicher Rechnungsbetrag (MTD) |
| nameEn | Average Invoice Value MTD |
| domains | Revenue |
| description | Mittlerer Betrag je Umsatzposition im periodengerechten MTD-Umsatz. |
| formula | `fin.mtd_issued_revenue_cents / COUNT(mtdRevenueInRange rows)`; 0 wenn count=0 |
| dataSources | abgeleitet aus `fin.mtd_issued_revenue` |
| unit | EUR |
| currency | EUR |
| aggregation | avg |
| period | MTD |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | derived |
| mayContainPii | false |
| implementationStatus | active |

#### `fin.daily_revenue_mtd`

| Feld | Wert |
|------|------|
| nameDe | Tagesumsatz (MTD) |
| nameEn | Daily Revenue MTD |
| domains | Revenue |
| description | Summe periodengerechter Umsatz-Cent pro Kalendertag im aktuellen Monat. |
| formula | `GROUP BY day(effectiveInvoiceDate) SUM(totalCents)/100` auf `bucketed.mtdRevenue` |
| dataSources | `org_invoices`; `FinancialInsightsView` chart series |
| unit | EUR |
| currency | EUR |
| aggregation | sum (per day) |
| period | MTD, daily buckets |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active |

#### `fin.top_customers_mtd`

| Feld | Wert |
|------|------|
| nameDe | Top-Kunden nach Umsatz (MTD) |
| nameEn | Top Customers by Revenue MTD |
| domains | Revenue, Customers |
| description | Bis zu 5 Kunden nach Summe `totalCents` auf MTD-Umsatzpositionen, absteigend. |
| formula | `GROUP BY customerId SUM(totalCents) ORDER BY sum DESC LIMIT 5` |
| dataSources | `org_invoices`; `GET .../customers` (Label, **paginiert default 20**) |
| unit | EUR (Liste) |
| currency | EUR |
| aggregation | list_top_n (n=5) |
| period | MTD |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | derived |
| mayContainPii | **true** (Kundennamen) |
| implementationStatus | active_degraded (unvollständige Kundenlabels) |

#### `fin.top_vehicles_mtd`

| Feld | Wert |
|------|------|
| nameDe | Top-Fahrzeuge nach Umsatz (MTD) |
| nameEn | Top Vehicles by Revenue MTD |
| domains | Revenue |
| description | Bis zu 5 Fahrzeuge nach MTD-Umsatz. |
| formula | `GROUP BY vehicleId SUM(totalCents) ORDER BY sum DESC LIMIT 5` |
| dataSources | `org_invoices`; `FleetContext.fleetVehicles` |
| unit | EUR |
| currency | EUR |
| aggregation | list_top_n (n=5) |
| period | MTD |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | derived |
| mayContainPii | false |
| implementationStatus | active |

#### `fin.mom_revenue_delta_pct`

| Feld | Wert |
|------|------|
| nameDe | Umsatzveränderung zum Vormonat |
| nameEn | Month-over-Month Revenue Change |
| domains | Revenue |
| description | Prozentuale Änderung periodengerechter MTD-Umsätze vs. gesamter Vormonat. |
| formula | `prev = SUM(mtdRevenueInRange(prevMonthStart, prevMonthEnd)); IF prev=0 THEN NULL ELSE (mtd - prev)/prev*100` |
| dataSources | abgeleitet |
| unit | percent |
| currency | n/a |
| aggregation | ratio |
| period | MTD vs. calendar_month (previous) |
| filters | `organizationId` |
| comparisonPeriods | mom (self) |
| measurementKind | derived |
| mayContainPii | false |
| implementationStatus | active |

#### `fin.revenue_lost_actual_mtd` (planned)

| Feld | Wert |
|------|------|
| nameDe | Tatsächlich verlorener Umsatz (MTD) |
| nameEn | Actual Lost Revenue MTD |
| domains | Revenue, Bookings |
| description | Summe nachweislich nicht realisierter Umsätze (z. B. stornierte Buchungen ohne Gebühr, unwiederbringliche Gutschriften). **Noch keine Datenpipeline.** |
| formula | TBD — erfordert Buchungs-/Storno-Events + Gebührenlogik |
| dataSources | planned: `bookings`, `org_invoices` (CREDITED/VOID mit bookingId) |
| unit | EUR |
| currency | EUR |
| aggregation | sum |
| period | MTD |
| filters | `organizationId` |
| comparisonPeriods | mom |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | planned |

---

### 4.2 Cashflow

#### `fin.cashflow_net_mtd` (planned)

| Feld | Wert |
|------|------|
| nameDe | Netto-Cashflow (MTD) |
| nameEn | Net Cashflow MTD |
| domains | Cashflow |
| description | Einzahlungen minus Auszahlungen auf Basis **Bank/Stripe-Ledger**, nicht nur Invoice-paidAt. |
| formula | planned: `SUM(cash_in) - SUM(cash_out)` aus Payment-Ledger |
| dataSources | planned: `OrgInvoicePayment`, Stripe Connect, Bankimport |
| unit | EUR |
| currency | EUR |
| aggregation | sum |
| period | MTD |
| filters | `organizationId` |
| comparisonPeriods | mom |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | planned |

---

### 4.3 Receivables

#### `fin.open_receivables`

| Feld | Wert |
|------|------|
| nameDe | Offene Forderungen |
| nameEn | Open Receivables |
| domains | Receivables |
| description | Summe offener, **nicht überfälliger** Ausgangs-Forderungen (EUR). Snapshot zum Bewertungszeitpunkt `now`. |
| formula | `SUM(totalCents) WHERE inv ∈ openOutgoingReceivables(invoices, now)` |
| dataSources | `org_invoices` |
| unit | EUR |
| currency | EUR |
| aggregation | sum |
| period | snapshot |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active |

#### `fin.overdue_receivables`

| Feld | Wert |
|------|------|
| nameDe | Überfällige Forderungen |
| nameEn | Overdue Receivables |
| domains | Receivables, Risks |
| description | Summe überfälliger Ausgangs-Forderungen. |
| formula | `SUM(totalCents) WHERE inv ∈ overdueOutgoingReceivables(invoices, now)` |
| dataSources | `org_invoices` |
| unit | EUR |
| currency | EUR |
| aggregation | sum |
| period | snapshot |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active |

#### `fin.total_outstanding_receivables`

| Feld | Wert |
|------|------|
| nameDe | Gesamter Außenstand |
| nameEn | Total Outstanding Receivables |
| domains | Receivables |
| description | Offene + überfällige Forderungen. |
| formula | `fin.open_receivables + fin.overdue_receivables` |
| dataSources | abgeleitet |
| unit | EUR |
| currency | EUR |
| aggregation | sum |
| period | snapshot |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | derived |
| mayContainPii | false |
| implementationStatus | active (nicht separat in UI; Drill-down nutzt Teilmengen) |

#### `ins.open_receivables_cockpit`

| Feld | Wert |
|------|------|
| nameDe | Offene Forderungen (Cockpit) |
| nameEn | Open Receivables (Cockpit) |
| domains | Receivables |
| description | **Alias** von `fin.open_receivables` in der Cockpit-KPI-Zeile (`outstandingCents/100`). |
| formula | `fin.open_receivables` |
| dataSources | Parent-Prop aus `FinancialInsightsView` |
| unit | EUR |
| currency | EUR |
| aggregation | sum |
| period | snapshot |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active (duplicate display) |

---

### 4.4 Costs

#### `fin.mtd_expenses`

| Feld | Wert |
|------|------|
| nameDe | Ausgaben (MTD) |
| nameEn | Expenses MTD |
| domains | Costs |
| description | Summe Eingangsrechnungen im MTD nach Rechnungsdatum. **Kein** Cashflow-Datum. |
| formula | `SUM(totalCents) WHERE inv ∈ expensesInRange(invoices, monthStart, now)` |
| dataSources | `org_invoices` |
| unit | EUR |
| currency | EUR |
| aggregation | sum |
| period | MTD |
| filters | `organizationId` |
| comparisonPeriods | `mom` (`fin.mom_expense_delta_pct`) |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active |

#### `fin.daily_expenses_mtd`

| Feld | Wert |
|------|------|
| nameDe | Tagesausgaben (MTD) |
| nameEn | Daily Expenses MTD |
| domains | Costs |
| formula | `GROUP BY day(effectiveInvoiceDate) SUM(totalCents)/100` auf `bucketed.mtdExpense` |
| dataSources | `org_invoices` |
| unit | EUR |
| currency | EUR |
| aggregation | sum (per day) |
| period | MTD, daily |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active |

#### `fin.mom_expense_delta_pct`

| Feld | Wert |
|------|------|
| nameDe | Ausgabenveränderung zum Vormonat |
| nameEn | Month-over-Month Expense Change |
| domains | Costs |
| formula | `(mtd_expenses - prev_month_expenses) / prev * 100`; NULL wenn prev=0 |
| dataSources | abgeleitet |
| unit | percent |
| currency | n/a |
| aggregation | ratio |
| period | MTD vs previous calendar month |
| filters | `organizationId` |
| comparisonPeriods | mom |
| measurementKind | derived |
| mayContainPii | false |
| implementationStatus | active |

---

### 4.5 Contribution Margin

#### `fin.mtd_net_result`

| Feld | Wert |
|------|------|
| nameDe | Vereinfachtes Nettoergebnis (MTD) |
| nameEn | Simplified Net Result MTD |
| domains | Revenue, Costs |
| description | Periodengerechter Umsatz minus Ausgaben-Rechnungen. UI-Label „Net Profit MTD“ — **nicht** Deckungsbeitrag oder bilanzieller Gewinn. |
| formula | `fin.mtd_issued_revenue_cents - fin.mtd_expenses_cents` |
| dataSources | abgeleitet |
| unit | EUR |
| currency | EUR |
| aggregation | sum |
| period | MTD |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | derived |
| mayContainPii | false |
| implementationStatus | active |

#### `fin.profit_margin_mtd`

| Feld | Wert |
|------|------|
| nameDe | Ergebnismarge (MTD) |
| nameEn | Net Result Margin MTD |
| domains | Revenue, Costs |
| description | Nettoergebnis / periodengerechter Umsatz. Basis explizit „Issued Revenue“. |
| formula | `IF mtd_issued_revenue>0 THEN mtd_net_result/mtd_issued_revenue*100 ELSE 0` |
| dataSources | abgeleitet |
| unit | percent |
| currency | n/a |
| aggregation | ratio |
| period | MTD |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | derived |
| mayContainPii | false |
| implementationStatus | active |

#### `fin.daily_net_result_mtd`

| Feld | Wert |
|------|------|
| nameDe | Tagesergebnis (MTD) |
| nameEn | Daily Net Result MTD |
| domains | Revenue, Costs |
| formula | `daily_revenue_mtd[d] - daily_expenses_mtd[d]` pro Tag |
| dataSources | abgeleitet (Chart profit series) |
| unit | EUR |
| currency | EUR |
| aggregation | sum (per day) |
| period | MTD, daily |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | derived |
| mayContainPii | false |
| implementationStatus | active (berechnet, nicht als Area im Chart) |

#### `fin.contribution_margin_mtd` (planned)

| Feld | Wert |
|------|------|
| nameDe | Deckungsbeitrag (MTD) |
| nameEn | Contribution Margin MTD |
| domains | Contribution Margin, Revenue, Costs |
| description | Umsatz minus **variable** Kosten je definierter Kostenart-Zuordnung. Erfordert Kostenstellen-/COGS-Modell. |
| formula | planned: `revenue - variable_costs` |
| dataSources | planned: Kostenarten-Mapping auf `org_invoices` + ggf. Lohn/Teile |
| unit | EUR |
| currency | EUR |
| aggregation | sum |
| period | MTD |
| filters | `organizationId`, `vehicleId`, `stationId` (planned) |
| comparisonPeriods | mom |
| measurementKind | derived |
| mayContainPii | false |
| implementationStatus | planned |

---

### 4.6 Bookings

#### `fin.recent_invoice_activity`

| Feld | Wert |
|------|------|
| nameDe | Letzte Rechnungsaktivität |
| nameEn | Recent Invoice Activity |
| domains | Bookings, Revenue |
| description | Bis zu 8 jüngste Rechnungen (Ein- und Ausgang) nach effektivem Datum, org-weit. |
| formula | `SORT BY effectiveInvoiceDate DESC LIMIT 8` (alle Typen) |
| dataSources | `org_invoices` |
| unit | count (Liste) |
| currency | mixed |
| aggregation | list_top_n (n=8) |
| period | snapshot (kein MTD-Filter) |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | true (Kunde/Fahrzeug in Zeilen) |
| implementationStatus | active |

#### `fin.mtd_open_invoice_count`

| Feld | Wert |
|------|------|
| nameDe | Offene Umsatzrechnungen (MTD) |
| nameEn | Open Revenue Invoices MTD |
| domains | Bookings, Revenue |
| formula | `COUNT(mtdRevenue rows WHERE status ∉ {PAID, CANCELLED})` |
| dataSources | `org_invoices` |
| unit | count |
| currency | n/a |
| aggregation | count |
| period | MTD |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active |

#### `fin.mtd_paid_invoice_count`

| Feld | Wert |
|------|------|
| nameDe | Bezahlte Umsatzrechnungen (MTD) |
| nameEn | Paid Revenue Invoices MTD |
| domains | Bookings, Cashflow |
| formula | `COUNT(paidRevenueInRange)` |
| dataSources | `org_invoices` |
| unit | count |
| aggregation | count |
| period | MTD (paidAt) |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active |

#### `fin.mtd_expense_invoice_count`

| Feld | Wert |
|------|------|
| nameDe | Ausgabenrechnungen (MTD) |
| nameEn | Expense Invoices MTD |
| domains | Costs |
| formula | `COUNT(expensesInRange)` |
| dataSources | `org_invoices` |
| unit | count |
| aggregation | count |
| period | MTD |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active |

#### `fin.org_invoice_count`

| Feld | Wert |
|------|------|
| nameDe | Rechnungen gesamt (Organisation) |
| nameEn | Total Organization Invoices |
| domains | Bookings |
| formula | `COUNT(all invoices returned by list endpoint)` |
| dataSources | `GET .../invoices` (unpaginated org list) |
| unit | count |
| aggregation | count |
| period | snapshot |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active |

---

### 4.7 Utilization & Downtime

#### `ins.low_utilization`

| Feld | Wert |
|------|------|
| nameDe | Geringe Auslastung (Fahrzeug) |
| nameEn | Low Utilization (Vehicle) |
| domains | Utilization, Downtime, Revenue |
| description | Fahrzeug ohne Buchung in den letzten N Tagen und ohne bestätigte Buchung in den nächsten 7 Tagen. |
| formula | `vehicle.status ∈ {AVAILABLE, RENTED}` AND `recentBookings.count=0` (lookback `policy.lowUtilizationDays`) AND `upcomingBookings.count=0` (next 7d) |
| dataSources | `vehicles`, `bookings`; `LowUtilizationDetector` |
| unit | count (Insight-Karten) |
| aggregation | count (per published insight) |
| period | rolling_Nd lookback + 7d forward |
| filters | `organizationId`; optional `stationId` via `homeStationId` |
| comparisonPeriods | none |
| measurementKind | rule_based_estimate (Impact-Euro separat) |
| mayContainPii | false |
| implementationStatus | active |

#### `ins.low_utilization.revenue_potential_eur`

| Feld | Wert |
|------|------|
| nameDe | Umsatzpotenzial bei Leerstand |
| nameEn | Revenue Potential at Idle |
| domains | Utilization, Revenue, Risks |
| description | **Regelbasierte Schätzung**, kein verlorener oder fakturierter Umsatz. |
| formula | `ROUND(dailyRateEur * policy.lowUtilizationDays)`; `dailyRateEur = vehicle.dailyRateEur ?? 0` |
| dataSources | `vehicles.dailyRateEur`; Detector-Metrik `lostRevenueEur` (**Legacy-Name**) |
| unit | EUR |
| currency | EUR |
| aggregation | sum (wenn über Fahrzeuge aggregiert) |
| period | rolling_Nd (= lookbackDays) |
| filters | `organizationId`, `vehicleId` |
| comparisonPeriods | none |
| measurementKind | rule_based_estimate |
| mayContainPii | false |
| implementationStatus | active |

#### `ops.fleet_utilization_pct` (planned)

| Feld | Wert |
|------|------|
| nameDe | Flottenauslastung |
| nameEn | Fleet Utilization Rate |
| domains | Utilization |
| description | Anteil gebuchter Fahrzeug-Tage an verfügbaren Fahrzeug-Tagen im Zeitraum. |
| formula | planned: `SUM(booked_vehicle_days) / SUM(available_vehicle_days) * 100` |
| dataSources | planned: `bookings`, `vehicles`, Downtime-Events |
| unit | percent |
| aggregation | ratio |
| period | MTD / rolling_30d |
| filters | `organizationId`, `stationId` |
| comparisonPeriods | mom |
| measurementKind | derived |
| mayContainPii | false |
| implementationStatus | planned |

#### `ops.vehicle_idle_days`

| Feld | Wert |
|------|------|
| nameDe | Leerstandstage (Schwellwert) |
| nameEn | Idle Days (Threshold) |
| domains | Downtime, Utilization |
| description | Im LOW_UTILIZATION-Insight als `metrics.idleDays` (= Policy `lowUtilizationDays`, nicht individuell gezählt). |
| formula | `metrics.idleDays = policy.lowUtilizationDays` |
| dataSources | Insight metrics |
| unit | days |
| aggregation | last |
| period | rolling_Nd |
| filters | `vehicleId` |
| comparisonPeriods | none |
| measurementKind | rule_based_estimate |
| mayContainPii | false |
| implementationStatus | active |

---

### 4.8 Fleet Availability & Stations

#### `ins.station_shortage`

| Feld | Wert |
|------|------|
| nameDe | Stationsengpass |
| nameEn | Station Shortage |
| domains | Fleet Availability, Stations, Bookings |
| description | Station mit zu wenig verfügbaren Fahrzeugen im 24h-Horizont. |
| formula | `available = totalVehiclesAtStation - bookedOutWithin24h`; alert if `available <= policy.stationShortageThreshold` |
| dataSources | `stations`, `vehicles`, `bookings`; `StationShortageDetector` |
| unit | count (Insight) |
| aggregation | count |
| period | snapshot + 24h horizon |
| filters | `organizationId`, `stationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active |

#### `ins.station_available_vehicle_count`

| Feld | Wert |
|------|------|
| nameDe | Verfügbare Fahrzeuge (Station) |
| nameEn | Available Vehicles at Station |
| domains | Fleet Availability, Stations |
| description | Metrik innerhalb STATION_SHORTAGE-Insight (`metrics.available`, `metrics.total`). |
| formula | siehe `ins.station_shortage` |
| dataSources | Insight metrics |
| unit | count |
| aggregation | min/snapshot |
| period | 24h horizon |
| filters | `stationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active |

#### `ops.station_revenue_rank_mtd` (planned)

| Feld | Wert |
|------|------|
| nameDe | Stations-Ranking nach Umsatz (MTD) |
| nameEn | Station Revenue Ranking MTD |
| domains | Stations, Revenue |
| description | Geordnete Liste aller Stationen nach MTD-Umsatz. **Nicht auf Auswertungen implementiert.** |
| formula | planned: `GROUP BY stationId SUM(revenue) ORDER BY sum DESC` |
| dataSources | planned: `org_invoices` + `bookings.stationId` / vehicle home station |
| unit | EUR |
| aggregation | list_top_n |
| period | MTD |
| filters | `organizationId` |
| comparisonPeriods | mom |
| measurementKind | derived |
| mayContainPii | false |
| implementationStatus | planned |

---

### 4.9 Maintenance & Compliance

#### `ins.tight_handover`

| Domains | Bookings, Operational Quality |
| formula | Aufeinanderfolgende Buchungen am selben Fahrzeug: `gap_minutes < policy.handoverBufferMin` (default 60) innerhalb 48h |
| measurementKind | observed |
| implementationStatus | active |

#### `ins.return_needs_inspection`

| Domains | Bookings, Operational Quality |
| formula | Rückgabe ohne abgeschlossenes Inspection-Protokoll |
| measurementKind | observed |
| implementationStatus | active |

#### `ins.service_window`

| Domains | Maintenance, Fleet Availability |
| formula | Lücke ≥ `policy.serviceWindowMinHours` bei cleaning/health/service-due vor nächster Buchung |
| measurementKind | observed |
| implementationStatus | active |

#### `ins.service_before_booking`

| Domains | Maintenance, Bookings |
| formula | Offener Service-Case blockiert Pickup innerhalb `policy.serviceBeforeBookingHours` |
| measurementKind | observed |
| implementationStatus | active |

#### `ins.service_overdue`

| Domains | Maintenance, Compliance |
| formula | `buildComplianceInsightCandidates` — Service-Intervall überschritten |
| measurementKind | observed |
| implementationStatus | active |

#### `ins.tuv_overdue`

| Domains | Compliance |
| formula | `vehicle.nextTuvDate < now` (Compliance-Engine) |
| measurementKind | observed |
| implementationStatus | active |

#### `ins.bokraft_overdue`

| Domains | Compliance |
| formula | `vehicle.nextBokraftDate < now` |
| measurementKind | observed |
| implementationStatus | active |

#### `ins.hm_service_no_tracking`

| Domains | Compliance, Data Quality |
| formula | Fahrzeug ohne HM-Service-Tracking (informativ) |
| measurementKind | observed |
| implementationStatus | active |

*Gemeinsame Insight-Felder für 4.9:* dataSources = `dashboard_insights` via Detectors; period = per_evaluation_run (~30 min Cron); filters = `organizationId`, Detector-Policy; mayContainPii = false (außer verknüpfte Buchung/Kunde in metrics); comparisonPeriods = none.

---

### 4.10 Damage & Misuse

#### `ins.misuse_cases_visible_count`

| Feld | Wert |
|------|------|
| nameDe | Sichtbare Nutzungsauffälligkeiten |
| nameEn | Visible Misuse Cases |
| domains | Damage, Operational Quality, Customers |
| description | Anzahl angezeigter Misuse-Case-Zeilen (max 8 auf Seite 1). |
| formula | `COUNT(misuse_cases WHERE page=1 LIMIT 8)` |
| dataSources | `misuse_cases` via `GET .../misuse-cases?limit=8&page=1` |
| unit | count |
| aggregation | count |
| period | snapshot |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | **true** |
| implementationStatus | active |

---

### 4.11 Health-gated booking risks

#### `ins.battery_critical_gated` / `ins.tire_critical_gated` / `ins.brake_critical_gated`

| Domains | Maintenance, Risks, Bookings |
| description | Raw-Health-Insight nur mit anstehender Buchung (`gateHealthInsights`) |
| measurementKind | observed (Health) + rule_based_estimate (Impact) |
| implementationStatus | active |

#### `ins.health_booking_financial_impact_eur`

| Feld | Wert |
|------|------|
| nameDe | Geschätztes Buchungsumsatzrisiko (Health) |
| nameEn | Estimated Booking Revenue at Risk (Health) |
| domains | Risks, Revenue, Bookings |
| formula | `estimateBookingRevenueCents(booking)`: `totalPriceCents` if >0 else `dailyRateCents` else 0; display EUR = round(cents/100) |
| dataSources | `bookings`, `insight-health-gate.ts` |
| unit | EUR |
| measurementKind | rule_based_estimate |
| mayContainPii | false |
| implementationStatus | active |

#### `ins.pickup_overdue`

| Domains | Bookings, Customers, Operational Quality |
| formula | `status=CONFIRMED AND startDate < now AND no PICKUP handover protocol`; lookback 7d |
| measurementKind | observed |
| mayContainPii | **true** (`customerName` in metrics) |
| implementationStatus | active |

#### `ins.driving_assessment_device_quality`

| Domains | Data Quality, Operational Quality |
| formula | `vehicle_driving_assessment_quality.status ∈ {DEGRADED, RECOVERING}` |
| measurementKind | observed |
| implementationStatus | active |

---

### 4.12 Risks & Recommendations

#### `ins.business_risks_count`

| Feld | Wert |
|------|------|
| nameDe | Geschäftsrisiken (Anzahl) |
| nameEn | Business Risks Count |
| domains | Risks, Operational Quality |
| formula | `COUNT(partitionInsights().businessRisks)` nach `isVisibleOnInsightsPage` |
| dataSources | `dashboard_insights` (max `policy.maxVisibleInsights`=4 published) |
| unit | count |
| aggregation | count |
| period | snapshot (letzter Publish) |
| filters | `organizationId`; optional `stationId` (Cockpit-Prop, Parent übergibt oft null) |
| comparisonPeriods | none |
| measurementKind | observed (auf sichtbarer Teilmenge) |
| mayContainPii | false |
| implementationStatus | active_degraded (Publish-Limit) |

#### `ins.estimated_financial_exposure_eur`

| Feld | Wert |
|------|------|
| nameDe | Geschätztes finanzielles Exposure |
| nameEn | Estimated Financial Exposure |
| domains | Risks, Receivables, Revenue |
| description | **Nicht** klassisches Finanzrisiko. Summe: überfällige Forderungen (EUR) + regelbasierte Insight-Impacts. UI: „Finanzrisiko (geschätzt)“. |
| formula | `ROUND(overdue_receivables_cents/100) + SUM(financialImpactEur(i))` für i ∈ businessRisks ∪ revenueLeakage; `financialImpactEur`: if metric >1000 then cents/100 else whole EUR (Legacy) |
| dataSources | `fin.overdue_receivables` + `dashboard_insights.metrics` |
| unit | EUR |
| aggregation | sum |
| period | snapshot |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | rule_based_estimate |
| mayContainPii | false |
| implementationStatus | active |

**Legacy-ID:** `ins.estimated_financial_risk` → umbenennen zu `ins.estimated_financial_exposure_eur`.

#### `ins.critical_insights_count`

| Feld | Wert |
|------|------|
| nameDe | Kritische Hinweise (Anzahl) |
| nameEn | Critical Insights Count |
| domains | Risks, Bookings |
| description | Anzahl Insights mit `severity=CRITICAL` in businessRisks — **nicht** Anzahl kritischer Buchungen. |
| formula | `COUNT(businessRisks WHERE severity=CRITICAL)` |
| dataSources | `dashboard_insights` |
| unit | count |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active |

**Legacy:** UI „Kritische Buchungen“ / `ins.critical_bookings_count` → **`ins.critical_insights_count`**.

#### `ins.revenue_leakage_count`

| Domains | Revenue, Risks, Utilization |
| formula | `COUNT(partitionInsights().revenueLeakage)` — primär `LOW_UTILIZATION` |
| measurementKind | observed |
| implementationStatus | active |

#### `ins.recommendations_visible_count`

| Feld | Wert |
|------|------|
| nameDe | Empfohlene Maßnahmen (sichtbar) |
| nameEn | Visible Recommendations |
| domains | Recommendations |
| formula | `MIN(6, COUNT(recommended WHERE severity ∈ {CRITICAL, WARNING} SORT priority DESC))` |
| dataSources | `dashboard_insights`; Text aus `insightRecommendation()` |
| unit | count |
| aggregation | count |
| period | snapshot |
| filters | `organizationId` |
| comparisonPeriods | none |
| measurementKind | observed |
| mayContainPii | false |
| implementationStatus | active |

#### `ins.insights_run_stale` / `ins.insights_run_error`

| Domains | Operational Quality, Data Quality |
| description | `stale = (now - lastRun.finishedAt) > 2 * refreshIntervalMin`; `error` aus Context/API |
| measurementKind | observed |
| implementationStatus | active |

---

### 4.13 Data Quality (`data-analyse` View)

Permission: `data-analyse.read`. Scope: **pro Fahrzeug** (`vehicleId`).

| metricId | nameDe | nameEn | domains | formula (Kurz) | unit | measurementKind | status |
|----------|--------|--------|---------|----------------|------|-----------------|--------|
| `da.telemetry_last_received` | Letzte Telemetrie | Last Telemetry Received | Data Quality | `latestState.lastSeenAt` | datetime | observed | active |
| `da.signals_observed_count` | Beobachtete Signale | Signals Observed | Data Quality | count persisted signal rows | count | observed | active |
| `da.hf_availability_status` | HF-Verfügbarkeit | HF Availability Status | Data Quality | classify from HF/waypoint volume | enum | derived | active_degraded (CH) |
| `da.avg_signal_interval_ms` | Ø Signalintervall | Avg Signal Interval | Data Quality | `computeIntervalStats(chIntervals)` | ms | derived | active_degraded |
| `da.data_freshness_status` | Datenfrische | Data Freshness Status | Data Quality | `classifyDataFreshness(lastSeen, thresholds)` | enum | derived | active |
| `da.signal_quality_score` | Signalqualität (Trip) | Trip Signal Quality Score | Data Quality | latest `signal_quality_snapshots` | score | observed | active_degraded |
| `da.pipeline_stages` | Pipeline-Status | Pipeline Stages | Data Quality | DIMO/CH stage flags | enum | observed | active |
| `da.health_trace` | Health-Trace | Health Trace | Data Quality | module evaluation trace | text | observed | active |
| `da.clickhouse_diagnostics` | ClickHouse-Diagnose | ClickHouse Diagnostics | Data Quality | cluster-level diagnostics | text | observed | active |

Gemeinsame Filter: `organizationId`, `vehicleId` (required). comparisonPeriods: none. mayContainPii: false.

---

### 4.14 Forecasts (geplant)

| metricId | nameDe | measurementKind | status |
|----------|--------|-----------------|--------|
| `fc.revenue_forecast_30d` | Umsatzprognose (30 Tage) | statistical_forecast | planned |
| `fc.utilization_forecast_30d` | Auslastungsprognose (30 Tage) | statistical_forecast | planned |
| `fc.receivables_collection_forecast` | Forderungseingangs-Prognose | statistical_forecast | planned |
| `fc.maintenance_downtime_forecast` | Wartungs-/Ausfallprognose | statistical_forecast | planned |

**Hinweis:** `vehicle-forecast-engine` und Voice-Billing-Forecast existieren außerhalb der Auswertungen-Seite und verwenden **eigene** metricIds (nicht Teil dieses Katalogs bis Integration).

---

### 4.15 Operational strengths/weaknesses (geplant)

| metricId | nameDe | domains | status |
|----------|--------|---------|--------|
| `ops.strengths_count` | Stärken (Anzahl) | Operational Quality | planned |
| `ops.weaknesses_count` | Schwächen (Anzahl) | Operational Quality | planned |

Keine Datenquelle auf Auswertungen-Seite (Prompt 1/2 bestätigt).

---

## 5. Legacy-Mapping (umbenennen / verwerfen)

| Legacy-Begriff | Kanonische metricId | Aktion |
|----------------|---------------------|--------|
| „Issued Revenue MTD“ (UI) | `fin.mtd_issued_revenue` | Behalten; Subtitle sollte „periodengerecht“ klären |
| „Net Profit MTD“ | `fin.mtd_net_result` | **Umbenennen** (nicht „Gewinn“/„Profit“ ohne Qualifikation) |
| „Profit margin“ | `fin.profit_margin_mtd` | **Umbenennen** zu Ergebnismarge |
| Prop `financialRiskEur` | `fin.overdue_receivables` (Anteil) | **Verwerfen** als Risiko-Label; nur noch Overdue-Betrag |
| „Finanzrisiko (geschätzt)“ | `ins.estimated_financial_exposure_eur` | **Umbenennen** |
| `ins.estimated_financial_risk` | `ins.estimated_financial_exposure_eur` | Alias deprecated |
| „Kritische Buchungen“ | `ins.critical_insights_count` | **Umbenennen** (zählt Insights, nicht Bookings) |
| `metrics.lostRevenueEur` | `ins.low_utilization.revenue_potential_eur` | **Umbenennen** (kein „lost revenue“) |
| `GET /invoices/stats.totalRevenueCents` | — | **Nicht kanonisch** für Auswertungen (Lifetime, andere Semantik) |
| `fin.open_receivables` + Cockpit-Duplikat | `ins.open_receivables_cockpit` | Alias dokumentiert; langfristig eine Anzeige |
| `RETURN_OVERDUE` (Frontend InsightType) | — | **Verwerfen** bis Prisma-Enum aligned |
| „Paid revenue“ als Cashflow | `fin.cash_inflow_mtd` | Nur als Zahlungseingangs-**Proxy** labeln |

---

## 6. Implementierungsstatus-Matrix

| Status | Bedeutung | Anzahl |
|--------|-----------|--------|
| active | Produktiv auf Auswertungen oder Admin-DA | 52 |
| active_degraded | Produktiv mit bekannter Datenlücke | 6 |
| prepared | Logik vorhanden, UI fehlt | 1 |
| planned | Taxonomie definiert, keine seriöse Berechnung | 12 |
| deprecated | Nur Legacy-Alias, nicht neu verwenden | 3 |

**Gesamt definierte Kennzahlen: 74** (inkl. Aliase und geplanter Platzhalter).

---

## 7. Kennzahlen mit fehlenden Daten

| metricId | Fehlende Quelle |
|----------|-----------------|
| `fin.contribution_margin_mtd` | Kostenarten / variable Kosten-Zuordnung |
| `fin.cashflow_net_mtd` | Bank/Stripe-Ledger-Aggregation |
| `fin.revenue_lost_actual_mtd` | Storno-/No-Show-Gebühren-Events |
| `ops.fleet_utilization_pct` | Gebuchte vs. verfügbare Fahrzeug-Tage (kein KPI auf Auswertungen) |
| `ops.station_revenue_rank_mtd` | Station-Attribution auf Invoice-Ebene |
| `ops.strengths_count` / `ops.weaknesses_count` | Kein Modell/API |
| `fc.*` | Forecast-Engine nicht an Auswertungen angebunden |
| `fin.top_customers_mtd` | Vollständige Kundenliste (Pagination limit 20) |
| `ins.business_risks_count` | Vollständige Insight-Menge (Publish-Limit 4) |
| `da.*` (degraded) | ClickHouse optional (`CLICKHOUSE_URL`, `HF_MIRROR_ENABLED`) |

---

## 8. Kennzahlen, die vorerst nicht seriös berechnet werden können

| metricId | Grund |
|----------|-------|
| `fin.contribution_margin_mtd` | Kein COGS/Kostenstellen-Modell |
| `fin.cashflow_net_mtd` | Kein vollständiger Zahlungsfluss |
| `fin.revenue_lost_actual_mtd` | Keine kanonische „Verlust“-Definition in Daten |
| `fin.mtd_net_result` als „Gewinn“ | Vermischt Accrual-Umsatz mit Rechnungs-Ausgaben; nicht bilanziell |
| `ins.estimated_financial_exposure_eur` | Addiert unvergleichbare Größen (Overdue + Heuristiken); Legacy cents/EUR-Bug |
| `ins.low_utilization.revenue_potential_eur` | Nur `dailyRate × Tage`; ignoriert Nachfrage, Saison, Station |
| `ins.critical_insights_count` als Buchungs-KPI | Semantisch irreführend |
| `fc.*` | Kein kalibriertes Prognosemodell auf dieser Seite |
| `ops.fleet_utilization_pct` | Keine durchgängige Downtime-/Verfügbarkeitsbuchung |
| `ops.strengths_count` / `ops.weaknesses_count` | Kein Scoring-Framework |

**Als beobachtet/gültig nutzbar (bei vollständigen Invoice-Daten):** `fin.issued_revenue_strict_mtd`, `fin.mtd_paid_revenue`, `fin.open_receivables`, `fin.overdue_receivables`, `fin.mtd_expenses`, Compliance-/Booking-Insights mit exakten Zeitregeln.

---

## 9. Maschinenlesbarer Index

```json
{
  "taxonomyVersion": "1.0.0",
  "metricCount": 74,
  "prefixes": {
    "fin": "invoice-based financial metrics",
    "ins": "business insights and cockpit aggregates",
    "da": "data-analyse per-vehicle telemetry quality",
    "fc": "statistical forecasts (planned)",
    "ops": "fleet/station operational metrics (partial planned)"
  },
  "domains": [
    "Revenue", "Cashflow", "Receivables", "Costs", "Contribution Margin",
    "Bookings", "Utilization", "Fleet Availability", "Downtime", "Maintenance",
    "Damage", "Compliance", "Customers", "Stations", "Operational Quality",
    "Data Quality", "Risks", "Recommendations", "Forecasts"
  ]
}
```

Vollständige per-metric JSON-Zeilen: siehe `docs/audits/evaluations/evaluations-data-flow-map-2026-07.md` §3 (wird in Prompt 5+ auf diese Taxonomie migriert).

---

## 10. Nächste Schritte (Prompt 5+)

1. Shared metric package / Server-Aggregations-Endpoint mit diesen IDs.
2. UI-Labels auf kanonische `nameDe`/`nameEn` mappen; Legacy-Aliase entfernen.
3. Org-Zeitzone-Policy für MTD vs. Detector-`now`.
4. Export-CSV/PDF mit `metricId`-Headern.
5. Forecast-Integration nur unter `fc.*` mit `measurementKind=statistical_forecast`.

---

**Dokumentpfad:** `docs/architecture/analytics/evaluations-kpi-taxonomy.md`
