# Task Domain V2 — Additiver Migrationsplan (Schema)

**Status:** Schema + Migrationen + minimaler Transport implementiert (2026-07-15); **nicht** auf Produktion ausgeführt  
**Datum:** 2026-07-15 (Plan) · **Implementierung:** 2026-07-15  
**Normative Spezifikation:** [`task-domain-v2.md`](./task-domain-v2.md)  
**Ist-Analyse:** [`../audits/task-management-inventory.md`](../audits/task-management-inventory.md)

---

## 1. Zweck und Scope

Dieses Dokument definiert den **exakten additiven** Datenbank-Migrationsplan für Task Domain V2 und dokumentiert den **tatsächlichen Implementierungsstand** (§17).

**Ursprünglich explizit ausgeschlossen (Planungsphase):** reine Planung ohne Schema — **erledigt**, Schema/Migrationen/Transport sind umgesetzt.

**Weiterhin ausgeschlossen:** Policy-Enforcement, UI, Automations-Bereinigung, Produktions-DDL, Daten-Backfill.

**Namenskonvention Spec ↔ Schema:**

| Spezifikation (`task-domain-v2.md`) | Geplanter Prisma-/DB-Name | Anmerkung |
|-------------------------------------|---------------------------|-----------|
| `resolutionKind` | `completionMode` | Gleiche Semantik, gleiche Enum-Werte; Spec-Begriff in Events als `metadata.resolutionKind` beibehalten (API-Alias optional später) |

---

## 2. Ist-Zustand — relevante Modelle

### 2.1 `OrgTask` (`org_tasks`)

**Bereits vorhanden (keine erneute Einführung):**

| Feld | Prisma-Typ | DB-Spalte | Anmerkung |
|------|------------|-----------|-----------|
| `status` | `TaskStatus` | `status` | inkl. `WAITING` seit `20260614000000` |
| `dueDate` | `DateTime?` | `due_date` | |
| `startedAt` | `DateTime?` | `started_at` | |
| `completedAt` | `DateTime?` | `completed_at` | Terminal `DONE` |
| `cancelledAt` | `DateTime?` | `cancelled_at` | Terminal `CANCELLED` |
| `resolutionNote` | `String?` | `resolution_note` | Freitext-Abschlussnachweis |
| `assignedUserId` | `String?` | `assigned_to` | **Kein** Prisma-FK zu `User`; Org-Membership-Validierung in `TasksService` |
| `createdByUserId` | `String?` | `created_by_user_id` | Kein FK |
| `updatedByUserId` | `String?` | `updated_by_user_id` | Kein FK |
| `serviceCaseId` | `String?` | `service_case_id` | FK → `ServiceCase`, `onDelete: SetNull` |
| `metadata` | `Json?` | `metadata` | Kann konzeptionell V2-Felder spiegeln, ersetzt aber **nicht** dedizierte Spalten |
| `dedupKey` | `String?` | `dedup_key` | Unique `(organizationId, dedupKey)` |
| `estimatedCostCents` | `Int?` | `estimated_cost_cents` | **Nicht** gleichwertig zu `estimatedDurationMinutes` |

**Fehlt (Ziel dieses Plans):**

`activatesAt`, `completionMode`, `resolutionCode`, `completedByUserId` (Task-Ebene), `supersededByTaskId`, `estimatedDurationMinutes`

**Bestehende Indizes (relevant):**

```text
org_tasks_organization_id_status_idx          (organization_id, status)
org_tasks_organization_id_due_date_idx        (organization_id, due_date)
org_tasks_organization_id_assigned_to_idx       (organization_id, assigned_to)
org_tasks_organization_id_status_idx            — siehe oben
org_tasks_due_date_idx                          (due_date) — Einzelspalte
org_tasks_assigned_to_idx                       (assigned_to) — Einzelspalte
```

Quellen: `20260413230000_add_composite_indexes_batch_c`, `20260614000100_task_action_layer`, `schema.prisma`.

### 2.2 `TaskChecklistItem` (`task_checklist_items`)

| Feld | Status |
|------|--------|
| `isRequired` | **Bereits migriert** — Migration `20260715140000_task_checklist_item_is_required` |
| `completedByUserId` | Bereits vorhanden (`completed_by_user_id`) — **Checklisten-Ebene**, nicht Task-Ebene |

**Keine weitere Schema-Änderung für `isRequired` geplant.**

### 2.3 `TaskEvent` (`task_events`)

