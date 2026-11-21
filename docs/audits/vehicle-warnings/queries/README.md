# Queries

Read-only Reproduktionsqueries für den Vehicle-Warnings-Audit.

## Regeln

- Nur `SELECT` / read-only Prisma/API
- Jede Query dokumentiert: Zweck, `organizationId`-Scope, UTC-Zeitfenster, erwartetes Ergebnis
- Ergebnisse in `../evidence/` ablegen (anonymisiert)

## Benennung

`{purpose}_{utc-date}.sql` oder `.ts` für scripted read-only API calls
