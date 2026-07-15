# Runbook: Task-Daten-Diagnose und -Reparatur

**Verbindliches Betriebs-Runbook** für das read-only Diagnosewerkzeug und das kontrollierte Reparaturskript.

| Feld | Wert |
|------|------|
| **Gültig ab** | Backend ≥ Commit `49cf87e` (enthält `TaskDataDiagnosticService` + `TaskDataRepairService`) |
| **Reparatur-Skriptversion** | `1.0.0` (`TASK_DATA_REPAIR_SCRIPT_VERSION`) |
| **Diagnose-Skript** | [`backend/scripts/ops/audit-task-data.ts`](../../backend/scripts/ops/audit-task-data.ts) |
| **Reparatur-Skript** | [`backend/scripts/ops/repair-task-data.ts`](../../backend/scripts/ops/repair-task-data.ts) |
| **Ergänzende Doku** | [`docs/task-data-diagnostic-ops.md`](../task-data-diagnostic-ops.md), [`docs/task-data-repair-ops.md`](../task-data-repair-ops.md) |

> **Grundsatz:** Diagnose ist immer read-only. Reparatur ist **standardmäßig Dry Run**; Schreiben nur mit explizitem `--apply`. **Keine unkontrollierte globale Ausführung in Produktion.**

---

## 1. Voraussetzungen

### 1.1 Benötigte Version

| Komponente | Mindestanforderung |
|------------|-------------------|
| Backend-Deployment | Commit `49cf87e` oder neuer auf `main` |
| Nest-Module | `TasksModule` exportiert `TaskDataDiagnosticService` und `TaskDataRepairService` |
| Reparatur-Skriptversion im Report | `scriptVersion: "1.0.0"` |
| Node.js / ts-node | Wie im Backend-Projekt (`backend/package.json`) |
| Abhängigkeiten | `npm ci` im Verzeichnis `backend/` ausgeführt |

Vor dem Lauf prüfen:

```bash
cd backend
git log -1 --oneline   # muss Task-Repair-Commit enthalten
npx ts-node -r tsconfig-paths/register -e "require('./src/modules/tasks/diagnostic/task-data-repair.types').TASK_DATA_REPAIR_SCRIPT_VERSION"
# Erwartung: 1.0.0
```

### 1.2 Migrationen

Folgende Migrationen müssen auf der Zieldatenbank angewendet sein:

| Migration | Relevanz |
|-----------|----------|
| `20260614000100_task_action_layer` | `org_tasks`, Events, Checklisten |
| `20260614120000_task_dedup_org_scoped` | Org-scoped `dedupKey` |
| `20260715150000_org_task_v2_additive_completion_fields` | `completion_mode`, `activates_at`, `superseded_by_task_id` |
| `20260715140000_task_automation_outbox` | Task-Automation-Retry (empfohlen, nicht direkt vom Repair-Skript benötigt) |

Prüfung:

```bash
cd backend
npx prisma migrate status
# Erwartung: keine ausstehenden Migrationen auf der Zieldatenbank
```

### 1.3 Umgebungsvariablen

| Variable | Zweck | Diagnose | Reparatur |
|----------|-------|----------|-----------|
| `DATABASE_URL` | PostgreSQL-Verbindung zur Zieldatenbank | ✓ | ✓ |
| `NODE_ENV` | `production` blockiert Lauf ohne Override | ✓ | ✓ |
| `ORG_ID` | Alias für `--organization-id` | ✓ | ✓ |
| `TASK_DATA_DIAGNOSTIC_ALLOW_REMOTE` | Nicht-lokale DB erlauben (Prod-Muster weiter blockiert) | ✓ | — |
| `TASK_DATA_DIAGNOSTIC_ALLOW_PROD` | Prod-Override Diagnose (nur mit Freigabe) | ✓ | — |
| `TASK_DATA_REPAIR_ALLOW_REMOTE` | Nicht-lokale DB erlauben (Prod-Muster weiter blockiert) | — | ✓ |
| `TASK_DATA_REPAIR_ALLOW_PROD` | Prod-Override Reparatur (nur mit Freigabe) | — | ✓ |

