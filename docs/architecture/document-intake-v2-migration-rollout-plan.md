# Document Intake V2 — Migrations- und Rolloutplan

**Version:** 1.0 (Spezifikation)  
**Date:** 2026-07-17  
**Status:** **Normativ für Prompts 5–84** — keine produktive Umsetzung in diesem Dokument  
**Serie:** Prompt **4/84** (Document Intake V2)  
**Basis:**

- [`document-intake-v2.md`](./document-intake-v2.md) (Architekturvertrag Prompt 2/84)
- [`document-intake-v2-rollout-flags.md`](./document-intake-v2-rollout-flags.md) (Feature-Flags Prompt 3/84)
- [`../audits/document-intake-v2-implementation-inventory.md`](../audits/document-intake-v2-implementation-inventory.md) (Ist-Inventur Prompt 1/84)

**Prinzip:** Additive Migration, Dual Read, Shadow Write, Dry Run vor Apply, Rollback ohne Verlust bestätigter Dokumente. Kein Big-Bang-Cutover.

---

## Inhaltsverzeichnis

| # | Abschnitt |
|---|-----------|
| 0 | Zweck und Geltungsbereich |
| 1 | Rollout-Reihenfolge (Master-Plan) |
| 2 | Additive Prisma-Migrationen |
| 3 | Rückwärtskompatibilität |
| 4 | Dual Read und Shadow Write |
| 5 | Action-Plan-Dry-Run vor echtem Apply |
| 6 | Downstream-Idempotenz |
| 7 | Bestandsdaten-Reconciliation |
| 8 | Organisationsweiter Upload |
| 9 | Entity Candidate Resolution |
| 10 | Frontend-Konsolidierung |
| 11 | Archivmigration |
| 12 | Security-Härtung |
| 13 | Golden-Fixture- und OCR-Regressionstests |
| 14 | Produktions-Shadow-Phase |
| 15 | Rollback ohne Verlust bestätigter Dokumente |
| 16 | Prompt-Mapping (5–84) |
| 17 | Abnahmekriterien (Prompt 4) |

---

## 0. Zweck und Geltungsbereich

Dieser Plan beschreibt **wie** Document Intake V2 von V1-Ist (vehicle-scoped Upload, Legacy Apply, kein Dry Run, schwache Integrity) **ohne Datenverlust** und **ohne parallele Schatten-Apply-Logik** in Produktion gebracht wird.

**Ist-Baseline (Inventur + Audits):**

- Kanonisches Modul: `backend/src/modules/document-extraction/`
- Produktion: n=2 Uploads; 1× `APPLIED` FINE ohne `fines`-Row (pre-`applyFine` deploy)
- Kein `PARTIALLY_APPLIED`, kein `contentSha256`, kein Apply Dry-Run-API
- `vehicleId` Pflicht in Schema; `organizationId` denormalisiert
- Parallele Nicht-Kanon-Pfade: `FinesView.AIUploadFlow`, Invoice-Public-Upload

**Ziel-Endzustand:** 11-Schichten-Architektur (Prompt 2), gesteuert über Feature-Flags (Prompt 3), mit nachweisbarer Apply-Integrität.

**Nicht Gegenstand:** Code-Implementierung in Prompt 4 — nur dieser Plan.

---

## 1. Rollout-Reihenfolge (Master-Plan)

Die Umsetzung folgt **verbindlich** dieser Phasenfolge. Jede Phase hat Exit-Gates; die nächste Phase startet erst nach grünem Gate (oder dokumentierter Ausnahme mit Platform-Approval).

```mermaid
flowchart LR
  P1[1 Runtime Stability]
  P2[2 Safety Gates]
  P3[3 Schema]
  P4[4 Action Plan]
  P5[5 Domain Guards]
  P6[6 Apply Execution]
  P7[7 Deduplizierung]
  P8[8 Entity Routing]
  P9[9 Frontend]
  P10[10 Follow-ups]
  P11[11 Archive]
  P12[12 Monitoring]
  P13[13 Shadow Rollout]

  P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7 --> P8 --> P9 --> P10 --> P11 --> P12 --> P13
```

### Phase-Übersicht