| Feld | Ist |
|------|-----|
| `type` | Freier `String` (`STATUS_CHANGED`, `CREATED`, …) |
| `actorUserId` | `String?` — heute nächster Proxy für „wer hat abgeschlossen“ |
| `metadata` | `Json?` — Spec sieht `metadata.resolutionKind` vor; **nicht** persistiert im Ist-Code |

**Keine Schema-Änderung an `TaskEvent` in diesem Plan** (Events bleiben Audit-Trail; `completionMode` wird auf `OrgTask` gespiegelt).

### 2.4 `User` / `OrganizationMembership`

- `User` hat **keine** Prisma-Relation zu `OrgTask`.
- `assignedUserId`, `createdByUserId`, `updatedByUserId` werden als scoped IDs gehalten; Validierung über `OrganizationMembership` (`TasksService.assertLinksBelongToOrg`).
- Geplantes `OrgTask.completedByUserId` folgt **demselben Muster** (kein DB-FK zu `users`).

### 2.5 `ServiceCase` (`service_cases`)

- Bereits verknüpft über `OrgTask.serviceCaseId` (Migration `20260619150000_service_cases`).
- Keine V2-Schema-Erweiterung am `ServiceCase`-Modell in diesem Plan.
- Tenant-Regel G4 (Case-`vehicleId` = Task-`vehicleId`) bleibt Anwendungslogik.

---

## 3. Äquivalenzprüfung — keine Doppel-Einführung

| Geplantes Feld | Bereits vorhanden? | Entscheidung |
|----------------|-------------------|--------------|
| `OrgTask.activatesAt` | Nein. `createdAt` ist technischer Erstellzeitpunkt, nicht Aktivierung | **Neu** |
| `OrgTask.completionMode` | Nein. `status` allein unterscheidet MANUAL/AUTO/SUPERSEDED nicht | **Neu** (Enum) |
| `OrgTask.resolutionCode` | Nein. Nur `resolutionNote` (Freitext) | **Neu** |
| `OrgTask.completedByUserId` | Nur auf `TaskChecklistItem`, nicht auf `OrgTask` | **Neu** (Task-Ebene) |
| `OrgTask.supersededByTaskId` | Nein. Supersede nur implizit über Dedup/Lifecycle | **Neu** (Self-FK) |
| `OrgTask.estimatedDurationMinutes` | Nein in DB. UI `estimatedDuration` (`TasksView.tsx`) ist Client-String, nicht persistiert | **Neu** |
| `TaskChecklistItem.isRequired` | **Ja** — `is_required BOOLEAN NOT NULL DEFAULT false` | **Keine Aktion** |

**Konzeptionelle Proxies (nicht als Ersatz für Spalten):**

- `TaskEvent.actorUserId` bei `STATUS_CHANGED` → `completedByUserId` (Backfill-Hinweis)
- `TaskEvent.metadata` → temporäre Quelle für Backfill von `completionMode`
- `metadata.automation` / `source` / `sourceType` → Provenance, nicht `completionMode`

---

## 4. Geplantes Prisma-Enum

### 4.1 `TaskCompletionMode`

```prisma
enum TaskCompletionMode {
  MANUAL
  AUTO_RESOLVED
  SUPERSEDED
}
```

| Aspekt | Plan |
|--------|------|
| DB-Typ | `CREATE TYPE "TaskCompletionMode" AS ENUM (...)` |
| Verwendung | Nur sinnvoll bei `status IN (DONE, CANCELLED)`; bei aktiven Tasks `NULL` |
| Spec-Alias | Entspricht `resolutionKind` in `task-domain-v2.md` §B |
| Regel B1 | `CANCELLED` → nur `MANUAL` (Anwendungslogik, nicht DB-Constraint in Phase 1) |
| Regel B2 | `SUPERSEDED` → nur mit `status = DONE` (Anwendungslogik) |

**Migration-Hinweis:** Enum in **eigener** Migration vor Spaltennutzung (PostgreSQL: neuer Enum-Wert nicht in derselben Transaktion wie erste Nutzung — Pattern wie `TaskStatus.WAITING` in `20260614000000` + `20260614000100`).

---

## 5. Feld-für-Feld-Plan

### 5.1 `OrgTask.activatesAt`