`.env` wird von beiden Skripten aus `backend/.env` geladen, sofern gesetzt.

**Sicherheitsregel:** Prod-URL-Muster (`synqdrive.eu`, RDS, `/opt/synqdrive/`, …) werden ohne expliziten Override **immer** abgelehnt.

### 1.4 Datenbankzugriff

| Anforderung | Details |
|-------------|---------|
| Berechtigungen | Lesezugriff für Diagnose; Lese-/Schreibzugriff auf `org_tasks`, `task_events`, `task_comments`, `task_attachments` für Reparatur |
| Netzwerk | VPN/SSH-Tunnel zur Zieldatenbank; keine öffentlich exponierte Admin-URL |
| Scope | Reparatur **immer** mit `--organization-id=<uuid>` in Staging/Produktion |
| Isolation | Lokale/Test-DB bevorzugt (`localhost`, `synqdrive_test`, …) |

Verbindung testen (read-only):

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM org_tasks;"
```

### 1.5 Verantwortlichkeiten (RACI)

| Rolle | Verantwortung |
|-------|---------------|
| **Ops / Platform** | Backup, Migrationen, Skriptausführung, Logging, Abbruch |
| **DBA** | Backup-Verifikation, Restore-Test, ggf. Point-in-Time-Recovery |
| **Domain Owner (Tasks)** | Freigabe Reparatur-Scope, Abnahme Stichproben, `unresolved`-Review |
| **Engineering** | Skriptversion, Fehleranalyse, Hotfix bei Abbruchkriterien |
| **Product / Support** | Kommunikation bei Wartungsfenster, Kunden-Stichproben |

**Freigabe vor `--apply` in Staging/Produktion:** schriftlich (Ticket) mit Org-ID, erwarteten Finding-Klassen und Rollback-Plan.

---

## 2. Backup

### 2.1 Vollständiges Backup

**Vor jedem `--apply`** — auch in Staging.

```bash
# Empfohlen: custom format (komprimiert, pg_restore-fähig)
pg_dump "$DATABASE_URL" -Fc -f "/var/backups/synqdrive-task-repair-$(date +%F-%H%M)-pre.dump"

# Alternativ: SQL-Plain (größer, aber universell lesbar)
pg_dump "$DATABASE_URL" -f "/var/backups/synqdrive-task-repair-$(date +%F-%H%M)-pre.sql"
```

Metadaten notieren: Zeitstempel, Org-ID, Git-Commit, Skriptversion `1.0.0`.

### 2.2 Verifikation des Backups

```bash
# Dateigröße > 0
ls -lh /var/backups/synqdrive-task-repair-*-pre.dump

# Integrität custom format
pg_restore --list /var/backups/synqdrive-task-repair-*-pre.dump | head -20

# Stichprobe: org_tasks vorhanden
pg_restore --schema-only /var/backups/synqdrive-task-repair-*-pre.dump 2>/dev/null | grep -c org_tasks
```

Backup gilt als **verifiziert**, wenn Liste fehlerfrei ist und kritische Tabellen (`org_tasks`, `task_events`, `task_comments`, `task_attachments`) enthalten sind.

### 2.3 Wiederherstellungstest

**Pflicht vor erstem Produktions-`--apply`** (in isolierter Test-DB):

```bash
createdb synqdrive_restore_test
pg_restore -d synqdrive_restore_test /var/backups/synqdrive-task-repair-*-pre.dump

psql synqdrive_restore_test -c "SELECT COUNT(*) FROM org_tasks WHERE organization_id = '<uuid>';"
```

Nach erfolgreichem Test: Restore-DB löschen oder für Rollback-Übung behalten.

---

## 3. Lokale beziehungsweise Testumgebung

Zweck: Skriptverhalten validieren, Reports verstehen, keine Produktionsdaten riskieren.

### 3.1 Diagnose ausführen

```bash
cd backend

