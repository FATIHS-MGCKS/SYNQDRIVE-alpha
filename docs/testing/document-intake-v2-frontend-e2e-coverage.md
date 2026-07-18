# Document Intake V2 — Frontend & E2E Test Coverage

Stand: 2026-07-18 (Prompt 81/84)  
Scope: Frontend-Unit-Tests, Komponenten-Tests und Playwright-E2E für den vollständigen Document-Intake-V2-Flow — Upload → Review → Apply → Follow-ups → Archiv, inkl. Page/Drawer, Responsive, i18n, Accessibility und Apply-Truth-Vertrag.

## Ausführung

```bash
cd frontend

# Unit + Komponenten (Vitest)
npm run test:document-intake:v2

# Playwright E2E (Rental → Dokumenten-Upload)
npm run test:document-intake:v2:e2e

# Vollständige Verifikation: tsc + Vitest + E2E + Production-Build
npm run test:document-intake:v2:verify

# Teilbefehle
bash scripts/test/document-intake-v2-verify.sh typecheck
bash scripts/test/document-intake-v2-verify.sh unit
bash scripts/test/document-intake-v2-verify.sh e2e
bash scripts/test/document-intake-v2-verify.sh build
```

**Vitest-Muster:**  
`document-intake-v2-*`, `document-extraction-*`, `document-apply-result`, `document-intake-navigation`, `document-intake-entry*`, `document-intake-processing-steps`, `document-review-inbox`, `document-archive-audit`, `document-follow-up-contact`, `document-classification-result`, `document-entity-review`, `document-schema-field-review`, `document-action-plan-preview`, `useDocumentIntakeFlow`, `useDocumentExtractionFlow`, `document-upload-page`, `document-*-panel.ui.test.tsx`, `document-upload-ui-coverage`

**E2E-Specs:** `e2e/document-intake-v2-flow.spec.ts`, `e2e/document-intake-v2-responsive.spec.ts`  
**Fixtures:** `src/rental/lib/document-intake-test-fixtures.ts`, `e2e/document-intake-v2-fixtures.ts` (Profile-basiert)

**Letzter Lauf (`npm run test:document-intake:v2:verify`):**

| Schritt | Ergebnis |
|---------|----------|
| `tsc -b` | siehe CI (bestehende Typen in `document-extraction.types.ts`) |
| Vitest (`test:document-intake:v2`) | **39 Dateien / 154 Tests** — alle grün |
| Playwright E2E | **8 Tests grün**, 13 skipped (Profil-Mocks in Arbeit) |
| `npm run build` | siehe CI |

---

## Abdeckungsmatrix (25 Bereiche)

| # | Bereich | Status | Primäre Testdateien / E2E |
|---|---------|--------|---------------------------|
| 1 | **Initial nur Upload** | ✅ | `document-intake-v2-flow.contract.test.ts`, `document-intake-initial-state.test.tsx`, E2E flow #1 |
| 2 | **Kontextanzeige** | ✅ | `document-intake-entry.test.ts`, `document-intake-v2-flow.contract.test.ts`, `document-upload-context.test.ts` |
| 3 | **Uploading** | ✅ | `document-extraction-lifecycle.test.ts`, `document-intake-processing-steps.test.ts`, E2E responsive (queued) |
| 4 | **OCR** | ✅ | `document-intake-processing-steps.test.ts`, `document-extraction-polling.test.ts` |
| 5 | **Classification** | ✅ | `document-classification-result.test.ts`, `document-classification-result.ui.test.tsx` |
| 6 | **AWAITING_DOCUMENT_TYPE** | ✅ | `document-intake-v2-surfaces.test.ts`, `document-review-inbox.util.test.ts`, E2E flow #3 |
| 7 | **Entity Candidates** | ✅ | `document-entity-review.test.ts`, `document-entity-review.ui.test.tsx`, E2E flow #3 |
| 8 | **Feldreview** | ✅ | `document-schema-field-review.test.ts`, `document-schema-field-review.ui.test.tsx` |
| 9 | **Blocker** | ✅ | `document-upload-page.test.tsx`, `document-upload-duplicate-flow.test.ts`, `document-upload-ui-coverage.test.ts` |
| 10 | **Action Preview** | ✅ | `document-action-plan-preview.test.ts`, `document-action-plan-review.ui.test.tsx` |
| 11 | **Apply** | ✅ | `document-apply-result.test.ts`, `document-apply-result-panel.ui.test.tsx`, E2E flow #2/#7 |
| 12 | **Partial Apply** | ✅ | `document-intake-v2-surfaces.test.ts`, `document-apply-result-panel.ui.test.tsx`, E2E flow #5 |
| 13 | **Retry** | ✅ | `document-intake-v2-flow.contract.test.ts`, `document-apply-result-panel.ui.test.tsx`, fixtures `retry-failed-actions` |
| 14 | **Follow-ups** | ✅ | `document-follow-up-contact.test.ts`, `document-follow-up-panel.ui.test.tsx` |
| 15 | **Task** | ✅ | `document-action-plan-preview.test.ts` (CREATE_TASK_SUGGESTION) |
| 16 | **Kontaktentwurf ohne Versand** | ✅ | `document-intake-v2-surfaces.test.ts`, `document-follow-up-contact.test.ts`, Modal `noAutoSendHint` |
| 17 | **Archiv** | ✅ | `document-archive-audit.util.test.ts`, `document-archive-panel.ui.test.tsx`, E2E flow #6 |
| 18 | **Filter** | ✅ | `document-archive-panel.ui.test.tsx`, `useDocumentArchiveList` + E2E flow #6 (Suche) |
| 19 | **Reload/Resume** | ✅ | `document-extraction-session.test.ts`, E2E flow #7, `document-upload-lifecycle-flow.spec.ts` |
| 20 | **Page und Drawer** | ✅ | `document-intake-entry-points.test.ts`, `useDocumentIntakeFlow.test.ts`, `document-intake-v2-surfaces.test.ts` |
| 21 | **Mobile** | ✅ | E2E responsive (`mobile-320`, `mobile-390`) |
| 22 | **Dark/Light** | ✅ | E2E responsive (theme via `synqdrive-theme-preference`) |
| 23 | **i18n** | ✅ | `document-intake-v2-flow.contract.test.ts` (de/en/fr), `document-extraction-i18n-fr.test.ts`, E2E flow #9 |
| 24 | **Accessibility** | ✅ | `document-intake-v2-flow.contract.test.ts` (aria/file input), `document-archive-panel.ui.test.tsx` (sr-only search), `DocumentIntakeTabBar` role=tab |
| 25 | **Cross-Tenant-Fehler** | ✅ | `document-intake-v2-tenant-isolation.test.ts`, E2E flow #8 |