| Attribut | Wert |
|----------|------|
| **Feldname (Prisma)** | `activatesAt` |
| **Prisma-Typ** | `DateTime` |
| **Nullable / Default** | `NOT NULL`, `@default(now())` — bestehende Rows per SQL-Backfill `activates_at = created_at` **vor** oder **in** derselben Migration setzen |
| **DB-Spalte** | `activates_at` |
| **Relation** | Keine |
| **Index** | Composite: `@@index([organizationId, status, activatesAt])` → `org_tasks_organization_id_status_activates_at_idx` |
| **Backfill** | `UPDATE org_tasks SET activates_at = created_at WHERE activates_at IS NULL` (falls nullable Zwischenschritt) bzw. explizites SET bei ADD COLUMN mit DEFAULT |
| **Kompatibilität** | Alte Backends ignorieren Spalte; neue Backends: fehlende API-Felder → DB-Default = sofort aktiv (äquivalent Ist-Verhalten). Geplante Tasks (`activatesAt > createdAt`) erst nach App-Release nutzbar |

### 5.2 `OrgTask.completionMode`

| Attribut | Wert |
|----------|------|
| **Feldname (Prisma)** | `completionMode` |
| **Prisma-Typ** | `TaskCompletionMode?` |
| **Nullable / Default** | `NULL` erlaubt — bei `OPEN`/`IN_PROGRESS`/`WAITING` immer `NULL`; bei Terminalstatus gesetzt (App) oder backfilled |
| **DB-Spalte** | `completion_mode` (`TaskCompletionMode`) |
| **Relation** | Keine |
| **Index** | Einzelspalte: `@@index([completionMode])` → `org_tasks_completion_mode_idx` (Analytics, Audit-Jobs, „alle AUTO_RESOLVED“) |
| **Backfill** | Siehe §8 — best-effort aus `TaskEvent` + Heuristiken |
| **Kompatibilität** | `NULL` = „legacy/unbekannt“; alte Writer setzen Feld nicht → kein Breaking Change |

### 5.3 `OrgTask.resolutionCode`

| Attribut | Wert |
|----------|------|
| **Feldname (Prisma)** | `resolutionCode` |
| **Prisma-Typ** | `String?` |
| **Nullable / Default** | `NULL` — kein DB-Default |
| **DB-Spalte** | `resolution_code` (`TEXT`) |
| **Relation** | Keine |
| **Index** | Keiner in Phase 1 (geringe Kardinalität, selten gefiltert) |
| **Backfill** | Kein verlässlicher Ist-Wert; optional Parsing aus `resolutionNote` **nicht** empfohlen |
| **Kompatibilität** | Bestehende Tasks ohne Code bleiben `NULL`; Policy-Enforcement erst nach App-Phase |

**Begründung `String?` statt Prisma-Enum:** Spec-Liste (`BRAKE_MEASURED_OK`, `TUV_PASSED`, …) ist erweiterbar; String vermeidet Enum-Migrations bei jedem neuen Code. Optionales `TaskResolutionCode`-Enum kann in späterer Phase additiv eingeführt werden.

### 5.4 `OrgTask.completedByUserId`

| Attribut | Wert |
|----------|------|
| **Feldname (Prisma)** | `completedByUserId` |
| **Prisma-Typ** | `String?` |
| **Nullable / Default** | `NULL` |
| **DB-Spalte** | `completed_by_user_id` (`TEXT`) |
| **Relation** | **Kein** Prisma-FK zu `User` (konsistent mit `assignedUserId`) |
| **Index** | Keiner in Phase 1 |
| **Backfill** | Für `status = DONE`: letztes `TaskEvent` mit `type = 'STATUS_CHANGED'` und `newValue = 'DONE'` → `actor_user_id`; für `CANCELLED` analog mit `CANCELLED` |
| **Kompatibilität** | Auto-Closes ohne Event (Ist-Bypass Pfade) → `NULL`; kein Datenverlust |

**Abgrenzung:** `TaskChecklistItem.completedByUserId` bleibt unverändert; Task-Feld dokumentiert Terminal-Abschluss durch Operator/System-Actor.

### 5.5 `OrgTask.supersededByTaskId`

| Attribut | Wert |
|----------|------|
| **Feldname (Prisma)** | `supersededByTaskId` |
| **Prisma-Typ** | `String?` |
| **Nullable / Default** | `NULL` — nur gesetzt wenn `completionMode = SUPERSEDED` |
| **DB-Spalte** | `superseded_by_task_id` (`TEXT`) |
| **Relation** | Self-Relation auf `OrgTask` |