# Gesamtbestand (alle Orgs in Test-DB)
npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts \
  --output=./tmp/task-audit-local.json

# Einzelne Org
npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts \
  --organization-id=<uuid> \
  --include-findings \
  --limit=25 \
  --output=./tmp/task-audit-local-<uuid>.json

# Menschenlesbar
npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts \
  --organization-id=<uuid> \
  --format=markdown \
  --output=./tmp/task-audit-local-<uuid>.md
```

### 3.2 Report prüfen

Im JSON-Report (`TaskDiagnosticReport`) prüfen:

| Feld | Prüfpunkt |
|------|-----------|
| `summary.byCheck` | Welche Problemklassen betroffen? |
| `summary.byCategory` | Schwerpunkt `done_integrity`, `active_duplicates`, …? |
| `checks[].sampleTaskIds` | Maskierte IDs für manuelle Stichproben |
| `findings` | Nur mit `--include-findings`; IDs maskiert (`abcd…wxyz`) |

**Nicht reparierbar / nur dokumentiert** (bewusst im Repair-Skript ausgelassen oder `unresolved`):

- `missing_link_*`, `cross_org_*`
- `done_contradictory_resolution_note`, `done_with_cancelled_at`
- `audit_status_event_mismatch` (Konflikt letztes Event vs. Status)
- `legacy_automation_source`, `legacy_dedup_key_format` (Info)
- `timing_future_activates_legacy_visible` (kein Auto-Fix)

### 3.3 Backfill im Dry Run

```bash
cd backend

npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts \
  --organization-id=<uuid> \
  --output=./tmp/task-repair-local-dryrun-<uuid>.json
```

Erwartung:

- `dryRun: true`, `apply: false`
- `actions[]` mit geplanten Änderungen (`applied: false`)
- `unresolved[]` für unklare Fälle
- `diagnosticBefore` eingebettet
- Stderr-Hinweis: *Dry-run only — pass --apply to execute repairs.*

**Kein `--apply` in diesem Schritt.**

### 3.4 Apply (nur Test-DB)

```bash
cd backend

npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts \
  --organization-id=<uuid> \
  --apply \
  --batch-size=20 \
  --output=./tmp/task-repair-local-apply-<uuid>.json
```

Transaktionsmodell:

- **Ein Task pro Transaktion** bei Backfills (`completionMode`, Events, Timing-Korrekturen)
- **Batch-Größe** (Default `20`) steuert parallele Chunks bei `supersedeTask`
- Kommentare/Anhänge werden **umgehängt**, nicht gelöscht

### 3.5 Erneute Diagnose

```bash
cd backend

npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts \
  --organization-id=<uuid> \
  --output=./tmp/task-audit-local-post-<uuid>.json
