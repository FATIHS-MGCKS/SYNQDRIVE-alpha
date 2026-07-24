# Auswertungen — Rollen- und Berechtigungsmatrix

**Prompt 47/54** — granulare, backend-autoritative Berechtigungen für die Auswertungen-Seite (Analytics / Financial Insights).

## Ziele

- **Backend ist autoritativ** — UI-Ausblendung ersetzt keine API-Prüfung.
- **Aggregierte vs. Detaildaten** getrennt steuerbar (z. B. Finance vs. Customer PII vs. Receivables).
- **Exporte** eigene Berechtigung (`evaluations-export.write`).
- **Admin-Diagnosedaten** (Modell-Registry, Feature-Store, Backtest-Admin) nur mit `evaluations-admin.manage`.
- **Stationsbezogene Rollen** sehen nur erlaubte Stationen (`stationId`-Query + `StationAccessService`).
- **Keine Rechteerweiterung** über manipulierte Filter, Query-Parameter oder fremde Org-IDs.

## Permission Actions → Module

| Action | Modul | Level | Bedeutung |
|--------|-------|-------|-----------|
| `evaluations.executive.read` | `evaluations` | read | Seitenzugang, Executive KPIs, Dashboard-Insights |
| `evaluations.finance.read` | `evaluations-finance` | read | Finanz-Aggregate, Umsatz/KPI ohne Klarnamen |
| `evaluations.receivables.read` | `evaluations-receivables` | read | Forderungsdetails / Mahn-Drill-down |
| `evaluations.customer_pii.read` | `evaluations-customer-pii` | read | Personenbezogene Kundendetails |
| `evaluations.driver.read` | `evaluations-driver` | read | Fahrer-/Missbrauchsanalysen (Vollansicht) |
| `evaluations.costs.read` | `evaluations-costs` | read | Kosten / Aufwandsdaten |
| `evaluations.forecasts.read` | `evaluations-forecasts` | read | Prognosen (operational + Risiko) |
| `evaluations.data_quality.read` | `evaluations-data-quality` | read | Backtest, Drift, Feature-Qualität |
| `evaluations.recommendations.write` | `evaluations-recommendations` | write | Empfehlungen verwalten |
| `evaluations.assignees.write` | `evaluations-assignees` | write | Verantwortliche zuweisen |
| `evaluations.export.write` | `evaluations-export` | write | Exporte erstellen |
| `evaluations.admin.manage` | `evaluations-admin` | manage | KPI-/Modelldefinitionen administrieren |

Shared Contract: `shared/evaluations-insights/evaluations-permission.contract.ts`

## Rollenmatrix (Default-Templates)

| Rolle | Executive | Finance | Receivables | Customer PII | Driver | Costs | Forecasts | Data Quality | Reco. | Assignees | Export | Admin |
|-------|:---------:|:-------:|:-----------:|:------------:|:------:|:-----:|:---------:|:------------:|:-----:|:---------:|:------:|:-----:|
| Org Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sub Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| Buchhaltung | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | — | ✓ | — |
| Stationsleiter | ✓ | — | — | — | — | — | ✓ | — | ✓ | ✓ | — | — |
| Disposition | ✓ | — | — | — | — | — | — | — | — | — | — | — |
| Service/Werkstatt | ✓ | — | — | — | ✓ | — | ✓ | — | — | — | — | — |
| Read-only | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | — | — | — | — |
| Mitarbeiter / Fahrer / Field Agent | — | — | — | — | — | — | — | — | — | — | — | — |

Quelle: `backend/src/modules/users/defaults/organization-role.defaults.ts` + `evaluations-permission.defaults.ts`

## Legacy-Fallbacks (Migration)

Bis Memberships mit den neuen Modulen backgefüllt sind, gelten kontrollierte Fallbacks:

| Action | Legacy-Fallback |
|--------|----------------|
| Executive, Finance, Receivables, Costs | `invoices.read` |
| Forecasts | `invoices.read` **oder** `data-analyse.read` |
| Data Quality | `data-analyse.read` |
| Driver | `fleet-condition.read` |
| Customer PII | `invoices.read` **und** `customers.read` |
| Assignees | `tasks.write` |
| Admin | `data-analyse.manage` |

