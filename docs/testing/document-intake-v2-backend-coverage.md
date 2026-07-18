# Document Intake V2 — Backend Test Coverage

Stand: 2026-07-17 (Prompt 80/84)  
Scope: Backend-Tests für Document Intake V2 — Upload, Pipeline, Klassifikation, Schema, Action Plan, Apply, Follow-ups, Archiv, Tenant-Isolation.

## Ausführung

```bash
cd backend

# Gesamtpaket (Unit, ohne Live-Integration)
npm run test:document-intake:v2

# Integration (Pipeline, Apply-Lifecycle, Race/Idempotenz)
npm run test:document-intake:v2:integration

# Live-Integration (Mistral/OCR — opt-in)
DOCUMENT_INTAKE_V2_LIVE_INTEGRATION=1 bash scripts/test/document-intake-v2-verify.sh integration

# Vollständige Verifikation: Unit + Integration + Matrix + Prisma + tsc + Build
npm run test:document-intake:v2:verify

# Teilbefehle
npm run test:document-intake:v2:verify:unit
bash scripts/test/document-intake-v2-verify.sh integration
bash scripts/test/document-intake-v2-verify.sh matrix
bash scripts/test/document-intake-v2-verify.sh prisma
bash scripts/test/document-intake-v2-verify.sh typecheck
bash scripts/test/document-intake-v2-verify.sh build
```

**Jest-Muster (Unit):** `modules/document-extraction` — `integration`- und `live.integration`-Specs werden per Default ausgeschlossen.

**Letzter Lauf (`npm run test:document-intake:v2:verify`):**

| Schritt | Ergebnis |
|---------|----------|
| Unit (`test:document-intake:v2`) | **108 Suites / 682 Tests** — alle grün |
| Integration (`test:document-intake:v2:integration`) | **3 Suites / 23 Tests** — alle grün |
| Matrix dry-run (T01–T40) | grün |
| `prisma validate` | grün (1 bestehende Schema-Warnung `onDelete SetNull`) |
| `tsc --noEmit -p tsconfig.document-intake.json` | grün |
| `npm run build` | grün |

---

## Abdeckungsmatrix (24 Bereiche)