| Phase | Fokus | Flags (typisch) | Prompt-Bereich | Exit-Gate |
|-------|-------|-----------------|----------------|-----------|
| **1 — Runtime Stability** | Queue, Recovery, PM2, keine Regression | alle V2 `false` | 71, 73 | Queue healthy; stuck=0; PM2 stabil |
| **2 — Safety Gates** | `DocumentIntakeV2Config`, BLOCKER, per-Type Apply off | Config deployed, defaults | 5, 74 | Flags lesbar; Fine/Invoice/Damage Apply blockiert |
| **3 — Schema** | Additive Migration, nullable Felder | — | 8, 13, 26 | Migration applied; V1 read/write unverändert |
| **4 — Action Plan** | Plan-Builder + Dry-Run API (Shadow) | `documentActionPlanEnabled` | 5–6, 11–12 | AC3: Plan = Confirm-Input |
| **5 — Domain Guards** | Pflichtfelder, keine Defaults | per-Type flags | 33–36, 45–49 | Audit T17/T29 blocked in harness |
| **6 — Apply Execution** | V2 Executor + Integrity Gate | `documentActionExecutionV2Enabled` | 7–10, 45–52 | `applied_without_downstream=0` |
| **7 — Deduplizierung** | `contentSha256`, Downstream dedup | `documentContentHashDedupEnabled` | 13–20 | Keine Duplikat-Apply |
| **8 — Entity Routing** | Resolver + Kandidaten (Vorschlag) | `documentEntityResolutionEnabled` | 21–28 | Kein Auto-Bind |
| **9 — Frontend** | Ein Flow, Plan-Preview, Poll APPLIED | Master + OrgUpload | 29–31, 59–66 | Einheitliche State-Machine |
| **10 — Follow-ups** | Vorschläge ohne Auto-Send | `documentFollowUpSuggestionsEnabled` | 51–52, 60 | `follow_up_auto_execute=0` |
| **11 — Archive** | Org-Archive V2, Filter, Indizes | `documentArchiveV2Enabled` | 63, 67–69 | AC1 Archive ohne vehicleId |
| **12 — Monitoring** | Dashboards, SLOs, Runbooks | — | 72–73, 81 | Grafana + Alerting live |
| **13 — Shadow Rollout** | Prod Pilot → Fleet Cutover | schrittweise Org-Overrides | 78–84 | 50+ Uploads soak; Cutover |

**Verboten:**

- Phase 6 vor Phase 4 (Apply vor Action Plan)
- Phase 13 Fleet-Cutover vor Phase 12 Monitoring
- Schema-Destructive-Migrationen in Phase 3
- Malware Fail-Closed vor validiertem Scanner (Phase 12 Security-Härtung)

---

## 2. Additive Prisma-Migrationen

Alle Schema-Änderungen sind **additiv und nullable** (oder mit sicheren Defaults). Keine Spalten-Drops, keine `vehicleId`-Pflicht-Entfernung in einem Schritt.

### 2.1 Migration M1 — Status und Lifecycle (Prompt 8)

| Änderung | Typ | Default / Nullable | Zweck |
|----------|-----|------------------|-------|
| `DocumentExtractionStatus` + `PARTIALLY_APPLIED` | enum value | — | Teilerfolg sichtbar |
| `appliedActionResults` | `Json?` | null | Per-Action Execution-Ergebnis |
| `actionPlanSnapshot` | `Json?` | null | Letzter bestätigter Plan (Audit) |
| `actionPlanVersion` | `Int?` | null | Plan-Schema-Version |

**SQL-Stil:** `ALTER TYPE ... ADD VALUE IF NOT EXISTS` (wie bestehende Lifecycle-Migration `20260710160000`).

### 2.2 Migration M2 — Intake & Dedup (Prompt 13)

| Änderung | Typ | Default / Nullable | Zweck |
|----------|-----|------------------|-------|
| `contentSha256` | `String?` | null | Org-scoped Dedup |
| `suggestedContext` | `Json?` | null | UI-Kontextvorschlag (vehicle/booking/customer/driver) |
| `intakeRoute` | `String?` | null | `org` \| `vehicle` (Analytics) |

**Index (additiv):** `@@index([organizationId, contentSha256])` — partial wo hash not null.

### 2.3 Migration M3 — Entity & Links (Prompt 26)

| Änderung | Typ | Default / Nullable | Zweck |
|----------|-----|------------------|-------|
| `entityCandidates` | `Json?` | null | Resolver-Output |
| `confirmedEntityLinks` | `Json?` | null | User-bestätigte Verknüpfungen |
| `bookingId` | `String?` | null | Optional FK → Booking |
| `customerId` | `String?` | null | Optional FK → Customer |
| `driverId` | `String?` | null | Optional FK → Driver |

**Hinweis:** FKs optional + `onDelete: SetNull` — Bestandszeilen unberührt.

### 2.4 Migration M4 — Org-first Upload (Prompt 21–28, Org-Route)

| Änderung | Typ | Default / Nullable | Zweck |
|----------|-----|------------------|-------|
| `vehicleId` | `String` → `String?` | **Zweistufig:** (1) App akzeptiert null, (2) Migration nullable | Org-Upload ohne Fahrzeug |

**Zweistufige Strategie (verbindlich):**

1. **Deploy 1:** Application layer erlaubt `vehicleId` nur wenn Org-first Flag ON; DB noch NOT NULL — Placeholder-Fahrzeug **verboten**.
2. **Deploy 2:** Migration macht `vehicleId` nullable nach erstem Pilot-Org-Soak.