**Kein Legacy-Fallback** für Export (`evaluations-export.write`) und Empfehlungen — explizites Modul erforderlich.

## Backend Guards

### `EvaluationsPermissionGuard`

- Decorator: `@RequireEvaluationsPermission(action)`
- Service: `EvaluationsAccessService` (`evaluateEvaluationsPermission`, `assertEvaluationsPermission`)
- Org-Scope: `OrgScopingGuard` + `resolvePermissionOrgId` (Cross-Tenant-Schutz)
- Station-Scope: optional `?stationId=` → `assertReadableStation`

### Geschützte Endpunkte (Auszug)

| Route | Permission |
|-------|------------|
| `GET .../dashboard-insights` | `evaluations.executive.read` |
| `GET .../dashboard-insights/summary` | `evaluations.executive.read` |
| `GET .../evaluations/export/summary` | `evaluations.export.write` |
| `GET .../evaluations/predictive/forecasts` | `evaluations.forecasts.read` |
| `GET .../evaluations/predictive/risk-forecasts` | `evaluations.forecasts.read` |
| `GET .../evaluations/predictive/backtests` | `evaluations.data_quality.read` |
| `GET .../evaluations/predictive/features` | `evaluations.data_quality.read` |
| Registry/Admin-Mutationen | `evaluations.admin.manage` |
| `GET .../misuse-cases?surface=cockpit` | `evaluations.executive.read` |
| `GET .../misuse-cases` (Vollansicht) | `evaluations.driver.read` |
| Empfehlungs-Lifecycle | `evaluations.recommendations.write` |
| `GET .../customers/evaluation-labels` | `evaluations.finance.read` |

PII-Redaktion in Dashboard-Insights erfolgt zusätzlich über `evaluations-privacy.policy` (Tier full/pseudonymous/none) basierend auf `customer_pii` / `finance` Permissions.

## Frontend-Verhalten

- `frontend/src/rental/lib/evaluations-permissions.ts` — Spiegel der Backend-Matrix (nur UX, nicht autoritativ).
- `FinancialInsightsView` — Sektionen per `buildEvaluationsPermissionGate()` ein-/ausgeblendet.
- `Sidebar` — Nav-Eintrag „Auswertungen“ bei `evaluations.read` oder Legacy `invoices.read`.
- `InsightsCockpit` — `showDriverSignals` / `showRecommendations` an Permissions gebunden.
- Users & Roles UI — 12 neue Module in `users-roles/constants.ts`.

## Cross-Tenant & Station-Tests

- `evaluations.permissions.matrix.spec.ts` — positive/negative Matrix aller Default-Rollen + Legacy-Fallbacks + Org-Grenzen.
- `evaluations-permission.guard.spec.ts` — Guard-Durchsetzung, Cross-Org-Spoofing, Station-Scope.
- Frontend: `evaluations-permissions.test.ts`.

## Migrationsauswirkungen

1. **Kein DB-Schema-Change** — Berechtigungen leben in `organizationMembership.permissions` (JSON).
2. **Neue Default-Templates** enthalten die `evaluations-*` Module; bestehende Custom-Rollen behalten ihre JSON-Konfiguration.
3. **Legacy-Fallbacks** sichern Übergangsphase; nach Backfill können Fallbacks entfernt werden.
4. **Rechnungs-API** (`/invoices/*`) bleibt separat durch `invoices.read` geschützt — Auswertungen-Finance erlaubt Aggregat-APIs, nicht automatisch alle Rechnungsdetails.
5. **Station Scope V2** — wenn `STATIONS_V2_SCOPE_ENABLED` aktiv, filtert `stationId` über `StationAccessService`; sonst Bypass (bestehendes SEC-08-Verhalten).

## Referenzen

- `backend/src/modules/business-insights/access/evaluations-access.service.ts`
- `backend/src/modules/business-insights/access/evaluations-permission.guard.ts`
- `docs/compliance/evaluations-gdpr-privacy-by-design.md` (PII-Tiers, Prompt 46)