| # | Bereich | Status | Primäre Testdateien |
|---|---------|--------|---------------------|
| 1 | **File Identification** | ✅ | `document-file-identification.service.spec.ts`, `document-file-identification.security.spec.ts` |
| 2 | **Content Hash** | ✅ | `document-extraction-upload-hash.spec.ts`, `document-content-cache.util.spec.ts` |
| 3 | **Duplicate Policy** | ✅ | `document-extraction-upload-duplicate.spec.ts`, `document-upload-duplicate.util.spec.ts` |
| 4 | **Malware Scan Mock** | ✅ | `document-malware-scan.service.spec.ts`, `document-extraction-upload-malware-scan.spec.ts`, `document-extraction-test.helpers.ts` (`makeMalwareScanMock`) |
| 5 | **Org-first Upload** | ✅ | `document-extraction-upload-org.spec.ts`, `document-upload-context.service.spec.ts`, `document-upload-context.util.spec.ts` |
| 6 | **Queue und Recovery** | ✅ | `document-extraction.service.queue.spec.ts`, `document-extraction.processor.spec.ts`, `diagnostic/document-intake-recovery.spec.ts`, `diagnostic/document-intake-reconciliation.service.spec.ts` |
| 7 | **Klassifikation** | ✅ | `document-classification-decision.util.spec.ts`, `document-classification-taxonomy.util.spec.ts`, `document-extraction.pipeline.integration.spec.ts` |
| 8 | **Schema Registry** | ✅ | `document-schema-registry.spec.ts`, `document-extraction-schema-resolve.util.spec.ts`, `document-extraction.schemas.spec.ts` |
| 9 | **Extraction** | ✅ | `document-structured-extraction.util.spec.ts`, `document-intake-golden-corpus.spec.ts`, `document-extraction.pipeline.integration.spec.ts` |
| 10 | **Field Provenance** | ✅ | `document-field-provenance.util.spec.ts`, `document-action-plan.field-provenance.spec.ts` |
| 11 | **Required Fields** | ✅ | `document-schema-registry.spec.ts`, `document-action-plan.builder.spec.ts`, `document-action-plan-preview.builder.spec.ts` |
| 12 | **Plausibility und BLOCKER** | ✅ | `document-extraction-plausibility.service.spec.ts`, `document-extraction-plausibility.conflicts.spec.ts`, `document-plausibility-gate.util.spec.ts` |
| 13 | **Entity Candidate Resolver** | ✅ | `vehicle-candidate-resolver.service.spec.ts`, `booking-candidate-resolver.service.spec.ts`, `customer-candidate-resolver.service.spec.ts`, `driver-candidate-resolver.service.spec.ts`, `partner-candidate-resolver.service.spec.ts`, `entity-candidate-ranking.policy.spec.ts` |
| 14 | **Link Confirmation** | ✅ | `document-entity-link.service.spec.ts`, `document-entity-link.util.spec.ts`, `executors/link-entity-document-action.executor.spec.ts` |
| 15 | **Action Planner** | ✅ | `document-action-plan.builder.spec.ts`, `document-action-planner.*.spec.ts`, `document-action-planner.damage-rules.spec.ts` |
| 16 | **Action Preview API** | ✅ | `document-action-plan-preview.service.spec.ts`, `document-action-plan-preview.builder.spec.ts`, `document-action-plan-preferences.util.spec.ts` |
| 17 | **Action Executors** | ✅ | `executors/*.spec.ts`, `document-action-orchestrator.service.spec.ts` |
| 18 | **Idempotenz** | ✅ | `document-action-orchestrator.service.spec.ts`, `executors/create-*-document-action.executor.spec.ts`, `document-intake-v2-race-conditions.integration.spec.ts` |
| 19 | **PARTIALLY_APPLIED** | ✅ | `document-action-plan.state-machine.spec.ts`, `document-action-plan.state-machine.integration.spec.ts`, `document-apply-result.mapper.spec.ts`, `document-extraction-retry-failed-actions.spec.ts` |
| 20 | **Fine** | ✅ | `document-action-planner.fine-rules.spec.ts`, `executors/create-fine-document-action.executor.spec.ts`, `__fixtures__/document-fine-fixtures.ts` |
| 21 | **Invoice** | ✅ | `document-action-planner.invoice-rules.spec.ts`, `executors/create-invoice-document-action.executor.spec.ts`, `document-invoice-extraction.rules.spec.ts` |
| 22 | **Service / Compliance** | ✅ | `document-action-planner.service-rules.spec.ts`, `document-action-planner.inspection-rules.spec.ts`, `executors/create-service-document-action.executor.spec.ts`, `executors/update-vehicle-from-extraction-document-action.executor.spec.ts` |
| 23 | **Damage** | ✅ | `document-action-planner.damage-rules.spec.ts`, `document-damage-extraction.rules.spec.ts`, `executors/create-damage-document-action.executor.spec.ts` |
| 24 | **Tire / Brake / Battery** | ✅ | `document-action-planner.technical-rules.spec.ts`, `executors/apply-technical-document-action.executor.spec.ts` |
| 25 | **Follow-ups** | ✅ | `document-follow-up-suggestion.service.spec.ts`, `document-follow-up-suggestion.generator.spec.ts`, `document-follow-up-subtype-rules.spec.ts`, `document-follow-up-task.materializer.spec.ts`, `document-follow-up-contact-prepare.service.spec.ts`, `document-follow-up-resync.service.spec.ts` |
| 26 | **Archive** | ✅ | `document-extraction-archive-index.materializer.spec.ts`, `document-extraction-archive-query.util.spec.ts`, `document-extraction-archive-index.service.spec.ts`, `executors/archive-document-action.executor.spec.ts` |
| 27 | **Tenant Isolation** | ✅ | `document-intake-v2-tenant-isolation.spec.ts`, `document-extraction.controller.security.spec.ts`, `document-extraction-lifecycle.service.spec.ts`, `document-extraction-upload-org.spec.ts` |
| 28 | **Race Conditions** | ✅ | `document-intake-v2-race-conditions.integration.spec.ts`, `document-action-plan.state-machine.integration.spec.ts` |

Legende: ✅ abgedeckt · ⚠️ teilweise · ❌ Lücke

---

## Neu in Prompt 80

