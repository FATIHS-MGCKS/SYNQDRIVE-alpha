# Evidence

Read-only Beweisartefakte für den Vehicle-Warnings-Audit.

## Erlaubte Inhalte

- Anonymisierte Screenshots
- Redigierte API-Response-Auszüge
- CSV/JSON mit `VEHICLE_###` / `ORG_###` Platzhaltern
- Log-Auszüge ohne Secrets und ohne PII

## Verboten

- Vollständige Kennzeichen, Namen, E-Mails, Telefonnummern
- Connection Strings, Tokens, `.env`-Inhalte
- Unredigierte Produktions-IDs in Git (außer Commit-Hashes)

## Benennung

`{finding-id}_{surface}_{utc-date}.{ext}`

Beispiel: `VW-P1-01_fleet-command-vs-fhs_2026-07-25.csv`
