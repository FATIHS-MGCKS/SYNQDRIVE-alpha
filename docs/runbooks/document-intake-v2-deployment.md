# Runbook: Document Intake V2 — schrittweises Deployment

**Verbindliches Betriebs-Runbook** für das kontrollierte, phasenweise Aktivieren von Document Intake V2 in Produktion.

| Feld | Wert |
|------|------|
| **Gültig ab** | Backend ≥ V4.9.657 (V2-Metriken, Action-Plan-Orchestrator, Org-Upload, Archive-Read-Model) |
| **Status** | **Dokumentation only** — keine produktive Aktion durch dieses Runbook selbst |
| **Monitoring** | [`docs/architecture/document-intake-v2-grafana-prometheus-ops.md`](../architecture/document-intake-v2-grafana-prometheus-ops.md) |
| **Shadow-Validierung** | [`document-intake-v2-shadow-validation.md`](./document-intake-v2-shadow-validation.md) |
| **Deploy-Skript (VPS)** | [`backend/scripts/ops/vps-deploy-release.sh`](../../backend/scripts/ops/vps-deploy-release.sh) |
| **Env-Vorlage** | [`backend/.env.example`](../../backend/.env.example) |
| **Tests** | [`docs/testing/document-intake-v2-backend-coverage.md`](../testing/document-intake-v2-backend-coverage.md), [`docs/testing/document-intake-v2-frontend-e2e-coverage.md`](../testing/document-intake-v2-frontend-e2e-coverage.md) |

> **Grundsatz:** Code zuerst deployen, **Apply und Executor-Wirkung aus**. Pipeline (Upload → OCR → Klassifikation → Extraktion → Review) darf laufen; **kein** breites Confirm/Apply ohne abgeschlossene Shadow-Validierung und repräsentative Stichprobe (PDF, Bild, relevante Dokumenttypen). Keine Dokument-IDs oder Kennzeichen in Prometheus-Labels.

---

## Phasenübersicht (14 Schritte)

| Schritt | Inhalt | Haupt-Hebel |
|--------|--------|-------------|
| **1** | Backup und Restore-Nachweis | `pg_dump`, Staging-Restore |
| **2** | Migration | `prisma migrate deploy` |
| **3** | Deploy mit V2-Apply **deaktiviert** | Rollout-Flags (§3) |
| **4** | Runtime-/Worker-Stabilität | Queue, PM2, Recovery, Grafana |
| **5** | Org-first Upload | Org-Upload-API, Rate-Limits |
| **6** | Classification / Extraction | Queue + Mistral, Golden Corpus |
| **7** | Entity Resolution (Vorschlagsmodus) | Review-UI, **kein** Auto-Link |
| **8** | Action Plans nur Dry Run | Preview-API, Confirm gesperrt |
| **9** | Vergleich mit Nutzerentscheidungen | Shadow-Report, Stichproben |
| **10** | Einzelne sichere Executors aktivieren | Executor-Allowlist |
| **11** | Follow-ups | Suggestion → Accept (Canary) |
| **12** | Archiv | Archive-Index + ARCHIVE_DOCUMENT |
| **13** | Security-Funktionen | Malware, Rate-Limits, Retention dry-run |
| **14** | Legacy-Apply deaktivieren | Orchestrator-only für V2-Typen |

**Verboten ohne Incident:** Breite Confirm-Freigabe für alle Orgs, Massen-Apply ohne Stichprobe, `DOCUMENT_RETENTION_DRY_RUN=false` ohne DBA-Freigabe.

---

## Rollout-Flags (Zielvertrag)

Die folgenden Variablen sind der **operative Vertrag** für schrittweises Rollout. Vor Produktions-Phase 3 müssen sie in `backend.env` gepflegt sein (Implementierung: Inventory Prompt 74 / Engineering-Ticket).