**Storage-Pfad:** Neue Keys `organizations/{orgId}/documents/...` parallel zu `.../vehicles/{vehicleId}/documents/...` — bestehende `objectKey` unverändert.

### 2.5 Migration M5 — Downstream FKs (Prompts 14–17)

| Tabelle | Änderung | Zweck |
|---------|----------|-------|
| `fines` | `documentExtractionId String? @unique` | Idempotenz + Reconciliation |
| `damages` | `documentExtractionId String? @unique` | Idempotenz |
| `org_invoices` | unique auf `documentExtractionId` (falls nicht vorhanden) | Dedup |

**Regel:** Bestehende Rows: `documentExtractionId = null` — Backfill nur via Reconciliation-Script (§7).

### 2.6 Migration M6 — Org Config (Prompt 74)

| Änderung | Typ | Zweck |
|----------|-----|-------|
| `Organization.documentIntakeV2ConfigJson` | `Json?` | Org-Flag-Overrides |

**Alternative interim:** Unterbaum in `OrganizationIntegration.configJson` bis M6 — Plan bevorzugt dedizierte Spalte.

### 2.7 Migrations-Reihenfolge (Deploy)

```
M1 (status/json) → M2 (hash/context) → M3 (entities) → M5 (downstream FKs) → M4 (vehicleId nullable) → M6 (org config)
```

Jede Migration: `prisma migrate deploy` auf VPS nach Backup (bestehendes `vps-deploy-release.sh`).

---

## 3. Rückwärtskompatibilität

### 3.1 API-Kompatibilität

| Surface | V1 (bleibt) | V2 (additiv) |
|---------|-------------|--------------|
| Upload | `POST /vehicles/:vehicleId/document-extractions/upload` | `POST /organizations/:orgId/document-extractions/upload` |
| List | Vehicle + Org list | Org list mit erweiterten Filtern |
| Detail / Download | Unverändert | Gleiche DTOs + neue optionale Felder |
| Confirm | `POST .../confirm` | Gleicher Endpoint; intern Plan+Executor wenn Flag |
| Metadata | `/document-extractions/metadata` | + `flags` block |

**DTO-Regel:** Neue Felder (`entityCandidates`, `actionPlan`, `partialApply`) sind **optional** in Responses — alte Frontend-Clients ignorieren sie.

### 3.2 Verhaltens-Kompatibilität

| Bereich | V1 bei Flags OFF | V2 bei Flags ON |
|---------|------------------|-----------------|
| Upload | Vehicle required in URL | Org route; vehicle optional |
| Apply | `DocumentExtractionApplyService` | `ApplyExecutor` wenn Execution-Flag |
| Status terminal | `APPLIED` \| `FAILED` \| `CANCELLED` | + `PARTIALLY_APPLIED` |
| Default document type (Drawer) | `SERVICE` | `AUTO` (Flag + Frontend Phase 9) |
| Plausibility | BLOCKER nur Confirm | Unverändert + erweiterte Pflichtfelder |

### 3.3 Schema-Kompatibilität

- Bestehende `vehicle_document_extractions` Rows: alle neuen Spalten `null`
- `plausibility` JSON: bestehende `_pipeline` Struktur erweitert, nicht ersetzt
- `REJECTED` enum-Wert: deprecated, kein neuer Writer
- Downstream-Domänen: keine neuen parallelen Tabellen

### 3.4 Rollforward bei gemischtem Fleet

Während Phase 13 können Orgs gleichzeitig V1- und V2-Pfade nutzen. `DocumentIntakeV2Config.resolve(orgId)` ist die **einzige** Entscheidungsstelle — kein Verzweigen in UI-Komponenten ohne Config.

---

## 4. Dual Read und Shadow Write

### 4.1 Dual Read

**Definition:** Lesepfade akzeptieren V1- und V2-Datenformate; Mapper normalisieren auf ein kanonisches Detail-DTO.

| Feld | V1 Quelle | V2 Quelle | Normalisierung |
|------|-----------|-----------|----------------|
| Dokumenttyp | `documentType` / `effectiveDocumentType` | `effectiveDocumentType` | `effectiveDocumentType` bevorzugt |
| Fahrzeug | `vehicleId` (required) | `vehicleId` oder `confirmedEntityLinks.vehicle` | Erstes gesetztes |
| Entity-Kontext | implizit aus Upload-URL | `suggestedContext` + `entityCandidates` | Merge ohne Auto-Bind |
| Apply-Status | `status=APPLIED` | `status` + `appliedActionResults` | Integrity-Check bei Read |
| Plan | — | `actionPlanSnapshot` | Optional in Detail-API |

**Implementierung:** `DocumentExtractionDetailMapper` (neu oder erweitert) — Prompt 6.

**Periode:** Ab Phase 3 bis mindestens 90 Tage nach Fleet-Cutover.

