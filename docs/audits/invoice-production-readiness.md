# Invoice Module — Production Readiness Checklist

**Release:** V4.9.475  
**Branch:** `cursor/invoice-production-ready-c2c2` → merge to `main`

## Code gates (automated)

```bash
cd backend && npm test -- --testPathPattern=invoices
cd frontend && npm test -- src/rental/components/invoices
cd frontend && npm run build
cd backend && npm run build
```

Expected: pipeline 52 scenarios green, frontend invoice suites green, builds pass.

## Ops gates (per production org)

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-document-links.ts --org=<uuid>
# Exit 0 required. On warnings:
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-invoice-document-links.ts --org=<uuid> --apply
```

Optional: `audit-fake-paid-card-invoices.ts` if CARD checkout history exists.

## Staging smoke (manual)

1. Liste → Filter → Pagination
2. Buchungsrechnung: Detail → Ausstellen → PDF → E-Mail → Teilzahlung → Vollzahlung
3. Manuelle Ausgangsrechnung: PDF erzeugen
4. Dashboard Finance-KPI → Rechnung öffnet Detail (nicht nur Liste)
5. Kunde → Finanzen → Rechnungszeile öffnet Detail
6. Notification „Rechnung überfällig“ → öffnet Rechnung
7. Stornieren (mit `invoices.write`)
8. Buchung anlegen → Rechnung muss existieren (Bootstrap-Fehler rollt Buchung zurück)

## V4.9.475 fixes (this release)

| Area | Fix |
|------|-----|
| Booking bootstrap | Fehler rollt Buchung zurück, kein Silent-Fail |
| Cancel | `POST …/invoices/:id/cancel` + UI + Permission |
| Manual PDF | Frontend-Gate für OUTGOING_MANUAL/FINAL |
| Dashboard drilldown | `invoiceId` → Detail |
| Customer finances | Klick öffnet Rechnung |
| Notifications | OPEN_BILLING + invoiceId → Detail |
| Permissions | Create/Issue/Cancel/Payment gated by `invoices.write` |
| Detail loading | Spinner beim Öffnen |

## Known limitations (non-blocking)

- Detail-URL nicht in Browser-Adressleiste (ephemerer View-State)
- Vollständige Rechnungsbearbeitung nur Notizen (kein Positions-Editor)
- Legacy `imageUrl` public URLs bei alten Eingangsrechnungen
- E2E weiterhin mock-basiert (Playwright); Staging-Smoke für Live-API

## Merge note

Invoice stack (V4.9.457–475) must be merged to `main` before standard VPS deploy (`cloud-agent-deploy.sh` clones `main`).