| Variable | Phase-0 Default | Bedeutung |
|----------|-----------------|-----------|
| `DOCUMENT_INTAKE_V2_APPLY_ENABLED` | `false` | Blockiert `executeConfirmedPlan` / Confirm→Apply für V2-Orchestrator-Pfad |
| `DOCUMENT_INTAKE_V2_LEGACY_APPLY_ENABLED` | `true` | Erlaubt `DocumentExtractionApplyService.apply` für nicht-orchestrierte Typen |
| `DOCUMENT_INTAKE_V2_EXECUTOR_ALLOWLIST` | leer | Komma-getrennte `semanticAction`-Namen; leer = keine Executor-Ausführung |
| `DOCUMENT_INTAKE_V2_FOLLOW_UP_MATERIALIZE_ENABLED` | `false` | Follow-up Accept → Task-Materialisierung |
| `DOCUMENT_INTAKE_V2_ARCHIVE_APPLY_ENABLED` | `false` | `ARCHIVE_DOCUMENT`-Executor |
| `DOCUMENT_INTAKE_V2_ORG_UPLOAD_ENABLED` | `true` | Org-scoped Upload (`POST .../organizations/:orgId/...`) |
| `DOCUMENT_INTAKE_V2_ENTITY_AUTO_SELECT_ENABLED` | `false` | Kein automatisches Übernehmen von Entity-Rank-1 ohne User-Bestätigung |

**Bereits im Code (ohne V2-Prefix):**

| Variable | Default | Phase |
|----------|---------|-------|
| `DOCUMENT_EXTRACTION_QUEUE_ENABLED` | `true` | 4+ |
| `DOCUMENT_AI_EXTRACTION_ENABLED` | `true` | 6 |
| `DOCUMENT_MALWARE_SCAN_ENABLED` | `false` | 13 (Canary `true`) |
| `DOCUMENT_UPLOAD_RATE_LIMIT_ENABLED` | `true` | 5, 13 |
| `DOCUMENT_EXTRACTION_ACTION_RECOVERY_ENABLED` | `true` | 4 (Shadow: optional `false`) |
| `DOCUMENT_RETENTION_ENABLED` | `false` | 13 |
| `DOCUMENT_RETENTION_DRY_RUN` | `true` | 13 — **niemals** `false` ohne Freigabe |
| `WORKERS_ENABLED` | `true` | 4 |

**Workaround bis Flags implementiert:** Confirm nur für interne Master-Admin-Testaccounts; Endnutzer dürfen Upload/Review, aber kein `POST .../confirm`. UI: Confirm-Button nur wenn explizites Ops-Flag gesetzt.

---

## 1. Backup und Restore-Nachweis

### 1.1 Wann

- **Pflicht** vor jedem Produktions-Deploy mit Document-Extraction-Prisma-Migrationen
- **Pflicht** vor Aktivierung der Schritte 5–14
- **Empfohlen** vor erstem Retention-Dry-Run

### 1.2 Automatisches Pre-Deploy-Backup (VPS)

`vps-deploy-release.sh` erstellt vor jedem Release:

```bash
sudo -u postgres pg_dump synqdrive | gzip > /opt/synqdrive/shared/backups/db-pre-deploy-<TS>.sql.gz
```

Zusätzlich: Root-Filesystem &lt; 90 % (sonst Deploy-Abbruch).

### 1.3 Manuelles Backup

```bash
pg_dump "$DATABASE_URL" -Fc -f "/var/backups/synqdrive-document-intake-$(date -u +%Y%m%d%H%M%S)-pre.dump"
```

**Objekt-Storage:** `LOCAL_DOCUMENT_STORAGE_DIR` bzw. `/opt/synqdrive/shared/storage/documents` — separat sichern wenn Provider `local`.

### 1.4 Restore-Verifikation (Pflicht)

Nur auf isolierter Staging-/Restore-Instanz:

```bash
createdb synqdrive_restore_test
pg_restore -d synqdrive_restore_test /var/backups/synqdrive-document-intake-<TS>-pre.dump

psql synqdrive_restore_test -c "
  SELECT COUNT(*) FROM vehicle_document_extractions;
  SELECT COUNT(*) FROM document_extraction_archive_index;
  SELECT COUNT(*) FROM document_extraction_content_anchors;
"

cd backend && DATABASE_URL=postgresql://.../synqdrive_restore_test npx prisma migrate status
```