**Geplantes Prisma-Relationsmuster:**

```prisma
supersededByTaskId String?  @map("superseded_by_task_id")
supersededBy       OrgTask? @relation("TaskSupersession", fields: [supersededByTaskId], references: [id], onDelete: SetNull)
supersedes         OrgTask[] @relation("TaskSupersession")
```

| Aspekt | Bewertung |
|--------|-----------|
| **Echte Self-Relation** | Ja — FK `superseded_by_task_id` → `org_tasks(id)` |
| **Löschverhalten** | `ON DELETE SET NULL` — Löschen des Nachfolger-Tasks hebt Verweis auf; Vorgänger-Task bleibt `DONE` + `SUPERSEDED` mit `NULL`-Pointer (historisch weiterhin terminal) |
| **Zyklenrisiko** | DB verhindert keine Zyklen (A→B→A). **Service-Validierung Pflicht:** beim Setzen prüfen, dass `successorId ≠ id` und kein Zyklus in Kette; optional DB-Trigger später |
| **Tenant-Validierung** | **Nicht** über FK erzwingbar. `TasksService` muss prüfen: `successor.organizationId === task.organizationId`. Cross-Tenant-FK technisch möglich → explizit verboten in App |
| **Index** | `@@index([supersededByTaskId])` → `org_tasks_superseded_by_task_id_idx` |
| **Backfill** | Nur wo `TaskEvent.metadata.supersededBy` oder Dedup-Lifecycle erkennbar; sonst `NULL` |
| **Kompatibilität** | `NULL` für alle Legacy- und MANUAL/AUTO_RESOLVED-Abschlüsse |

### 5.6 `OrgTask.estimatedDurationMinutes`

| Attribut | Wert |
|----------|------|
| **Feldname (Prisma)** | `estimatedDurationMinutes` |
| **Prisma-Typ** | `Int?` |
| **Nullable / Default** | `NULL` |
| **DB-Spalte** | `estimated_duration_minutes` (`INTEGER`) |
| **Relation** | Keine |
| **Index** | Keiner |
| **Backfill** | Keiner — UI-Werte nie persistiert |
| **Kompatibilität** | Optional; API kann UI-Dropdown-Werte (`"30"`, `"60"`, …) nach Release mappen |

**Constraint (Anwendung):** `CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0)` optional in Migration oder nur im Service.

### 5.7 `TaskChecklistItem.isRequired` — Referenz (bereits umgesetzt)

| Attribut | Wert |
|----------|------|
| **Status** | ✅ Migriert (`20260715140000`) |
| **Prisma** | `isRequired Boolean @default(false) @map("is_required")` |
| **Aktion in V2-Schema-Migration** | **Keine** |

---

## 6. Index-Plan

### 6.1 Anforderung vs. Ist

| Gefordert | Ist-Index | Aktion |
|-----------|-----------|--------|
| `(organizationId, status, activatesAt)` | Fehlt | **CREATE** `org_tasks_organization_id_status_activates_at_idx` |
| `(organizationId, dueDate)` | `org_tasks_organization_id_due_date_idx` | **Bereits vorhanden** — kein Duplikat |
| `(organizationId, assignedUserId, status)` | Nur `(organizationId, assignedUserId)` | **CREATE** `org_tasks_organization_id_assigned_to_status_idx` |
| `completionMode` | Fehlt | **CREATE** `org_tasks_completion_mode_idx` |
| `supersededByTaskId` | Fehlt | **CREATE** `org_tasks_superseded_by_task_id_idx` |

### 6.2 Typische Abfragen (Begründung)

```sql
-- Bucket „Jetzt erforderlich“ / Operator-Listen
WHERE organization_id = $1 AND status IN ('OPEN','IN_PROGRESS','WAITING')
  AND activates_at <= now()
-- → (organization_id, status, activates_at)

-- Fälligkeits-Sortierung pro Org
WHERE organization_id = $1 ORDER BY due_date
-- → (organization_id, due_date) ✓

-- „Meine offenen Tasks“
WHERE organization_id = $1 AND assigned_to = $2 AND status IN (...)
-- → (organization_id, assigned_to, status)

-- Audit / Automation-Reports
WHERE completion_mode = 'AUTO_RESOLVED'
-- → completion_mode

-- Nachfolger-Kette / Supersede-Graph
WHERE superseded_by_task_id = $1
-- → superseded_by_task_id
```