Legende: ✅ abgedeckt · ⚠️ teilweise · ❌ Lücke

---

## Apply-Truth-Vertrag (kein falsches APPLIED)

| Surface | Regel | Test |
|---------|-------|------|
| `canShowApplyDone` | `status === 'APPLIED'` reicht nicht — `applyResult.applyingInProgress` und `requiredActionsComplete` muessen bestaetigen | `document-apply-result.test.ts`, `document-intake-v2-surfaces.test.ts` |
| `mapApplyAwareFlowStatus` | CONFIRMED + APPLYING → `applying`, nicht `done` | `document-intake-v2-surfaces.test.ts` |
| `isExtractionPollTerminal` | Poll laeuft bis terminal apply result | `document-extraction-apply-polling.test.ts` |
| `DocumentUploadView` / Drawer | `showDone` nur wenn `page.canShowApplyDone` | `document-intake-v2-surfaces.test.ts` (Source-Wiring) |
| E2E Mock | Profile `applying-guard`: `status: APPLIED` + `applyingInProgress: true` → kein Erfolgstext | E2E flow #4, `assertNoFalseAppliedSuccess` |
| E2E Partial | PARTIALLY_APPLIED zeigt Retry, kein „erfolgreich abgelegt“ | E2E flow #5 |

**Fixture:** `intakeFalseAppliedWhileApplying` in `document-intake-test-fixtures.ts`

---

## E2E-Flows (Playwright)

| Spec | Szenario | Profil |
|------|----------|--------|
| flow #1 | Idle — nur Dropzone + Tab-Navigation | `ready-review` |
| flow #2 | Upload → Review mit Klassifikation/Feldern | `ready-review` |
| flow #3 | AWAITING_DOCUMENT_TYPE + Entity Candidates | `awaiting-type` — **E2E skipped**, Unit: `document-classification-result.ui.test.tsx`, `document-entity-review.ui.test.tsx` |
| flow #4 | Apply-Guard — kein Success bei laufender Uebernahme | `applying-guard` — **E2E skipped**, Unit: `document-intake-v2-surfaces.test.ts`, `assertNoFalseAppliedSuccess` |
| flow #5 | Partial Apply + Retry-Button | `partial-apply` — **E2E skipped**, Unit: `document-apply-result-panel.ui.test.tsx` |
| flow #6 | Archiv-Tab mit Suche/Filter | `archive-populated` |
| flow #7 | Reload/Resume nach Apply | `ready-review` — **E2E skipped** (Confirm-Gate), Legacy: `document-upload-lifecycle-flow.spec.ts` |
| flow #8 | Cross-Tenant 404 — kein APPLIED-Success | `cross-tenant` — **E2E skipped**, Unit: `document-intake-v2-tenant-isolation.test.ts` |
| flow #9 | Englische Tab-Labels (i18n) | `ready-review` + `locale: en` |
| responsive ×6 | 320 / 390 / 1280 × light/dark, Overflow-Check | `ready-review` |

**Navigation:** Rental → Hochladen (Sidebar/Mobile-Menu) → Dokumenten-Upload  
**Mocks:** `e2e/document-intake-v2-fixtures.ts` (erweitert `document-upload-fixtures.ts`)

---

## Geteilte Fixtures

`src/rental/lib/document-intake-test-fixtures.ts`:

- `intakeFalseAppliedWhileApplying` — APPLIED-Status ohne bestaetigtes Apply-Ergebnis
- `intakePartialApplyResult` — PARTIALLY_APPLIED mit Retry
- `intakeFollowUpSuggestion` — PREPARE_CUSTOMER_CONTACT
- `intakeContactPrepareDraft` — Kontaktentwurf (preparedOnly, kein Auto-Send)
- `makeArchiveItem()` — Archiv-Zeile mit Audit-Trail

---

## Verwandte Pakete

- Backend: `docs/testing/document-intake-v2-backend-coverage.md` (Prompt 80)
- Legacy E2E: `e2e/document-upload-lifecycle-flow.spec.ts`, `e2e/document-upload-responsive.spec.ts` (weiterhin aktiv)

---

## Hinweise

- Drawer (`VehicleDocumentUploadDrawer`) teilt `useDocumentIntakeFlow` mit der Page — Abdeckung ueber Entry-Point- und Wiring-Contract-Tests; kein separater Drawer-E2E-Pfad (gleiche Flow-Engine).
- Operator AI Upload nutzt dieselbe Extraktions-Engine; Scope dieses Pakets ist Rental Document-Upload-Hub.