**Exit-Kriterium:** Restore erfolgreich, Extraktions- und Archiv-Tabellen lesbar, `_prisma_migrations` konsistent.

---

## 2. Migration

### 2.1 Relevante Bereiche

Document Intake V2 nutzt u. a.:

- `vehicle_document_extractions` (Status, Plausibility-JSON, Action-Plan-State)
- `document_extraction_archive_index`
- `document_extraction_content_anchors` (Duplicate-Policy)
- Org-Upload-Felder (`organizationId`, `uploadContextType`, …)

Vor Deploy: `git log backend/prisma/migrations` auf additive Document-Migrationen prüfen.

### 2.2 Prüfung

```bash
cd backend
npx prisma migrate status
npm run test:document-intake:v2:verify
```

### 2.3 Deploy-Ablauf (VPS)

Automatisch im Release-Skript: `npm ci` → `prisma generate` → `prisma migrate deploy` → Build → PM2 restart.

### 2.4 Rollback Migration

Kein `migrate reset` auf Produktion. Rollback = Flags aus + ggf. Code-Revert (§15).

---

## 3. Deployment mit V2-Apply deaktiviert

### 3.1 Ziel

- Neuer Code + Schema auf Produktion
- Pipeline bis `READY_FOR_REVIEW` erlaubt
- **Kein** Orchestrator-Apply, **kein** Legacy-Apply für V2-Typen in Canary (Confirm blockiert)

### 3.2 Pflicht-`backend.env`-Block

```bash
# ── Document Intake V2 — Phase 0/3 (Apply AUS) ──
DOCUMENT_INTAKE_V2_APPLY_ENABLED=false
DOCUMENT_INTAKE_V2_LEGACY_APPLY_ENABLED=true
DOCUMENT_INTAKE_V2_EXECUTOR_ALLOWLIST=
DOCUMENT_INTAKE_V2_FOLLOW_UP_MATERIALIZE_ENABLED=false
DOCUMENT_INTAKE_V2_ARCHIVE_APPLY_ENABLED=false
DOCUMENT_INTAKE_V2_ENTITY_AUTO_SELECT_ENABLED=false

DOCUMENT_EXTRACTION_QUEUE_ENABLED=true
DOCUMENT_AI_EXTRACTION_ENABLED=true
DOCUMENT_EXTRACTION_ACTION_RECOVERY_ENABLED=false
DOCUMENT_MALWARE_SCAN_ENABLED=false

DOCUMENT_RETENTION_ENABLED=false
DOCUMENT_RETENTION_DRY_RUN=true

WORKERS_ENABLED=true
```

### 3.3 Deploy

```bash
git push origin main
bash .cursor/scripts/cloud-agent-deploy.sh
```

### 3.4 Exit-Kriterien

| Check | Erwartung |
|-------|-----------|
| `GET /api/v1/health` | 200, `documentExtraction: ok` |
| `GET /document-extractions/health` | Queue enabled, workers ok |
| Confirm in Prod (Canary-User) | **403/Policy** oder UI ohne Confirm — kein `APPLIED` |
| Grafana `synqdrive-document-intake-v2` | Panels erreichbar |

**Wartezeit:** mindestens 30 Minuten stabiler Health nach Deploy.

---

## 4. Runtime- und Worker-Stabilität prüfen

### 4.1 Komponenten

| Komponente | Detail |
|------------|--------|
| Queue | `document.extraction`, Job-ID `extract-{extractionId}`, Concurrency 3 |
| Processor | `DocumentExtractionProcessor` |
| Recovery | `DocumentExtractionRecoveryScheduler` (120 s) |
| Action Recovery | `DocumentIntakeActionRecoveryScheduler` (nur wenn Apply aktiv) |

### 4.2 Prüfungen

```bash
curl -sf https://app.synqdrive.eu/api/v1/health
pm2 list
curl -s https://app.synqdrive.eu/api/v1/metrics | grep -E 'document_extraction_queue_age|document_extraction_active_jobs|queue_failed_jobs{queue="document.extraction"}'
```

### 4.3 Metrik-Gates (24 h)