### 4.2 Shadow Write

**Definition:** V2-Logik **persistiert** Hilfsdaten und **berechnet** Pläne, führt aber **keine** Downstream-Writes aus, solange Execution-Flag OFF.

| Artefakt | Shadow Write | Bedingung |
|----------|--------------|-----------|
| `entityCandidates` | Ja | `documentEntityResolutionEnabled` |
| `actionPlanSnapshot` bei Confirm-Vorschau | Ja (transient oder cached) | `documentActionPlanEnabled` |
| `actionPlanSnapshot` bei Confirm | Ja (persistiert) | Plan enabled; Execution OFF → Status bleibt `CONFIRMED` ohne Apply **oder** Legacy Apply |
| `contentSha256` | Ja | Immer berechnen ab Phase 7 |
| `appliedActionResults` | Nein | Nur bei Execution |
| `fines` / `invoices` / `damages` | **Nein** | Nur Executor |

**Shadow-Confirm-Modus (Pilot):** User bestätigt → Plan gespeichert → wenn nur Plan-Flag: API returns Plan + `status: CONFIRMED` ohne Domain-Write (explizites Pilot-Verhalten, Flag-gated).

### 4.3 Dual-Write-Verbot

Es gibt **keinen** Dual-Write auf Downstream-Domänen (kein paralleles Legacy+V2 Apply für dieselbe Extraction). `resolveApplyPath()` liefert exakt einen Pfad: `legacy` | `v2` | `blocked`.

---

## 5. Action-Plan-Dry-Run vor echtem Apply

### 5.1 Vertrag (aus Architektur Prompt 2)

```
buildPlan(confirmedData, confirmedEntityLinks, documentType)
  → DocumentActionPlanItem[]

GET  /.../action-plan     → buildPlan() — keine Side Effects
POST /.../confirm         → buildPlan() → execute(plan) — wenn Execution ON
```

**Invariante:** `buildPlan` ist **pure function** modulo DB-Read für Idempotenz-Checks (existing downstream by `extractionId`).

### 5.2 Rollout-Stufen

| Stufe | Verhalten | Flag |
|-------|-----------|------|
| **S0 — None** | Kein Plan-Endpoint | OFF |
| **S1 — Shadow API** | `GET action-plan`; Confirm nutzt Legacy | Plan ON, Execution OFF |
| **S2 — Confirm Preview** | UI zeigt Plan vor Confirm-Button | Plan ON |
| **S3 — Linked Apply** | Confirm ruft `buildPlan` → `execute` | Plan + Execution ON |
| **S4 — Legacy off** | Nur V2 Executor | Execution ON, Legacy OFF |

### 5.3 UI-Gate

- Confirm-Button disabled wenn Plan enthält `BLOCKED` Pflicht-Action
- `BLOCKER` Plausibility → Confirm 400 (bereits V1)
- Dry-Run-Ergebnis im Review-Panel (`ACTION_PREVIEW`) — Prompt 59

### 5.4 Tests vor Stufe S3

| Test | Quelle |
|------|--------|
| Harness Audit 2 (40 cases) | `document-intake-test-matrix-dry-run.ts` |
| Plan ≡ Confirm-Input | AC3 Integration spec |
| FINE ohne eventDate → BLOCKED | AC5 |
| OTHER → ARCHIVE_ONLY | AC9 |

---

## 6. Downstream-Idempotenz

### 6.1 Idempotency-Key-Schema

```
{domain}:{operation}:extraction:{extractionId}
```

Beispiele: `fine:create:extraction:{id}`, `invoice:create:extraction:{id}`, `service_event:create:extraction:{id}`.

### 6.2 Pro Domäne

| Domäne | Mechanismus | Migration |
|--------|-------------|-----------|
| **FINE** | `fines.documentExtractionId` unique; `create` upsert/skip | M5 |
| **INVOICE** | `org_invoices.documentExtractionId` unique | M5 |
| **DAMAGE** | `damages.documentExtractionId` unique | M5 |
| **SERVICE** | `vehicle_service_events` lookup by extraction metadata / serviceEventId on row | Prompt 18 |
| **BRAKE/TIRE/BATTERY** | Evidence `documentExtractionId`; measurement `linkedExtractionId` | Bestehend + Guard |
| **TASK** | `TasksService.upsertByDedup` — nur explizit im Plan | Prompt 51 |

### 6.3 Executor-Verhalten

```typescript
for (const action of plan.actions) {
  if (action.status === 'BLOCKED') throw ApplyBlockedError;
  const existing = await findByIdempotencyKey(action.idempotencyKey);
  if (existing) { mark COMPLETED; continue; }
  await executeAction(action);
}
```

**Recovery-Scheduler:** Vor Re-Apply prüfen ob Downstream existiert (Prompt 19) — verhindert Duplikate nach `CONFIRMED`-Stuck.