**Produktions-Hinweis:** Für große Tabellen können Composite-Indizes analog `20260413230000` mit `CREATE INDEX CONCURRENTLY IF NOT EXISTS` in einer separaten, nicht-transaktionalen Migration erfolgen.

---

## 7. Geplante Schema-Diff-Übersicht (`OrgTask`)

```prisma
// Neu — Auszug, noch nicht angewendet
activatesAt               DateTime            @default(now()) @map("activates_at")
completionMode            TaskCompletionMode? @map("completion_mode")
resolutionCode            String?             @map("resolution_code")
completedByUserId         String?             @map("completed_by_user_id")
supersededByTaskId        String?             @map("superseded_by_task_id")
estimatedDurationMinutes  Int?                @map("estimated_duration_minutes")

supersededBy  OrgTask?  @relation("TaskSupersession", fields: [supersededByTaskId], references: [id], onDelete: SetNull)
supersedes    OrgTask[] @relation("TaskSupersession")

@@index([organizationId, status, activatesAt])
@@index([organizationId, assignedUserId, status])
@@index([completionMode])
@@index([supersededByTaskId])
```

**Neues Enum:** `TaskCompletionMode` (siehe §4.1).

---

## 8. Migrations-Reihenfolge (SQL)

Empfohlene **zwei** additive Migrationen (Enum-Isolation):

### Migration A — `task_completion_mode_enum`

```sql
CREATE TYPE "TaskCompletionMode" AS ENUM (
  'MANUAL',
  'AUTO_RESOLVED',
  'SUPERSEDED'
);
```

### Migration B — `org_task_v2_additive_columns`

Reihenfolge innerhalb der Migration:

1. `ALTER TABLE org_tasks ADD COLUMN activates_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`
2. `UPDATE org_tasks SET activates_at = created_at` (idempotent, falls Default bereits passt)
3. `ADD COLUMN completion_mode "TaskCompletionMode" NULL`
4. `ADD COLUMN resolution_code TEXT NULL`
5. `ADD COLUMN completed_by_user_id TEXT NULL`
6. `ADD COLUMN superseded_by_task_id TEXT NULL`
7. `ADD COLUMN estimated_duration_minutes INTEGER NULL`
8. `ALTER TABLE org_tasks ADD CONSTRAINT org_tasks_superseded_by_task_id_fkey FOREIGN KEY (superseded_by_task_id) REFERENCES org_tasks(id) ON DELETE SET NULL ON UPDATE CASCADE`
9. Indizes (§6) — ggf. CONCURRENTLY in Migration C

**Kein** `NOT NULL` auf `completionMode`, `resolutionCode`, `completedByUserId`, `supersededByTaskId` in Phase 1.

---

## 9. Sichere Rollout-Reihenfolge (End-to-End)

| Schritt | Aktion | Risiko |
|---------|--------|--------|
| **R1** | Migration A (Enum) deployen | Minimal — ungenutzter Typ |
| **R2** | Migration B (Spalten + FK + Indizes) deployen | Kurzzeitige Metadata-Locks; CONCURRENTLY für Indizes empfohlen |
| **R3** | `prisma generate` + neues Backend deployen (liest/schreibt neue Felder **optional**) | Rolling Deploy: alte + neue Pods parallel |
| **R4** | Async Backfill-Job (§10) — **nicht** deploy-blockierend | Best-effort |
| **R5** | API-Response additive Felder exponieren (`completionMode`, `activatesAt`, …) | AC-20 |
| **R6** | `TasksService` setzt Felder bei Terminal-Übergängen | Erst nach R3 |
| **R7** | Policy-Enforcement (`activatesAt`, `resolutionCode`, Checklisten-Blocker) | Phase 2/3 laut Spec-Roadmap |
| **R8** | Alte Bypass-Pfade (`closeLinkedTasks`, …) auf `TasksService` umstellen | Voraussetzung für verlässliches `completionMode` |

**`isRequired`:** Bereits in Produktion (R0 erledigt).

---

## 10. Verhalten während Rolling Deployment