| Metrik | Schwelle |
|--------|----------|
| `synqdrive_document_extraction_queue_age_seconds` | &lt; 600 s (Alert bei &gt; 600) |
| `synqdrive_document_extraction_active_jobs` | &gt; 0 bei Backlog, 0 bei leerer Queue ok |
| `synqdrive_queue_failed_jobs{queue="document.extraction"}` | &lt; 5 |
| PM2 restart count | Kein stündlicher Anstieg |

### 4.4 Abbruch

Alert `DocumentExtractionWorkersIdleWithQueue` &gt; 10 min → Queue/Worker-Incident, **keine** weiteren Phasen.

---

## 5. Org-first Upload

### 5.1 Aktivierung

1. `DOCUMENT_INTAKE_V2_ORG_UPLOAD_ENABLED=true` (wenn Flag vorhanden)
2. Canary-Org (1) — interne Pilotnutzer
3. Frontend: `DocumentUploadView` + `POST /organizations/:orgId/document-extractions/upload`

### 5.2 Verifikation

| Check | Erwartung |
|-------|-----------|
| `synqdrive_document_upload_total{scope="org"}` | Steigend |
| `synqdrive_document_upload_rejected_total` | &lt; 10 % (Rate-Limit/MIME) |
| Duplicate-Policy | `synqdrive_document_duplicate_total` dokumentiert |
| Tenant-Isolation | Fremde Org → 404 (Tests: `document-intake-v2-tenant-isolation`) |

### 5.3 Stichprobe

Mindestens je **1 PDF** und **1 Bild** (JPEG/PNG) pro Canary-Org — siehe § Shadow-Stichprobe.

---

## 6. Classification und Extraction

### 6.1 Voraussetzungen

- Schritt 4 stabil
- `MISTRAL_API_KEY` gesetzt
- `DOCUMENT_AI_EXTRACTION_ENABLED=true`

### 6.2 Verifikation

| Metrik / Check | Erwartung |
|----------------|-----------|
| `synqdrive_document_ocr_total` | &gt; 0 |
| OCR p95 (`document_extraction_duration_seconds{stage="OCR"}`) | &lt; 120 s |
| `synqdrive_document_classification_total` | Verteilung plausibel |
| `synqdrive_document_extraction_total` | READY_FOR_REVIEW erreicht |
| Golden Corpus (CI) | `npm run test:document-intake:v2` grün |

### 6.3 AWAITING_DOCUMENT_TYPE

Erwartet bei niedriger AUTO-Konfidenz. `synqdrive_document_awaiting_type_total` dokumentieren — kein Massen-Backlog ohne Operator-Kapazität.

---

## 7. Entity Resolution im Vorschlagsmodus

### 7.1 Verhalten

- Entity-Kandidaten in `plausibility._pipeline` (vehicle/booking/customer/driver/partner)
- **User** bestätigt Links über Entity-Review-UI (`PATCH entity-links`)
- `DOCUMENT_INTAKE_V2_ENTITY_AUTO_SELECT_ENABLED=false` — kein Auto-Rank-1-Apply

### 7.2 Verifikation

| Metrik | Nutzen |
|--------|--------|
| `synqdrive_document_entity_candidate_total` by `confidence` | HIGH/MEDIUM/LOW-Verteilung |
| Manuelle Stichprobe | VIN/Kennzeichen-Konflikte → BLOCKER, nicht still angewendet |

### 7.3 Exit

Mindestens 10 Dokumente mit manueller Entity-Review in Canary; keine ungeklärten BLOCKER-Overrides.

---

## 8. Action Plans nur Dry Run

### 8.1 Erlaubt

- `save-review` / Schema-Feld-Review
- `GET action-plan-preview` — Plan + Fingerprint
- `synqdrive_document_action_plan_total{outcome="preview"}`

### 8.2 Verboten

- `POST confirm` mit Apply (`DOCUMENT_INTAKE_V2_APPLY_ENABLED=false`)
- `synqdrive_document_action_total{outcome="succeeded"}` sollte **0** bleiben

### 8.3 Verifikation

Operatoren prüfen Action-Plan-Karten (Deutsch, READY/BLOCKED/DISABLED) ohne Apply-Wirkung.

---