### 6.4 PARTIALLY_APPLIED

Wenn Pflicht-Action 1 `COMPLETED`, Pflicht-Action 2 `FAILED`:

- Status → `PARTIALLY_APPLIED`
- `appliedActionResults` JSON mit per-Action Status
- Retry einzelner Actions (später) — nicht in Phase 6 MVP

---

## 7. Bestandsdaten-Reconciliation

### 7.1 Bekannte Ist-Anomalien (Produktion)

| Anomalie | Erkennung | Korrektur |
|----------|-----------|-----------|
| `APPLIED` ohne `fines` row (FINE) | `status=APPLIED AND effectiveDocumentType=FINE AND NOT EXISTS fines` | Script Prompt 9 |
| `APPLIED` ohne `serviceEventId` (Service-Typen) | Typ + null serviceEventId | Mark `PARTIALLY_APPLIED` oder Re-Apply |
| `CONFIRMED` stuck > stale threshold | Recovery scheduler | Re-Apply mit Idempotenz |
| Fehlendes `organizationId` | null org on row | Backfill from vehicle |

### 7.2 Script: `reconcile-document-extractions.ts` (Prompt 9)

**Modi:**

| Modus | Aktion |
|-------|--------|
| `--dry-run` | Report only |
| `--repair-apply` | Re-run V2 Executor für orphaned APPLIED (Flag-gated) |
| `--mark-partial` | Set `PARTIALLY_APPLIED` wo Downstream fehlt |
| `--backfill-hash` | `contentSha256` aus Storage lesen |

**Regeln:**

- Nie `confirmedData` überschreiben
- Nie Downstream löschen ohne `--force` + Platform-Approval
- Audit-Log pro Reparatur in `plausibility._pipeline.actionAudit`

### 7.3 Backfill-Timeline

| Wann | Was |
|------|-----|
| Vor Phase 6 | Dry-run Report auf Prod (read-only) |
| Mit Phase 6 | Orphaned APPLIED reparieren oder `PARTIALLY_APPLIED` |
| Mit Phase 7 | `contentSha256` backfill (async job) |
| Mit Phase 8 | `entityCandidates` nur für neue Extractions |

### 7.4 Produktions-Uploads (n=2)

Beide FINE-JPEGs manuell in Reconciliation-Report aufnehmen: Fahrzeug-Zuordnung vs. Kennzeichen prüfen; keine automatische Fahrzeugänderung ohne User-Audit.

---

## 8. Organisationsweiter Upload

### 8.1 Ziel-API

```
POST /organizations/:orgId/document-extractions/upload
  file: multipart
  requestedDocumentType: AUTO (default)
  suggestedContext?: { vehicleId?, bookingId?, customerId?, driverId?, source }
```

### 8.2 Rollout-Schritte

| Schritt | Änderung | Flag |
|---------|----------|------|
| 1 | Controller + Service-Methode `createFromOrgUpload` | `documentOrgFirstUploadEnabled` |
| 2 | Storage-Pfad ohne `vehicleId` Segment | same |
| 3 | `vehicleId` nullable in DB (M4 Deploy 2) | same |
| 4 | Vehicle-Route als Alias: mappt zu `suggestedContext.vehicleId` | Master ON |
| 5 | Frontend: zentrale Upload-Seite ohne Pflicht-Fahrzeug | Phase 9 |

### 8.3 Guards

- `OrgScopingGuard` + `document-upload:write`
- `suggestedContext.vehicleId` muss zur Org gehören (wenn gesetzt)
- Kein „erstes Fahrzeug der Flotte“ Fallback (verboten, Architektur R2/R3)

### 8.4 Dual Read während Übergang

List/Archive zeigen Extractions mit und ohne `vehicleId`. Filter `vehicleId` optional. Badge „Kein Fahrzeug zugeordnet“ in UI.

---

## 9. Entity Candidate Resolution

### 9.1 Service-Architektur

`DocumentEntityResolverService` (Prompt 21–25):

```
Input:  extractedData, OCR text features, suggestedContext, organizationId
Output: entityCandidates[], conflicts[], overallEntityStatus
```

**Persistenz:** `entityCandidates` JSON am Extraction-Record nach Extraktion (Shadow Write).

### 9.2 Vorschlagsmodus (verbindlich)

| Verhalten | Erlaubt | Verboten |
|-----------|---------|----------|
| Kandidaten anzeigen | Ja | — |
| UI-Kontext als Kandidat | Ja (confidence + `matchReasons`) | — |
| Auto-Set `vehicleId` on create | — | **Nein** |
| Auto-Confirm Booking/Customer | — | **Nein** |
| `PLATE_MISMATCH` bei FINE | BLOCKER | Auto-Resolve |

### 9.3 Confirm-Flow