| Komponente | Alte Backend-Version | Neue Backend-Version |
|------------|---------------------|----------------------|
| **DB-Schreibzugriffe** | Ignoriert neue Spalten; `activates_at` erhält DB-Default | Setzt Felder bei bekannten Flows |
| **`activatesAt`** | Nicht gelesen — Tasks erscheinen wie bisher (Default = `now()` ≈ `createdAt`) | Gelesen für Bucket-Filter |
| **`completionMode`** | Bleibt `NULL` bei Writes alter Pods | Gesetzt bei Terminal-Status |
| **`supersededByTaskId`** | Nicht gesetzt | Gesetzt bei Supersede-Flows |
| **API-Clients** | Keine neuen JSON-Felder erwartet | Optionale Felder; `undefined`/`null` OK (AC-20) |
| **Prisma Client** | Alte Binaries kennen Spalten nicht → **nach R2 müssen alle Pods neu gebaut sein**, sonst SELECT * / volle Model-Reads können scheitern | Normal |

**Kritischer Punkt:** Nach Schema-Migration B **müssen** alle Backend-Instanzen `prisma generate` mit neuem Schema nutzen. Gemischte Prisma-Schema-Versionen auf derselben DB sind **nicht** unterstützt.

**Lesekompatibilität:** Neue Spalten mit Defaults / NULL stören alte Raw-SQL-Pfade nicht, sofern sie keine expliziten INSERT-Spaltenlisten ohne Default brechen (Prisma-ORM ist OK).

---

## 11. Rollback-Strategie

| Phase | Rollback |
|-------|----------|
| **Nach R1 (nur Enum)** | Enum nicht löschen (PostgreSQL: DROP TYPE nur ohne Abhängigkeiten). Praktisch: forward-only |
| **Nach R2 (Spalten)** | App-Rollback auf alte Version **ohne** Spalten-Drop — neue Spalten bleiben ungenutzt (sicher) |
| **Vollständiger DB-Rollback** | Nur in Maintenance Window: `DROP INDEX …`, `DROP CONSTRAINT …`, `DROP COLUMN …` (6 Spalten), `DROP TYPE "TaskCompletionMode"` — **Datenverlust** für neu geschriebene Werte |
| **Backfill** | Reversibel — UPDATE kann Felder wieder auf `NULL` setzen |

**Empfehlung:** Forward-only Rollout; bei App-Fehler alte App-Version + ungenutzte Spalten (kein Schema-Drop).

---

## 12. Spätere Backfill-Strategie

**Prinzip:** Kein Deploy-Blocker (AC-21). Backfill asynchron, idempotent, pro Org chunkbar.

### 12.1 `activatesAt`

```sql
UPDATE org_tasks SET activates_at = created_at WHERE activates_at > created_at + interval '1 second';
-- Nur falls Korrektur nötig; Initial-Migration setzt bereits created_at
```

### 12.2 `completionMode`

Priorität der Quellen:

1. `TaskEvent` mit `type = 'STATUS_CHANGED'`, `newValue IN ('DONE','CANCELLED')`, `metadata->>'resolutionKind'` ∈ Enum
2. Heuristik: `status = 'CANCELLED'` → `MANUAL`
3. Heuristik: `status = 'DONE'` + `source IS NOT NULL` + kein `actorUserId` im Event → `AUTO_RESOLVED`
4. Heuristik: `status = 'DONE'` + Booking-Lifecycle `source = 'BOOKING'` + `closeStaleBookingLifecycleTasks`-Muster → `SUPERSEDED` (unsicher)
5. Default: `MANUAL` wenn `completedByUserId` / Event-Actor vorhanden, sonst `AUTO_RESOLVED`

Nur updaten wo `completion_mode IS NULL`.

### 12.3 `completedByUserId`

```sql
-- Pseudocode: pro Task letztes passendes TaskEvent
UPDATE org_tasks t SET completed_by_user_id = e.actor_user_id
FROM LATERAL (
  SELECT actor_user_id FROM task_events
  WHERE task_id = t.id AND type = 'STATUS_CHANGED'
    AND new_value IN ('DONE','CANCELLED')
  ORDER BY created_at DESC LIMIT 1
) e
WHERE t.status IN ('DONE','CANCELLED') AND t.completed_by_user_id IS NULL;
```

### 12.4 `supersededByTaskId`

- Aus `TaskEvent.metadata->>'supersededBy'` (Ziel-Format)
- Aus Dedup-Parking `{dedupKey}:closed:{taskId}` + neuem ACTIVE Task mit gleichem Key (manueller Matching-Job)
- Nur setzen wenn `completion_mode = 'SUPERSEDED'` (oder gleichzeitig setzen)

### 12.5 `resolutionCode` / `estimatedDurationMinutes`