## 9. Vergleich mit Nutzerentscheidungen

Siehe [`document-intake-v2-shadow-validation.md`](./document-intake-v2-shadow-validation.md):

- Shadow-Report / Reconciliation
- Feld-Korrekturrate, Klassifikations-Overrides, Entity-Link-Entscheidungen
- **Minimum 28 Tage** Beobachtung oder ≥ 30 dokumentierte Canary-Dokumente

**Kein breiter Rollout** ohne repräsentative Stichprobe über Dokumenttypen (mindestens: FINE, INVOICE, SERVICE, ARCHIVE-Typ, DAMAGE oder TECHNICAL, je 1 PDF + 1 Bild wo sinnvoll).

---

## 10. Einzelne sichere Executors aktivieren

### 10.1 Reihenfolge (empfohlen)

1. `ARCHIVE_DOCUMENT` (metadata-only, idempotent)
2. `LINK_ENTITY_*` (nach Entity-Review)
3. `CREATE_FINE` / `CREATE_INVOICE` (mit Downstream-Dedup)
4. Service / Inspection / Damage / Technical measurements

### 10.2 Aktivierung

```bash
DOCUMENT_INTAKE_V2_APPLY_ENABLED=true
DOCUMENT_INTAKE_V2_EXECUTOR_ALLOWLIST=ARCHIVE_DOCUMENT
# Nach Validierung erweitern:
# DOCUMENT_INTAKE_V2_EXECUTOR_ALLOWLIST=ARCHIVE_DOCUMENT,LINK_ENTITY_DOCUMENT
```

`DOCUMENT_EXTRACTION_ACTION_RECOVERY_ENABLED=true` erst nach erstem erfolgreichen Apply.

### 10.3 Gates pro Executor

| Executor | Gate |
|----------|------|
| ARCHIVE | `synqdrive_document_archive_total{outcome="applied"}` ohne Fehler-Spike |
| FINE/INVOICE | Reconciliation: kein `APPLIED_WITHOUT_DOWNSTREAM` |
| DAMAGE | Kein Duplicate ohne `linkExisting` |
| Technical | Health-Module Stichprobe |

---

## 11. Follow-ups

### 11.1 Aktivierung

```bash
DOCUMENT_INTAKE_V2_FOLLOW_UP_MATERIALIZE_ENABLED=true
```

Nur nach stabilem Apply auf Canary.

### 11.2 Verifikation

| Metrik | Erwartung |
|--------|-----------|
| `synqdrive_document_follow_up_total{outcome="suggested"}` | Steigend nach Apply |
| `outcome="accepted"` / `suggested` | Akzeptanzrate dokumentiert (Grafana Panel) |
| Tasks | Dedup-Keys, keine Massen-Duplikate |

**Regel:** Kein Auto-Versand — Contact-Prepare bleibt manuell.

---

## 12. Archiv

### 12.1 Index

- `DocumentExtractionArchiveIndexService.upsertForRecord` bei READY_FOR_REVIEW / Apply
- `GET /organizations/:orgId/document-extractions/archive`

### 12.2 Aktivierung

```bash
DOCUMENT_INTAKE_V2_ARCHIVE_APPLY_ENABLED=true
```

(nur wenn `ARCHIVE_DOCUMENT` in Allowlist)

### 12.3 Verifikation

- Archive-Tab: Filter, Suche, Pagination
- `synqdrive_document_archive_total{outcome="indexed"}` korreliert mit Extraktionen

---

## 13. Security-Funktionen

### 13.1 Malware-Scan

```bash
DOCUMENT_MALWARE_SCAN_ENABLED=true
DOCUMENT_MALWARE_SCAN_FAIL_OPEN=false
```

Canary → Metrik `document_upload_rejected_total{reason="malware"}`.

### 13.2 Rate-Limits

Defaults in `.env.example` — bei Pilot ggf. höhere Limits für Operator-Multiplier.

### 13.3 Retention

```bash
DOCUMENT_RETENTION_ENABLED=false
DOCUMENT_RETENTION_DRY_RUN=true
```

Dry-Run auf Staging mit Produktionskopie **vor** jeder Lösch-Freigabe.