```

Vergleich **vorher/nachher**: `summary.byCheck` und `summary.totalFindings` müssen für reparierte Klassen sinken. Verbleibende Findings in `unresolved`-Kategorien dokumentieren.

---

## 4. Staging

Gleiche Schritte wie lokal, aber mit produktionsnaher Datenkopie und Freigabe.

### 4.1 Ablauf (Checkliste)

- [ ] Backup (Abschnitt 2)
- [ ] `npx prisma migrate status` — keine offenen Migrationen
- [ ] Diagnose mit Report-Archivierung
- [ ] Repair Dry Run + Review mit Domain Owner
- [ ] Repair `--apply` mit `--organization-id`
- [ ] Erneute Diagnose
- [ ] Stichproben + Smoke-Tests (4.3)
- [ ] Ergebnisreport (Abschnitt 8)

Bei Remote-Staging-DB ggf.:

```bash
TASK_DATA_DIAGNOSTIC_ALLOW_REMOTE=1 npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts ...
TASK_DATA_REPAIR_ALLOW_REMOTE=1 npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts ...
```

### 4.2 Stichproben nach Problemklassen

| Problemklasse | Diagnose-`checkId` | Stichprobe nach Repair |
|---------------|-------------------|------------------------|
| DONE ohne Abschlussart | `done_missing_completion_mode` | Task-Detail: `completionMode` gesetzt (`MANUAL` / `AUTO_RESOLVED` / `SUPERSEDED`) |
| DONE ohne Event | `done_missing_completion_event` | Timeline: `STATUS_CHANGED`→`DONE`, `AUTO_RESOLVED` oder `SUPERSEDED`; Metadata `provenance: BACKFILL` |
| Buchungs-Duplikate | `multiple_booking_preparation` | Pro Booking max. ein aktiver `BOOKING_PREPARATION`; übrige `SUPERSEDED` |
| Dokument-Duplikate | `multiple_document_review_phase` | Ein aktiver `DOCUMENT_REVIEW` pro Phase; Kommentare/Anhänge am kanonischen Task |
| Cleaning-Duplikate | `multiple_vehicle_cleaning_window` | Ein aktiver `VEHICLE_CLEANING` pro Fahrzeug-Fenster |
| Invoice-Duplikate | `multiple_invoice_payment_task` | Ein aktiver Invoice-Payment-Task pro Rechnung |
| Timing | `timing_activates_after_due` | `activatesAt <= dueDate` auf aktiven Tasks |
| Legacy-Checkliste | `done_with_open_required_checklist` | Checklisten **offen**; Metadata `legacyChecklistInconsistency` + Event `LEGACY_CHECKLIST_INCONSISTENCY` |

SQL-Stichprobe (Beispiel Duplikate):

```sql
SELECT dedup_key, COUNT(*) AS active_count
FROM org_tasks
WHERE organization_id = '<uuid>'
  AND status IN ('OPEN', 'IN_PROGRESS', 'WAITING')
  AND dedup_key IS NOT NULL
GROUP BY dedup_key
HAVING COUNT(*) > 1;
```

### 4.3 API- und UI-Smoke-Tests

Nach `--apply` in Staging:

| Bereich | Prüfung |
|---------|---------|
| **Task-Liste / Today** | Geplante Tasks (`activatesAt` in der Zukunft) erscheinen **nicht** im Today-Scope |
| **Task-Detail** | Timeline konsistent; kein DONE ohne sichtbare Abschlussart |
| **Booking-Tasks** | Vorbereitung/Pickup/Return je Buchungsphase plausibel |
| **Document-Tasks** | Paket-Task zeigt konsolidierte Kommentare/Anhänge |
| **Cleaning-Tasks** | Kein doppelter offener Reinigungs-Task pro Fahrzeug |
| **Invoice-Tasks** | Payment-Check-Task eindeutig pro Rechnung |
| **Service-/Insight-Tasks** | Keine Regression bei offenen Service-Cases |

API (Beispiel — Endpunkte gemäß Tasks-Modul):

- `GET /tasks?scope=today` — keine zukünftig aktivierten Tasks
- `GET /tasks/:id` — Detail inkl. Events und `completionMode`
- `GET /bookings/:id` — verknüpfte Lifecycle-Tasks

Bei Fehlern: **kein weiteres `--apply`**; Abschnitt 6 (Rollback) prüfen.

---

## 5. Produktion

### 5.1 Wartungsfenster / risikoarmer Zeitpunkt

| Kriterium | Empfehlung |
|-----------|------------|
| Zeitfenster | Geringe Buchungs-/Operatoren-Last (z. B. Nacht / Wochenende) |
| Vorlauf | Task-Automation-Outbox stabil (`task_automation_outbox` ohne wachsendes `DEAD_LETTER`-Backlog) |
| Kommunikation | Interne Ankündigung; Support informiert |
| Dauerplanung | ~5–15 Min. pro Org bei moderaten Findings (abhängig von `batch-size` und Finding-Anzahl) |

### 5.2 Organisationsweises Vorgehen (Pflicht)

**Verboten in Produktion:**

```bash
# ❌ Kein Apply ohne Org-Scope
npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts --apply