- Kein automatischer Massen-Backfill
- Nur bei erneutem manuellem Abschluss oder Admin-Tool

### 12.6 Validierung nach Backfill

- Count: `status IN ('DONE','CANCELLED') AND completion_mode IS NULL`
- Stichprobe: `SUPERSEDED` ohne `superseded_by_task_id`
- Cross-Tenant: `superseded_by_task_id` JOIN `org_tasks` auf `organization_id`-Gleichheit

---

## 13. Abhängigkeiten zu anderen Modellen (unverändert)

| Modell | Änderung in diesem Plan |
|--------|-------------------------|
| `TaskEvent` | Keine |
| `User` | Keine |
| `OrganizationMembership` | Keine (weiterhin Validierungsquelle) |
| `ServiceCase` | Keine |
| `TaskChecklistItem` | `isRequired` — Migration `20260715140000` ✅ |

---

## 14. Konkret geplante Schemaänderungen (Checkliste)

- [x] Neues Enum `TaskCompletionMode` (`MANUAL`, `AUTO_RESOLVED`, `SUPERSEDED`)
- [x] `OrgTask.activatesAt` — `DateTime?` (Implementierung: nullable; API-Fallback `createdAt` in `TasksService`)
- [x] `OrgTask.completionMode` — `TaskCompletionMode?`
- [x] `OrgTask.resolutionCode` — `String?`
- [x] `OrgTask.completedByUserId` — `String?` (ohne User-FK)
- [x] `OrgTask.supersededByTaskId` — Self-FK, `onDelete: SetNull`
- [x] `OrgTask.estimatedDurationMinutes` — `Int?`
- [x] Index `(organization_id, status, activates_at)`
- [ ] Index `(organization_id, assigned_to, status)` — **geplant, noch nicht umgesetzt**
- [x] Index `completion_mode`
- [x] Index `superseded_by_task_id`
- [x] `TaskChecklistItem.isRequired` — Migration `20260715140000`

---

## 15. Risiken

| # | Risiko | Schwere | Mitigation |
|---|--------|---------|------------|
| R1 | Gemischte Prisma-Client-Versionen nach DDL | **Hoch** | Rolling Deploy nur nach `prisma generate`; kurzes Drain |
| R2 | `supersededByTaskId` Cross-Tenant-FK möglich | **Hoch** | Service-Validierung + Backfill-Audit-Query |
| R3 | Zyklische Supersede-Kette | **Mittel** | Service: DAG-Check vor Persist |
| R4 | Backfill `completionMode` falsch bei fehlenden Events (Ist-Bypass W4) | **Mittel** | Erst Schreibpfad-Integrität (R8), dann Backfill; `NULL` akzeptieren |
| R5 | `activatesAt NOT NULL` + Default verdeckt geplante Tasks bis App-Release | **Niedrig** | Default = `now()`; Feature erst mit App |
| R6 | Index-Build auf großer `org_tasks`-Tabelle | **Mittel** | `CREATE INDEX CONCURRENTLY` |
| R7 | Spec/API nutzt `resolutionKind`, Schema `completionMode` | **Niedrig** | API-Alias / Event-Metadata-Konvention dokumentieren |
| R8 | `resolutionCode` als freier String — Drift | **Niedrig** | Später Enum oder zentrale Konstanten |
| R9 | Doppelte Semantik `completedByUserId` Task vs. Checklist | **Niedrig** | API-Doku / klare Feldnamen in DTOs |
| R10 | `estimatedDurationMinutes` ohne Ist-Daten | **Niedrig** | Rein forward-looking |

---

## 16. Referenzen (Migrationen)

| Migration | Inhalt |
|-----------|--------|
| `20260608000000_service_compliance_auto_tasks` | `source`, `dedup_key` |
| `20260614000000_task_status_waiting` | `TaskStatus.WAITING` |
| `20260614000100_task_action_layer` | Task Action Layer, Child Tables, `resolution_note` |
| `20260614120000_task_dedup_org_scoped` | `(organizationId, dedupKey)` unique |
| `20260413230000_add_composite_indexes_batch_c` | `(organization_id, status)`, `(organization_id, due_date)` |
| `20260619150000_service_cases` | `service_case_id` FK |
| `20260715140000_task_checklist_item_is_required` | `is_required` auf `task_checklist_items` ✅ |
| `20260715150000_org_task_v2_additive_completion_fields` | V2-OrgTask-Spalten, Enum, Indizes, Self-FK ✅ |