### 13.4 Audit

- Reconciliation: `document-intake-reconcile.ts --dry-run`
- Keine OCR-Rohdaten in Archiv-Search-Text (Architektur V4.9.652)

---

## 14. Legacy-Apply deaktivieren

### 14.1 Ziel

Alle V2-Dokumenttypen mit `supportsExecutorPath()` ausschließlich über `DocumentActionOrchestratorService`.

### 14.2 Aktivierung

```bash
DOCUMENT_INTAKE_V2_LEGACY_APPLY_ENABLED=false
```

**Nur wenn:**

- Alle relevanten Typen in Executor-Allowlist
- Shadow-Validierung abgeschlossen (§9)
- Reconciliation 7 Tage ohne `APPLIED_WITHOUT_DOWNSTREAM`

### 14.3 Verifikation

- `DocumentExtractionApplyService.apply` wird für V2-Typen nicht mehr aufgerufen
- `synqdrive_document_extraction_apply_total` vs `synqdrive_document_action_total` — V2-Metriken dominieren

---

## 15. Rollback

| Schritt | Rollback | Daten |
|---------|----------|-------|
| 3–6 | Flags auf Phase-0-Block | Extraktionen behalten |
| 7–8 | Confirm sperren | Review-Daten behalten |
| 10 | Allowlist leeren, `APPLY_ENABLED=false` | Apply-State in plausibility |
| 11 | `FOLLOW_UP_MATERIALIZE_ENABLED=false` | Tasks behalten |
| 14 | `LEGACY_APPLY_ENABLED=true` | — |
| Hard | Git-Revert + Deploy | **Kein** Massen-Delete |

```bash
pm2 restart synqdrive --update-env
```

---

## 16. Abbruchkriterien

| ID | Kriterium | Aktion |
|----|-----------|--------|
| A1 | Queue age &gt; 600 s über 15 min | Worker-Incident, Freeze |
| A2 | OCR permanent failure rate &gt; 25 % | Provider/Quota prüfen |
| A3 | `APPLIED_WITHOUT_DOWNSTREAM` in Reconciliation | Apply stoppen |
| A4 | Partial-apply rate &gt; 20 % ohne RCA | Executor zurückdrehen |
| A5 | Falsche Fahrzeugzuordnung in Canary | Entity-Review-Pflicht |
| A6 | PM2 ständige Restarts | Kein Confirm/Apply |

---

## 17. Smoke Tests

```bash
cd backend && bash scripts/test/document-intake-v2-verify.sh
cd ../frontend && npm run test:document-intake:v2
```

**Manuell (Canary):** Upload → OCR → Review → Preview → (optional) Confirm nur wenn Phase ≥ 10.

---

## 18. Ergebnisbericht (Template)

```markdown
## Document Intake V2 Deployment — Phasenbericht

- **Datum / UTC:**
- **Schritt (1–14):**
- **Git-Commit:**
- **Canary-Org:**

### Durchgeführt
- [ ] Backup + Restore-Test
- [ ] Migration OK
- [ ] Env-Flags: ...
- [ ] Stichprobe PDF/Bild/Typen: ...

### Metriken (24h)
- Upload accepted/rejected:
- OCR success / p95:
- Classification / awaiting_type:
- Action preview vs apply:

### Entscheidung
- [ ] Nächster Schritt freigegeben
- [ ] Rollback
```

---

## Referenzen

| Dokument | Inhalt |
|----------|--------|
| [`document-intake-v2-shadow-validation.md`](./document-intake-v2-shadow-validation.md) | Shadow-Metriken und Gates |
| [`document-intake-v2-grafana-prometheus-ops.md`](../architecture/document-intake-v2-grafana-prometheus-ops.md) | Dashboards |
| [`document-intake-production-reality.md`](../audits/document-intake-production-reality.md) | Produktions-Audit |
| [`document-intake-v2-implementation-inventory.md`](../audits/document-intake-v2-implementation-inventory.md) | Ist-Inventur |

---

*Dieses Runbook autorisiert keine automatische Ausführung. Jede produktive Aktion erfordert menschliche Freigabe und Ticket.*