# ❌ Kein Apply über alle Orgs
npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts --apply --organization-id=*
```

**Erlaubt (eine Org pro Lauf):**

```bash
cd backend

# 1) Diagnose
npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts \
  --organization-id=<uuid> \
  --output=/var/log/synqdrive/task-audit-prod-<uuid>-$(date +%F).json

# 2) Dry Run
npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts \
  --organization-id=<uuid> \
  --output=/var/log/synqdrive/task-repair-prod-dryrun-<uuid>-$(date +%F).json

# 3) Freigabe durch Domain Owner — dann Apply
TASK_DATA_REPAIR_ALLOW_PROD=1 \
  npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts \
  --organization-id=<uuid> \
  --apply \
  --batch-size=20 \
  --output=/var/log/synqdrive/task-repair-prod-apply-<uuid>-$(date +%F).json

# 4) Post-Diagnose
npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts \
  --organization-id=<uuid> \
  --output=/var/log/synqdrive/task-audit-prod-post-<uuid>-$(date +%F).json
```

Nächste Org erst nach Abnahme der vorherigen (Abschnitt 7).

### 5.3 Batchgröße

| Szenario | `--batch-size` |
|----------|----------------|
| Default | `20` (entspricht `TasksService.TERMINAL_TRANSITION_BATCH_SIZE`) |
| Große Duplikat-Gruppen | `10` — geringere Parallelität |
| Kleine Org / wenige Findings | `20` beibehalten |
| Fehler/Timeouts | Batch halbieren und Lauf wiederholen (idempotent) |

### 5.4 Logging

| Quelle | Inhalt |
|--------|--------|
| Skript-Stdout | Vollständiger JSON-`TaskRepairReport` |
| `--output=...` | Archivkopie des Reports (Pflicht in Prod) |
| `auditLog[]` im Report | Chronologie: `info`, `action`, `skip`, `error` |
| Nest-Logger | `TaskDataRepairService` Fehler bei einzelnen Actions |
| Shell | Start/Ende-Zeit, Org-ID, Operator, Git-Commit notieren |

Report-Felder für Ops-Logbuch:

- `generatedAt`, `scriptVersion`, `organizationId`
- `summary.planned`, `summary.applied`, `summary.errors`
- `summary.unresolved`, `summary.skipped`

### 5.5 Abbruchkriterien

Lauf **sofort stoppen** (kein weiteres `--apply`, ggf. Rollback), wenn:

| Kriterium | Schwelle |
|-----------|----------|
| `summary.errors` | > 0 nach Apply |
| Unerwartete Action-Typen | Actions außerhalb der dokumentierten Repair-Regeln |
| Massenhafte `unresolved` | Deutlich mehr als im Dry Run |
| API/UI-Regression | Falsche Tasks im Today-Scope, fehlende Timelines |
| Datenbank-Fehler | Deadlocks, FK-Verletzungen, Transaktionsabbrüche |
| Operator-Unsicherheit | Abweichung vom freigegebenen Dry-Run-Report |

Nach Abbruch: Post-Diagnose, Incident-Ticket, Rollback-Entscheidung (Abschnitt 6).

### 5.6 Keine unkontrollierte globale Ausführung

- Immer **eine `organization-id` pro Apply-Lauf**
- Dry Run und Apply **getrennt** dokumentieren
- Prod-Override `TASK_DATA_REPAIR_ALLOW_PROD=1` nur mit Ticket-Freigabe
- Kein paralleles Apply auf dieselbe Org
- Kein Apply während ungeklärter Outbox-`DEAD_LETTER`-Störung (siehe [`docs/task-automation-outbox-ops.md`](../task-automation-outbox-ops.md))

---

## 6. Rollback

### 6.1 Datenbank-Restore

Wenn Apply irreversible Schäden verursacht oder Abbruchkriterien greifen:

```bash
# App-Writes minimieren (Wartungsmodus / Worker pausieren — org-spezifisch)