| Datei | Zweck |
|-------|--------|
| `document-action-plan.builder.spec.ts` | Builder für alle Domänen + `assertExecutableActionPlan` / BLOCKED / PARTIALLY_APPLIED |
| `document-apply-result.service.spec.ts` | Thin-Service-Delegierung an Apply-Result-Mapper |
| `document-follow-up-resync.service.spec.ts` | Resync nach Plan-Änderung (Guards + Orchestrator-Sync) |
| `executors/update-vehicle-from-extraction-document-action.executor.spec.ts` | Compliance-Update + Service-History-Refresh |
| `document-extraction-retry-failed-actions.spec.ts` | `retryFailedActions` für PARTIALLY_APPLIED |
| `document-intake-v2-tenant-isolation.spec.ts` | Cross-tenant Upload + Org/Vehicle-Guards |
| `document-intake-v2-race-conditions.integration.spec.ts` | Doppel-Confirm / Idempotenz auf Orchestrator |
| `scripts/test/document-intake-v2-verify.sh` | Einheitliches Verify-Skript |
| `tsconfig.document-intake.json` | Modul-scoped Typecheck |
| `document-extraction-test.helpers.ts` | `spreadDocumentExtractionExtendedServiceMocks()` für 22-arg Service-Konstruktor |

---

## Testkit & Matrix

| Asset | Pfad |
|-------|------|
| Shared mocks | `document-extraction-test.helpers.ts` |
| Golden corpus | `__fixtures__/golden/`, `document-intake-golden-corpus.spec.ts` |
| Domain fixtures | `__fixtures__/document-*-fixtures.ts` |
| Audit matrix T01–T40 | `scripts/audit/document-intake-test-matrix-dry-run.ts` |

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/audit/document-intake-test-matrix-dry-run.ts
```

---

## Detail: kritische Pfade

### Upload → Queue → Processor

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| MIME/Kind-Erkennung | Unit | `document-file-identification.service.spec.ts` |
| SHA-256 Content Anchor | Unit | `document-extraction-upload-hash.spec.ts` |
| Duplicate EXACT / BUSINESS | Unit | `document-extraction-upload-duplicate.spec.ts` |
| Malware scan disabled mock | Unit | `document-extraction-upload-malware-scan.spec.ts` |
| Org-Inbox ohne Vehicle | Unit | `document-extraction-upload-org.spec.ts` |
| Enqueue + Processor happy path | Integration | `document-extraction.pipeline.integration.spec.ts` |

### Review → Action Plan → Apply

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Preview cards + preferences | Unit | `document-action-plan-preview.*.spec.ts` |
| Plan builder pro Domäne | Unit | `document-action-plan.builder.spec.ts` |
| Lifecycle APPLIED / WARNINGS / FAILED | Integration | `document-action-plan.state-machine.integration.spec.ts` |
| PARTIALLY_APPLIED + retry API | Unit | `document-extraction-retry-failed-actions.spec.ts` |
| Public apply result DTO | Unit | `document-apply-result.mapper.spec.ts`, `document-apply-result.service.spec.ts` |
| Executor idempotency | Unit + Integration | `executors/*.spec.ts`, `document-intake-v2-race-conditions.integration.spec.ts` |

### Follow-up & Archiv

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Subtype rules + generator | Unit | `document-follow-up-subtype-rules.spec.ts`, `document-follow-up-suggestion.generator.spec.ts` |
| Task materialization | Unit | `document-follow-up-task.materializer.spec.ts` |
| Resync nach Review-Änderung | Unit | `document-follow-up-resync.service.spec.ts` |
| Archive read model / query | Unit | `document-extraction-archive-*.spec.ts` |

---

## Hinweise

- **Live-Integration:** `document-extraction.live.integration.spec.ts` ist nicht Teil des Standard-Verify-Laufs (`DOCUMENT_INTAKE_V2_LIVE_INTEGRATION=1` erforderlich).
- **Typecheck:** Verify nutzt `tsconfig.document-intake.json` (modul-scoped). Voller Backend-`tsc` kann weiterhin Fehler außerhalb `document-extraction` melden.
- **Service-Konstruktor:** Specs mit `DocumentExtractionService` nutzen `spreadDocumentExtractionExtendedServiceMocks()` für die sechs V2-Neben-Services (Preview, Apply-Result, Follow-up, Archiv).