1. User wählt Kandidaten → `confirmedEntityLinks` JSON
2. `PATCH .../entities` pre-confirm (optional)
3. Plan-Builder nutzt `confirmedEntityLinks` für `LINK_*` Actions
4. `vehicleId` auf Row gesetzt erst bei bestätigtem LINK oder explizitem Vehicle-Action

### 9.4 Rollout

| Phase | Scope |
|-------|-------|
| Dev/Staging | Resolver ON, alle Orgs |
| Prod Pilot | 1 Org, `documentEntityResolutionEnabled` |
| Fleet | Schrittweise Org-Overrides |

---

## 10. Frontend-Konsolidierung

### 10.1 Ist-Divergenz (Inventur)

| Flow | Default Type | Poll APPLIED | Archive |
|------|--------------|--------------|---------|
| `DocumentUploadView` | AUTO | Ja | Org list |
| `VehicleDocumentUploadDrawer` | SERVICE | **Nein** (done on confirm) | Nein |
| `OperatorAiUploadFlow` | Config | Teilweise | Nein |

### 10.2 Ziel: eine State-Machine

Gemeinsame Basis: `useDocumentExtractionFlow` erweitert oder `useDocumentIntakeFlow` (neu) mit:

- Einheitlicher Poll bis `APPLIED` \| `PARTIALLY_APPLIED` \| `FAILED`
- `AUTO` Default überall (Prompt 29)
- Keine Fachfelder vor OCR abgeschlossen (Architektur R4)
- Action-Plan-Preview Panel (Prompt 59)
- Entity-Kandidaten-Selector (Prompt 27–28)

### 10.3 Konsolidierungs-Reihenfolge

| Schritt | Dateien | Risiko |
|---------|---------|--------|
| 1 | `document-extraction-lifecycle.ts` — `PARTIALLY_APPLIED` | Niedrig |
| 2 | `useDocumentExtractionFlow` — poll through APPLIED | Mittel |
| 3 | Shared `DocumentReviewPanel` extrahieren | Mittel |
| 4 | Drawer → shared review + AUTO default | Mittel |
| 5 | Operator flow → shared hook | Niedrig |
| 6 | `FinesView.AIUploadFlow` → Deprecation / Redirect (Prompt 50) | Hoch — separat flaggen |

### 10.4 Feature-Flag im Frontend

Flags aus `GET /document-extractions/metadata` → `flags` — kein `import.meta.env` für Apply-Pfade.

---

## 11. Archivmigration

### 11.1 Ist

- `GET /organizations/:orgId/document-extractions` — paginiert, Filter: `vehicleId`, `status`, `documentType`
- Keine Suche nach invoiceNumber, customer, booking

### 11.2 Ziel (Archive V2)

| Capability | Umsetzung |
|------------|-----------|
| Org-primary Navigation | Upload-Seite + Documents-Tab |
| Filter | status, documentType, vehicleId, customerId, bookingId, dateRange, fileName |
| Invoice # Suche | JSON path / denormalized `confirmedData.invoiceNumber` — Index Strategy Prompt 67 |
| PARTIALLY_APPLIED | Status-Badge + Action-Results |
| Download | Unverändert authentifiziert |

### 11.3 Migration ohne Datenbewegung

Archive V2 ist **Read-Model-Erweiterung** — keine separate Archiv-Tabelle. Bestehende Rows erscheinen mit normalisiertem Mapper (Dual Read).

### 11.4 Indizes (additiv, Prompt 67)

```prisma
@@index([organizationId, status, createdAt])
@@index([organizationId, effectiveDocumentType, createdAt])
// Optional GIN auf confirmedData — nur nach Query-Plan-Analyse
```

---

## 12. Security-Härtung

### 12.1 Bereits vorhanden (beibehalten)

- Private `objectKey` — kein Static-Serve
- Magic-byte MIME validation
- `OrgScopingGuard`, `VehicleOwnershipGuard`
- `Cache-Control: no-store` auf Download
- `AI_EXTERNAL_ACTIONS_REQUIRE_APPROVAL=true` (kein Auto-Kontakt)

### 12.2 V2-Erweiterungen

| Maßnahme | Phase | Prompt |
|----------|-------|--------|
| Upload Rate Limit | 12 | 43 |
| ZIP/PDF bomb guards | 12 | 44 |
| Password-protected PDF reject | 12 | 37 |
| Malware scan (log_only → fail_closed) | 12–13 | 40+, Flag |
| Download audit log | 11–12 | 68 |
| OCR text retention / GDPR delete | 11 | 69–70 |
| Org-first route AuthZ review | 8 | Security review |
| Kein Public AI-Upload | immer | Deprecate Invoice public path |

### 12.3 Malware-Scan-Rollout

```
disabled → log_only (Phase 12) → fail_open pilot → fail_closed (nur nach documentMalwareScanValidated)
```