# Restore auf Staging zur Validierung
pg_restore -d synqdrive_rollback_validate /var/backups/synqdrive-task-repair-*-pre.dump

# Nach Freigabe: Produktion (Beispiel — konkrete PITR-Strategie mit DBA abstimmen)
pg_restore --clean --if-exists -d "$DATABASE_URL" /var/backups/synqdrive-task-repair-*-pre.dump
```

**Hinweis:** Restore betrifft die **gesamte Datenbank**, nicht nur Tasks. Nur mit DBA und Change-Freigabe.

### 6.2 Umgang mit bereits erzeugten Audit-Events

Das Repair-Skript erzeugt u. a.:

| Event-Typ | Bedeutung |
|-----------|-----------|
| `DATA_REPAIR_BACKFILL` | Feld-Backfill (`completionMode`, `completedAt`, Ressourcen-Umhängung) |
| `STATUS_CHANGED` / `AUTO_RESOLVED` / `SUPERSEDED` | Backfill-Abschluss-Events mit `metadata.provenance: BACKFILL` |
| `LEGACY_CHECKLIST_INCONSISTENCY` | Dokumentation offener Checklisten |
| `ASSIGNED` | Backfill fehlender Zuweisungs-Events |
| `SUPERSEDED` (via `TasksService`) | Duplikat-Konsolidierung |

**Nach DB-Restore:** Events aus dem Repair-Fenster sind mit zurückgesetzt.

**Ohne Full-Restore (nur dokumentarisch):**

- BACKFILL-Events sind **historische Audit-Spur** — nicht löschen, außer via Restore
- UI sollte `provenance: BACKFILL` und `scriptVersion` in Event-Metadata anzeigen können
- Kein manuelles Löschen von Nutzerkommentaren/-anhängen

### 6.3 Deployment-Rollback

Wenn Fehler im Skript/Code vermutet werden:

```bash
# Auf letztes bekanntes gutes Backend-Release zurück
git checkout <previous-release-tag>
# Redeploy gemäß Standard-Release-Prozess (z. B. vps-deploy-release.sh)
```

Deployment-Rollback **ersetzt nicht** DB-Restore, wenn `--apply` bereits gelaufen ist.

---

## 7. Abnahme

Org gilt als abgenommen, wenn alle Kriterien erfüllt sind:

### 7.1 Diagnose-Kriterien

| Kriterium | Erwartung |
|-----------|-----------|
| Keine aktiven semantischen Duplikate | `active_duplicate_dedup_key`, `multiple_booking_preparation`, `multiple_document_review_phase`, `multiple_vehicle_cleaning_window`, `multiple_invoice_payment_task` = **0** |
| DONE mit Abschlussart | `done_missing_completion_mode` = **0** (oder nur bewusst `unresolved` mit Ticket) |
| Korrekte Timeline | `done_missing_completion_event`, `audit_auto_close_without_event` = **0** für reparierte Tasks |
| Geplante Tasks nicht im Today-Scope | Keine aktiven Tasks mit `activates_at > now()` in Today-Listen; `timing_future_activates_legacy_visible` dokumentiert (kein Auto-Fix) |

Post-Diagnose-Befehl:

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts \
  --organization-id=<uuid> \
  --format=console
```

### 7.2 Manuelle Stichproben

Mindestens **3 Tasks pro Kategorie** (oder alle, wenn weniger vorhanden):

| Kategorie | Task-Typen | Prüfung |
|-----------|------------|---------|
| **Service** | `INSIGHT_*`, service-verknüpft | Status, Links, keine Duplikate |
| **Booking** | `BOOKING_PREPARATION`, `BOOKING_PICKUP`, `BOOKING_RETURN` | Ein Task pro Phase/Dedup-Scope |
| **Document** | `DOCUMENT_REVIEW` (`document:package:*`) | Kanonischer Task, Anhänge vollständig |
| **Cleaning** | `VEHICLE_CLEANING` | Ein offener Task pro Fahrzeug-Fenster |
| **Invoice** | `INVOICE_REQUIRED` / Payment-Check | Ein aktiver Task pro `invoiceId` |

