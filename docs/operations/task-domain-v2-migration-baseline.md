# Task Domain V2 — Migrations-Baseline

**Stand:** 2026-07-15  
**Bezug:** Audit P1 „Baseline `org_tasks` nicht in Migrations-Historie“

## Kontext

Die Tabelle `org_tasks` und die ursprünglichen Task-Enums (`TaskStatus`, `TaskPriority`) stammen aus einer **Baseline**, die vor der versionierten Prisma-Migrationshistorie in Produktion angelegt wurde. Alle Task-Migrationen im Repository sind **additive `ALTER TABLE "org_tasks"`**-Schritte — es gibt **kein** `CREATE TABLE "org_tasks"` in `backend/prisma/migrations/`.

Dasselbe gilt für ältere Enum-Werte: z. B. `TaskStatus`/`TaskPriority` werden in Migrationen referenziert, aber nicht erneut erzeugt.

## Auswirkung

| Szenario | Ergebnis |
|----------|----------|
| **Bestehende Produktion/Staging** | `prisma migrate deploy` wendet nur additive DDL an — erwarteter Pfad |
| **Greenfield nur aus Migrations** | `org_tasks` fehlt — Deploy **unvollständig** ohne Baseline |

## Empfohlene Deployment-Reihenfolge

1. Sicherstellen, dass die Zieldatenbank die Baseline-Tabelle `org_tasks` bereits enthält (Produktions-Restore, Staging-Klon oder dokumentierter Squash-Baseline-Dump).
2. `prisma migrate deploy` (additive Task-V2-Migrationen in chronologischer Reihenfolge).
3. Optional: `npm run ops:audit-task-data` (Diagnose) und `npm run ops:repair-task-data -- --dry-run` (Backfill-Plan) **nur** gegen lokale/Test-DB.
4. Anwendungs-Deploy mit Task Domain V2 Backend/Frontend.

## Nachweise im Repo

- Erste Task-Änderung: `20260614000000_task_status_waiting`
- Action Layer: `20260614000100_task_action_layer`
- V2-Abschlussfelder: `20260715150000_org_task_v2_additive_completion_fields`
- Fine/Invoice-Links: `20260715170000_org_task_fine_invoice_links`
- Assignee+Status-Index: `20260715180000_org_task_assignee_status_index`
- `activatesAt` NOT NULL: `20260715181000_org_task_activates_at_not_null`
- Outbox (Timestamp-Fix): `20260715140100_task_automation_outbox`

## Prisma-Validator-Hinweis

`npm run prisma:validate` kann eine **unrelated** `SetNull`-Warnung auf required FKs außerhalb der Task-Domain melden. Kein Task-Deploy-Blocker; FK-`onDelete`-Policy separat prüfen.

## Kein Squash in diesem Schritt

Ein vollständiger Squash-Baseline-Dump der Legacy-`org_tasks`-DDL ist **bewusst nicht** Teil dieses Repos — Produktionsdatenbanken besitzen die Baseline bereits. Greenfield-Umgebungen müssen einen dokumentierten DB-Snapshot oder manuellen Baseline-Import verwenden.