**Fail-Closed:** Upload rejected wenn Scanner unavailable — nur nach 7d grünem `document_malware_scanner_unavailable_total`.

---

## 13. Golden-Fixture- und OCR-Regressionstests

### 13.1 Test-Pyramide

| Ebene | Artefakt | CI |
|-------|----------|-----|
| Unit | Plan builder, plausibility, file ID | Jest, jede PR |
| Integration | Pipeline mit mocked Mistral | `document-extraction.pipeline.integration.spec.ts` |
| Harness | 40-case matrix dry-run | `document-intake-test-matrix-dry-run.ts` |
| Golden | Mistral OCR/classify/extract JSON | `__fixtures__/mistral/` (Prompt 35–36, 76) |
| E2E | Staging upload → review → dry-run | Prompt 78 (nicht Prod) |
| Load | Concurrent uploads | Prompt 80 |

### 13.2 Golden-Fixture-Struktur (Prompt 76)

```
backend/src/modules/document-extraction/__fixtures__/mistral/
  ocr/
    fine-parking-jpeg.json
    service-invoice-pdf.json
    ...
  classification/
    fine-high-confidence.json
    ambiguous-other.json
    ...
  extraction/
    fine-v4-schema.json
    invoice-multi-rate.json
    ...
```

**Regeln:**

- Keine echten PII — synthetische Kennzeichen
- Keine Binärdateien in Golden JSON — nur normalisierte Provider-Responses
- Live-Integration: `DOCUMENT_EXTRACTION_LIVE_INTEGRATION=1` — optional, nicht CI-blocking

### 13.3 OCR-Regression

| Szenario | Fixture | Gate |
|----------|---------|------|
| PDF local text vs OCR route | minimal PDF + scanned PDF | Routing 75%+ (Audit 2 baseline) |
| Multi-page PDF | Prompt 38 corpus | Page count preserved |
| JPEG EXIF rotation | Prompt 39 | Text extraction stable |
| 10MB near-limit | Prompt 41 | Upload accepted, queue stable |
| Classification threshold | 30 synthetic cases | 96.7%+ (Audit 2) |

### 13.4 Apply-Matrix (Prompt 77)

Alle 13 `ApplyDocumentExtractionType` — je mindestens 1 Harness-Case mit erwartetem `WOULD_CREATE` oder `BLOCKED`.

---

## 14. Produktions-Shadow-Phase

### 14.1 Definition

**Shadow Phase** = V2 Master ON mit Plan/Entity/Archive, aber **kein** V2 Apply (oder nur Dry-Run) auf Produktion, beobachtet mit Monitoring.

### 14.2 Stufen

| Stufe | Prod-Config | User-sichtbar |
|-------|-------------|---------------|
| **Shadow-0** | Nur Runtime/Stability fixes | Nein |
| **Shadow-1** | Master + OrgUpload + Archive + Entity (1 Org) | Org-Upload Pilot |
| **Shadow-2** | + Action Plan API | Plan-Preview für Pilot-Org |
| **Shadow-3** | + Execution V2 FINE only (1 Org) | FINE Apply mit Integrity |
| **Shadow-4** | + weitere Typen schrittweise | Erweiterte Pilot-Org |
| **Cutover** | Legacy Apply OFF fleet-wide | Voll V2 |

### 14.3 Pilot-Kriterien (Prompt 83)

| Metrik | Schwelle |
|--------|----------|
| Uploads im Pilot | ≥ 50, multi-format |
| OCR success | ≥ 95% |
| `applied_without_downstream` | 0 |
| `follow_up_auto_execute` | 0 |
| PM2 restarts | Keine Regression vs. Baseline |
| User-reported mis-routing | 0 P0 |

### 14.4 Beobachtung

- Grafana Dashboard „Document Intake V2 Rollout“ (Prompt 72)
- Wöchentlicher Reconciliation-Report (dry-run)
- Platform-Review vor jeder Stufen-Erhöhung

### 14.5 Cutover-Entscheid (Prompt 84)

Checkliste AC1–AC12 (Architektur Prompt 2) + RF01–RF14 (Flags Prompt 3) + MR01–MR15 (§17 unten).

---

## 15. Rollback ohne Verlust bestätigter Dokumente

### 15.1 Unverletzliche Daten

Diese Daten dürfen bei **keinem** Rollback-Stufe gelöscht werden:

| Artefakt | Grund |
|----------|-------|
| `vehicle_document_extractions` Rows | Audit-Pflicht |
| `confirmedData` / `confirmedEntityLinks` | User-Bestätigung |
| `objectKey` Binärdatei (bis GDPR-Delete) | Beweislast |
| `plausibility._pipeline.actionAudit` | Compliance |
| Bereits erstellte Downstream-Rows | Domänen-Wahrheit |

### 15.2 Rollback-Stufen (operativ)