### 7.3 Abnahmeprotokoll (Vorlage)

```text
Org-ID:           <uuid>
Operator:         <name>
Datum/Zeit:       <ISO-8601>
Git-Commit:       <sha>
Skriptversion:    1.0.0
Dry-Run-Report:   <pfad>
Apply-Report:     <pfad>
Post-Audit:       <pfad>
Findings vorher:  <n>
Findings nachher: <n>
Unresolved:       <n> (Ticket: <id>)
Abnahme:          ja/nein — <Domain Owner>
```

---

## 8. Ergebnisreport

Nach jedem Lauf (Dry Run **und** Apply) ist ein archivierter JSON-Report Pflicht.

### 8.1 Pflichtfelder

| Feld im `TaskRepairReport` | Bedeutung |
|----------------------------|-----------|
| `tasksScanned` | Anzahl analysierter Tasks |
| `summary.planned` | Geplante Änderungen |
| `summary.applied` | Tatsächlich ausgeführte Änderungen (nur bei `--apply`) |
| `summary.unresolved` | Ausgelassene unklare Fälle (nicht geraten) |
| `summary.skipped` | Bewusst übersprungene Regeln |
| `summary.errors` | Fehler bei Apply |
| `summary.byAction` | Aufschlüsselung nach `actionId` |
| `actions[]` | Vollständiger Änderungsreport (`before` / `after`, `applied`) |
| `unresolved[]` | Details zu unklaren Fällen |
| `auditLog[]` | Zeitliche Abfolge |
| `diagnosticBefore` / `diagnosticAfter` | Diagnose-Snapshot |
| `generatedAt` | Endzeitpunkt (für Dauerberechnung) |

### 8.2 Dauer ermitteln

```bash
# Beispiel: Start- und Endzeit manuell erfassen
date -u +%Y-%m-%dT%H:%M:%SZ   # START
# ... Skriptlauf ...
date -u +%Y-%m-%dT%H:%M:%SZ   # ENDE
```

Oder aus Report:

```bash
jq '{generatedAt, tasksScanned, planned: .summary.planned, applied: .summary.applied, unresolved: .summary.unresolved, errors: .summary.errors}' \
  /var/log/synqdrive/task-repair-prod-apply-<uuid>-*.json
```

### 8.3 Management-Zusammenfassung (Vorlage)

```text
Task Data Repair — Ergebnis
===========================
Umgebung:         Produktion / Staging / Lokal
Organisation:     <uuid> (<name>)
Zeitraum:         <start> — <end> (Dauer: <min>)
Skriptversion:    1.0.0
Modus:            Dry Run / Apply

Tasks analysiert: <tasksScanned>
Änderungen geplant:<summary.planned>
Änderungen applied:<summary.applied>
Unklar (skipped): <summary.unresolved> unresolved, <summary.skipped> skipped
Fehler:           <summary.errors>

Top Actions:
  - backfill_completion_mode: <n>
  - supersede_duplicate_task: <n>
  - document_legacy_checklist_inconsistency: <n>
  ...

Diagnose vorher:  <totalFindings> Findings
Diagnose nachher: <totalFindings> Findings

Reports:
  - <pfad-dryrun>
  - <pfad-apply>
  - <pfad-post-audit>
```

---

## Anhang: Schnellreferenz Kommandos

```bash
cd backend

# Diagnose
npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts --organization-id=<uuid>

# Repair Dry Run (Default)
npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts --organization-id=<uuid>

# Repair Apply
npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts --organization-id=<uuid> --apply

# Mit Report-Datei und Batch
npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts \
  --organization-id=<uuid> --apply --batch-size=20 --output=./tmp/task-repair.json
```

---

*Letzte Aktualisierung: 2026-07-15 — Runbook-Version 1.0 (Skript `TASK_DATA_REPAIR_SCRIPT_VERSION=1.0.0`)*