---

## 17. Implementierungsstand (Stabilisierung 2026-07-15)

### 17.1 Schema & Migrationen

| Artefakt | Status |
|----------|--------|
| `backend/prisma/schema.prisma` | `TaskCompletionMode`, 6 OrgTask-Felder, Self-Relation `TaskSupersession`, `TaskChecklistItem.isRequired` |
| `20260715140000_task_checklist_item_is_required` | Additiv: `is_required BOOLEAN NOT NULL DEFAULT false` |
| `20260715150000_org_task_v2_additive_completion_fields` | Additiv: Enum + 6 Spalten + 3 Indizes + Self-FK |
| DDL auf Produktion | **Nicht ausgeführt** |
| Destructive SQL in neuen Migrationen | **Keine** (`DROP`/`RENAME`/`TRUNCATE`/`DELETE` geprüft) |

**Abweichung Plan ↔ Implementierung:** `activatesAt` ist `DateTime?` (nullable), nicht `NOT NULL` mit DB-Default. Lesekompatibilität über `TasksService.effectiveActivatesAt()` → `activatesAt ?? createdAt`.

**Offen aus Plan:** Composite-Index `(organization_id, assigned_to, status)` — bewusst noch nicht angelegt.

### 17.2 Backend-Transport (minimal, ohne Policy)

| Bereich | Datei | Stand |
|---------|-------|-------|
| Serialisierung V2-Felder | `tasks.service.ts` `format()` | `activatesAt`, `completionMode`, `resolutionCode`, `completedByUserId`, `supersededByTaskId`, `estimatedDurationMinutes` |
| Checkliste `isRequired` | `tasks.service.ts`, `task.dto.ts`, `tasks.controller.ts` | Create/Update/Detail; Default `false` |
| Terminal `complete`/`cancel` | `tasks.service.ts` | Setzt `completionMode=MANUAL`, `completedByUserId`; Event `metadata.resolutionKind` |
| `isOverdue` | `tasks.service.ts` | Berücksichtigt `activatesAt` (Spec D2) |
| Create optional | `CreateTaskDto`, `CompleteTaskDto` | `activatesAt`, `estimatedDurationMinutes`, `resolutionCode` |

**Nicht implementiert:** `AUTO_RESOLVED`/`SUPERSEDED`-Schreibpfade, `activatesAt`-Blocker bei `complete`, Supersede-Validierung, Bypass-Pfad-Migration (`closeLinkedTasks`, …), UI.

### 17.3 Validierung (Stabilisierungslauf)

| Kommando | Ergebnis |
|----------|----------|
| `npx prisma format` | ✅ |
| `npx prisma validate` | ✅ (Warnung `onDelete: SetNull` bei Self-FK — erwartbar) |
| `npm run prisma:generate` / `npx prisma generate` | ✅ Prisma Client v5.22.0 |
| `npx tsc -p tsconfig.json --noEmit` | ✅ keine Fehler |
| `npm test -- --testPathPattern=tasks` | ✅ 36/36 (3 Suites) |
| `npm run build` (`nest build`) | ✅ |
| Task-Controller-Tests | Keine dedizierte Spec-Datei vorhanden |

### 17.4 Rückwärtskompatibilität (verifiziert)

| Regel | Umsetzung |
|-------|-----------|
| `completionMode` bei Legacy-Tasks | `NULL` in DB und API |
| `activatesAt` null | API liefert effektiv `createdAt` (sofort aktiv) |
| `isRequired` bei Legacy-Checklisten | DB-Default `false` |
| Create ohne neue Felder | Keine Pflichtparameter; Defaults unverändert |
| List/Detail-Endpunkte | Alle bisherigen Felder erhalten; neue Felder additiv |

### 17.5 Nächste Schritte (außerhalb Stabilisierung)

1. Migrationen auf Staging/Produktion deployen (`prisma migrate deploy`) nach Drain
2. Optional: Index `(organization_id, assigned_to, status)` als separate Migration
3. `TasksService`-Konsolidierung Auto-Close / Supersede
4. Async Backfill `completionMode` (§12)
5. UI-Buckets / Policy-Enforcement (Spec Phase 2–3)

---

**Nächster Schritt (Implementierung):** Schreibpfad-Integrität und `AUTO_RESOLVED`/`SUPERSEDED` gemäß `task-domain-v2.md` §C — **keine** weiteren Schema-Änderungen nötig für Phase 1 Transport.