| Stufe | Aktion | User-Impact |
|-------|--------|-------------|
| **R1** | Sub-Flag OFF (O Runtime) | Feature weg, Daten bleiben |
| **R2** | `documentActionExecutionV2Enabled=false` | Kein V2-Apply; Legacy wenn ON |
| **R3** | `documentIntakeV2Enabled=false` | V1 Routes/Verhalten |
| **R4** | Frontend Deploy Rollback | Alte UI |
| **R5** | Code Revert | V1 Codepfad |

**Nach R3:** Bestätigte Dokumente (`CONFIRMED`, `APPLIED`, `PARTIALLY_APPLIED`) bleiben lesbar und downloadbar über Org-API.

### 15.3 Sonderfall PARTIALLY_APPLIED

- Downstream-Teil bleibt bestehen
- Rollback Execution OFF → kein automatisches Rollback der Domäne
- Manuelle Kompensation über Domänen-UI (Fine löschen, etc.) — außerhalb Intake

### 15.4 Sonderfall CONFIRMED ohne Apply

Bei Rollback während `CONFIRMED` (Apply unterbrochen):

- Recovery-Scheduler setzt nach Flag-Re-Enable fort
- Idempotenz verhindert Doppel-Apply
- User sieht „Apply ausstehend“ nach Re-Enable

### 15.5 Schema-Rollback

**Kein** Rollback von M1–M6 Migrationen in Produktion. Neue Spalten bleiben nullable; alte Code-Version ignoriert sie.

---

## 16. Prompt-Mapping (5–84)

Kompakte Zuordnung der Implementierungs-Prompts zu Rollout-Phasen:

| Phase | Prompts |
|-------|---------|
| 1 Runtime Stability | 71, 73 |
| 2 Safety Gates | 5, 10, 33–34, 74 |
| 3 Schema | 8, 13, 26, 14–17 |
| 4 Action Plan | 5–6, 11–12 |
| 5 Domain Guards | 31–32, 45–49 |
| 6 Apply Execution | 7–10, 45–52 |
| 7 Deduplizierung | 13–20 |
| 8 Entity Routing | 21–28 |
| 9 Frontend | 29–31, 59–66 |
| 10 Follow-ups | 51–52, 60 |
| 11 Archive | 63, 67–69 |
| 12 Monitoring + Security | 37–44, 68, 72–73, 81 |
| 13 Shadow Rollout | 75–84 |

Vollständige Datei-Matrix: Inventur §16.

---

## 17. Abnahmekriterien (Prompt 4)

| ID | Kriterium |
|----|-----------|
| MR01 | Alle 14 Planungsbereiche (§2–§15) dokumentiert |
| MR02 | Rollout-Reihenfolge 1–13 verbindlich definiert |
| MR03 | Prisma-Migrationen additiv; `vehicleId` nullable zweistufig |
| MR04 | Dual Read + Shadow Write ohne Dual-Write auf Domänen |
| MR05 | Action-Plan-Dry-Run vor Apply mit Stufen S0–S4 |
| MR06 | Idempotency-Keys + Downstream-FKs spezifiziert |
| MR07 | Reconciliation-Script-Modi für orphaned APPLIED |
| MR08 | Org-Upload-Rollout mit `suggestedContext` |
| MR09 | Entity Resolution nur Vorschlagsmodus |
| MR10 | Frontend-Konsolidierung mit Ist-Divergenz-Mapping |
| MR11 | Archive als Read-Model-Erweiterung |
| MR12 | Security-Härtung inkl. Malware-Stufen |
| MR13 | Golden-Fixture-Struktur + OCR-Regression-Gates |
| MR14 | Produktions-Shadow-Stufen 0–4 + Pilot-Kriterien |
| MR15 | Rollback R1–R5 ohne Verlust `confirmedData` |

---

## Referenzen

- [`document-intake-v2.md`](./document-intake-v2.md)
- [`document-intake-v2-rollout-flags.md`](./document-intake-v2-rollout-flags.md)
- [`../audits/document-intake-v2-implementation-inventory.md`](../audits/document-intake-v2-implementation-inventory.md)
- [`../audits/document-intake-production-reality.md`](../audits/document-intake-production-reality.md)
- [`../audits/document-intake-test-matrix.md`](../audits/document-intake-test-matrix.md)
- `backend/prisma/schema.prisma` — `VehicleDocumentExtraction`
- `backend/scripts/audit/document-intake-test-matrix-dry-run.ts`

**Nächste Prompts:**

- **Prompt 5/84:** `DocumentExtractionApplyPlanService` + Dry-Run API (Phase 4)
- **Prompt 6/84:** `GET action-plan` Controller + DTO Mapper
- **Prompt 7/84:** Apply Integrity Gate — `APPLIED` nur bei Downstream-Erfolg

---

*Implementierungsstatus: **Spezifikation only**. Keine Code-Änderungen in Prompt 4.*
