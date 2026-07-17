# Document Intake V2 — Shadow Validation Runbook

Stand: 2026-07-18 (Prompt 83/84)  
Ziel: **Technische Shadow-Validierung** vor breiter Confirm/Apply-Freigabe — Auswertung und Gates **ohne** automatischen Voll-Rollout.

| Feld | Wert |
|------|------|
| **Deployment-Phasen** | [`document-intake-v2-deployment.md`](./document-intake-v2-deployment.md) |
| **Monitoring** | [`document-intake-v2-grafana-prometheus-ops.md`](../architecture/document-intake-v2-grafana-prometheus-ops.md) |
| **Grafana UID** | `synqdrive-document-intake-v2` |
| **Golden Corpus** | `backend/src/modules/document-extraction/__fixtures__/golden/` |

---

## 1. Grundsätze

| Regel | Bedeutung |
|-------|-----------|
| **Shadow / Dry Run** | `DOCUMENT_INTAKE_V2_APPLY_ENABLED=false`, Executor-Allowlist leer oder nur nach Einzel-Freigabe |
| **Kein Auto-Apply** | Entity Rank-1, Klassifikation und Action-Plan werden **vorgeschlagen**, nicht still übernommen |
| **Manuelles Go/No-Go** | Metrik-Gates sind **Voraussetzung**, nicht Auto-Trigger für Prod-Freigabe |
| **Stichprobe Pflicht** | Keine breite Freigabe ohne repräsentative **PDF-, Bild-** und **Dokumenttyp-**Stichprobe (siehe §3) |
| **Beobachtungsfenster** | Minimum **28 Tage** oder ≥ **30 Canary-Dokumente** mit vollständigem Review-Zyklus |

**Verwandte Tools (read-only):**

- `backend/scripts/ops/document-intake-reconcile.ts --dry-run`
- `DocumentIntakeReconciliationService` (Finding-Codes)
- Golden Corpus Tests: `document-intake-golden-corpus.spec.ts`

---

## 2. Shadow-Metriken — Matrix

### 2.1 Übersicht

| Shadow-Metrik | Datenquelle | Automatisiert | Gate (Richtwert) |
|---------------|-------------|---------------|------------------|
| **OCR-Erfolg** | Prometheus | Ja | ≥ 95 % permanent success (24 h) |
| **Wrong-high-confidence** | Reconciliation + manuelle Stichprobe | Teilweise | ≤ 5 % AUTO bei späterem User-Override |
| **Required-Field-Completeness** | Prometheus | Ja | ≥ 85 % required present (30 m) |
| **Entity Top-1 / Top-3 Accuracy** | Stichprobe + `entity_candidate` Metriken | Teilweise | Top-1 ≥ 70 %, Top-3 ≥ 90 % (Canary) |
| **Blocker Accuracy** | Plausibility + User-Override | Manuell | ≤ 10 % BLOCKER fälschlich |
| **Action-Plan-Korrektheit** | Preview vs. User-Confirm | Manuell | ≥ 90 % Plan-Fingerprint ohne Rebuild |
| **Apply-Duplikate** | Reconciliation | Ja | 0 `DUPLICATE_DOMAIN_OBJECT` |
| **Partial Apply** | Prometheus | Ja | ≤ 15 % vs. completed plans (30 m) |
| **Field Correction Rate** | `fieldProvenance` / save-review diff | Manuell | Dokumentiert; Spike &gt; 40 % → Modell-Review |
| **Nutzerakzeptanz der Vorschläge** | Follow-up + Entity + Classification | Teilweise | Follow-up accept / suggested ≥ 25 % (informativ) |

### 2.2 Prometheus-Queries (Canary, 30 m Fenster)

**OCR-Erfolg**

```promql
sum(rate(synqdrive_document_ocr_total[30m]))
/
clamp_min(
  sum(rate(synqdrive_document_ocr_total[30m]))
  + sum(rate(synqdrive_document_ocr_failed_total{retryable="false"}[30m])),
  0.001
)
```

**Required-Field-Completeness**

```promql
sum(rate(synqdrive_document_required_field_total{requirement="required",presence="present"}[30m]))
/
clamp_min(sum(rate(synqdrive_document_required_field_total{requirement="required"}[30m])), 0.001)
```

**Partial Apply**

```promql
sum(rate(synqdrive_document_partial_apply_total[30m]))
/
clamp_min(sum(rate(synqdrive_document_action_plan_total{outcome="completed"}[30m])), 0.001)
```

**Follow-up-Akzeptanz (informativ)**

```promql
sum(rate(synqdrive_document_follow_up_total{outcome="accepted"}[30m]))
/
clamp_min(sum(rate(synqdrive_document_follow_up_total{outcome="suggested"}[30m])), 0.001)
```

**Entity-Match-Confidence (Verteilung, kein Accuracy-Gate allein)**

```promql
sum by (entity_type, confidence) (rate(synqdrive_document_entity_candidate_total[30m]))
```

---

## 3. Repräsentative Stichprobe (Pflicht)

Vor Freigabe von Schritt 10+ im Deployment-Runbook muss die Canary-Org mindestens folgende **echte oder kontrollierte Pilot-**Dokumente durchlaufen haben:

| Kategorie | Formate | Mindestanzahl | Dokumenttypen (Beispiele) |
|-----------|---------|---------------|---------------------------|
| **PDF** | `application/pdf` | ≥ 5 | INVOICE, SERVICE, TÜV/BOKraft |
| **Bild** | JPEG/PNG | ≥ 5 | FINE, DAMAGE, ARCHIVE (Brief) |
| **AUTO-Klassifikation** | gemischt | ≥ 8 | Unbekannter Typ → `AWAITING_DOCUMENT_TYPE` min. 2× |
| **Entity-Ambiguität** | gemischt | ≥ 3 | VIN + Kennzeichen widersprüchlich oder Multi-Vehicle-Org |
| **Action-Plan** | gemischt | ≥ 5 | Mind. 1 ARCHIVE, 1 FINE oder INVOICE, 1 SERVICE |

**Golden Corpus (CI, synthetisch)** ergänzt, ersetzt **nicht** die Pilot-Stichprobe:

```bash
cd backend
npm test -- document-intake-golden-corpus.spec.ts
```

Corpus-IDs u. a.: `fine-complete`, `invoice-complete-19`, `service-complete`, `tuv-no-defect`, `damage-complete`, `authority-letter`, `tire-complete`, `battery-lv-complete`.

---

## 4. Beobachtungszeitraum

### 4.1 Planung

1. **T0** — Deploy Phase 3 (Apply aus), Canary-Org benennen
2. **T0 dokumentieren** — Org-ID, Fahrzeugliste, aktive Flags, Stichproben-Plan
3. **Wöchentlich** — Reconciliation + Grafana-Export + manuelle Stichproben-Tabelle
4. **T+28d** — Erstes formales Gate-Review
5. **T+56d** — Empfohlenes Ende des Kernfensters (Action-Plan-/Entity-Statistik)

### 4.2 Mindestvolumen

| Signal | Minimum |
|--------|---------|
| Uploads gesamt | ≥ 30 |
| READY_FOR_REVIEW | ≥ 20 |
| Mit save-review | ≥ 15 |
| Mit action-plan-preview | ≥ 10 |
| User-Overrides (Typ/Entity/Feld) | ≥ 10 dokumentiert |

Bei &lt; 30 Dokumenten: Fenster verlängern, **kein** breiter Rollout.

---

## 5. Ausführung — Reconciliation Report

### 5.1 CLI (read-only)

```bash
cd backend

npx ts-node -r tsconfig-paths/register scripts/ops/document-intake-reconcile.ts \
  --organization-id=<ORG_UUID> \
  --limit=200 \
  --output=./tmp/document-intake-reconcile.json
```

**Hinweis:** `--execute` wird ignoriert — nur Dry-Run.

### 5.2 Relevante Finding-Codes

| Code | Shadow-Metrik |
|------|----------------|
| `APPLIED_WITHOUT_DOWNSTREAM` | Apply-Integrität / Duplikate |
| `DUPLICATE_DOMAIN_OBJECT` | Apply-Duplikate |
| `CONFIRMED_LEGACY_STUCK` | Apply-Pfad / Recovery |
| `STUCK_APPLYING_LIFECYCLE` | Partial Apply / Recovery |
| `DOWNSTREAM_WITHOUT_APPLIED_EXTRACTION` | Inkonsistenz |
| `RECOVERY_DEAD_LETTER` | Worker-Stabilität |

**Gate:** 0× `ERROR` severity in Canary über 7 Tage vor Executor-Freigabe.

---

## 6. Manuelle Shadow-Felder (pro Dokument erfassen)

Template für Canary-Stichprobe (Spreadsheet / Ticket):

| Feld | Wert |
|------|------|
| `extractionId` | (intern, nicht in Metrics) |
| Dokumenttyp (System) | |
| Dokumenttyp (User final) | |
| AUTO-Klassifikation korrekt? | ja/nein |
| Confidence | |
| Wrong-high-confidence? | ja wenn AUTO ≥ Schwellwert und User ändert Typ |
| Required fields missing (System) | Anzahl |
| User korrigierte Felder | Anzahl → **Field Correction Rate** |
| Entity Top-1 korrekt? | ja/nein |
| Entity in Top-3? | ja/nein |
| BLOCKER berechtigt? | ja/nein |
| Action-Plan ohne manuelle Deaktivierung ok? | ja/nein |
| Follow-up akzeptiert? | ja/nein/dismissed |

**Aggregation:**

- Wrong-high-confidence rate = `wrong_high / auto_classified`
- Entity Top-1 accuracy = `top1_correct / with_entity_review`
- Entity Top-3 accuracy = `top3_contains_correct / with_entity_review`
- Field correction rate = `fields_changed / fields_present`
- Blocker accuracy = `justified_blockers / total_blockers`

---

## 7. Metrik-Detail — Schwellen und Interpretation

### 7.1 OCR-Erfolg

| Quelle | Detail |
|--------|--------|
| Prometheus | `document_ocr_total`, `document_ocr_failed_total`, OCR p95 |
| Alert | `DocumentIntakeOcrFailureRateHigh` (&gt; 25 % permanent) |
| Manuell | Mistral 429 → `error_code=OCR_RATE_LIMITED` |

**Fail:** p95 &gt; 120 s über 24 h ohne erklärte Lastspitze.

### 7.2 Wrong-high-confidence

Klassifikation mit `auto_continue` oder hoher Confidence (`classificationConfidence`), aber User wählt anderen Typ oder `AWAITING` → Override.

**SQL-Hinweis (read-only, Canary):**

```sql
SELECT id, requested_document_type, detected_document_type, effective_document_type,
       classification_confidence, status
FROM vehicle_document_extractions
WHERE organization_id = '<ORG_UUID>'
  AND updated_at > NOW() - INTERVAL '28 days'
  AND classification_mode = 'AUTO';
```

### 7.3 Required-Field-Completeness

Nach Extraktion, vor User-Review: Anteil `presence=present` für `requirement=required`.

**Zusatz:** `synqdrive_document_plausibility_blocker_total` bei `STRUCTURED_EXTRACTION_MISSING_REQUIRED` — sollte mit missing fields korrelieren.

### 7.4 Entity Top-1 / Top-3 Accuracy

Nur aus **manueller** Bewertung nach Entity-Review (§6). Prometheus liefert Confidence-Bänder, **keine** Ground-Truth-Accuracy.

**Ziel Canary:** Top-1 ≥ 70 %, Top-3 ≥ 90 % über ≥ 10 Entity-relevante Dokumente.

### 7.5 Blocker Accuracy

Plausibility `status=BLOCKER` — Operator markiert ob berechtigt nach manueller Prüfung.

**Fail:** &gt; 10 % BLOCKER als falsch positiv ohne Schema-/Resolver-Fix-Plan.

### 7.6 Action-Plan-Korrektheit

Vergleich:

1. `GET action-plan-preview` nach finalem save-review
2. User-disabled optional actions in `actionPlanPreferences`
3. Fingerprint bei Confirm muss matchen

**Gate:** ≥ 90 % Preview-Pläne ohne `confirmBlockedReason` bei finalen confirmedData.

### 7.7 Apply-Duplikate

Reconciliation `DUPLICATE_DOMAIN_OBJECT` + manuell: zweites Apply erzeugt keine zweite Fine/Invoice/Service-Event-Zeile.

**Prometheus:** `synqdrive_document_duplicate_total{outcome="blocked"}` bei Upload — getrennt von Apply-Dedup.

### 7.8 Partial Apply

`synqdrive_document_partial_apply_total` by `reason`:

- `optional_failed` — erwartet in Canary, dokumentieren
- `partial_lifecycle` — nur mit RCA

**Alert:** `DocumentIntakePartialApplyRateHigh` (&gt; 20 %).

### 7.9 Field Correction Rate

Aus `fieldProvenance` / Diff `extractedData` → `confirmedData` nach save-review.

**Informativ:** &gt; 40 % Korrektur bei einem Dokumenttyp → Extraktions-Prompt/Schema-Review.

### 7.10 Nutzerakzeptanz der Vorschläge

| Vorschlagstyp | Metrik / Messung |
|---------------|------------------|
| Follow-up | `follow_up_total{outcome="accepted|dismissed|suggested"}` |
| Entity | Manuell: accepted link vs. dismissed alternative |
| Classification | User behält Vorschlag vs. ändert Typ |
| Action optional | `disabledOptionalActions` in confirmedData |

**Kein hartes Auto-Gate** — Produktentscheidung; dokumentieren für UX-Iteration.

---

## 8. Wöchentlicher Ablauf (Checkliste)

1. [ ] Grafana `synqdrive-document-intake-v2` — Alerts nicht dauerhaft firing
2. [ ] `document-intake-reconcile.ts` für Canary-Org
3. [ ] OCR-Erfolg + Required-Field-Completeness Panels exportieren
4. [ ] Manuelle Stichprobe: ≥ 2 neue Dokumente in Spreadsheet (§6)
5. [ ] Wrong-high-confidence + Entity-Accuracy aktualisieren
6. [ ] Golden Corpus CI grün auf `main`
7. [ ] Bei `APPLIED_WITHOUT_DOWNSTREAM` → Apply-Freeze (Deployment §16)

---

## 9. Gate-Review (nach 28 Tagen)

### 9.1 Automatische Gates (alle grün)

| Gate | Schwelle |
|------|----------|
| OCR-Erfolg | ≥ 95 % |
| Required-Field-Completeness | ≥ 85 % |
| Partial Apply | ≤ 15 % |
| Apply-Duplikate (Reconciliation) | 0 ERROR |
| Queue age | &lt; 600 s sustained |

### 9.2 Manuelle Gates

| Gate | Schwelle |
|------|----------|
| Wrong-high-confidence | ≤ 5 % |
| Entity Top-1 | ≥ 70 % |
| Entity Top-3 | ≥ 90 % |
| Blocker Accuracy | ≥ 90 % berechtigt |
| Action-Plan-Korrektheit | ≥ 90 % |
| Stichprobe PDF/Bild/Typen | §3 vollständig |

### 9.3 Entscheidung

| Ergebnis | Aktion |
|----------|--------|
| **Alle Gates grün** | Deployment Runbook Schritt 10 freigeben (einzelner Executor) |
| **Lücken** | Fenster verlängern, Root-Cause, **kein** breiter Rollout |
| **Kritisch (Apply ohne Downstream)** | Apply sofort aus, Incident |

**Explizit verboten:** Shadow-Metriken grün → automatisch alle Executors / alle Orgs.

---

## 10. Troubleshooting

| Symptom | Prüfen |
|---------|--------|
| OCR-Erfolg niedrig | Mistral-Quota, `OCR_RATE_LIMITED`, PDF vs. Bild |
| Required fields fehlen massenhaft | Schema-Registry, Dokumenttyp, Chunk-Limits |
| Hohe Partial Apply | Optional actions, Executor-Logs, `action_plan_execution` |
| Entity Top-1 schlecht | Resolver-Hints, Upload-Context, VIN/Plate-OCR-Qualität |
| Wrong-high-confidence | `classificationAutoContinueMinConfidence` Kalibrierung |
| Follow-up dismiss hoch | Subtype-Rules, irrelevanter Vorschlag |

---

## 11. Implementierung (Code-Referenz)

| Komponente | Pfad |
|------------|------|
| Reconciliation | `diagnostic/document-intake-reconciliation.service.ts` |
| Reconcile CLI | `scripts/ops/document-intake-reconcile.ts` |
| V2 Metriken | `observability/document-intake-v2-prometheus.metrics.ts` |
| Golden Corpus | `__fixtures__/golden/document-intake-golden-corpus.ts` |
| Action Plan Preview | `document-action-plan-preview.service.ts` |
| Entity Ranking | `entity-candidate-ranking.policy.ts` |
| Grafana Dashboard | `monitoring/grafana/dashboards/synqdrive-document-intake-v2.json` |

---

## 12. Abgrenzung

| Tool | Zweck |
|------|-------|
| **Shadow Validation** (dieses Runbook) | Rollout-Gates vor Apply-Freigabe |
| **Deployment Runbook** | Phasen 1–14, Flags, Rollback |
| **Grafana / Prometheus** | Echtzeit-Metriken |
| **Golden Corpus Tests** | Regression synthetisch |
| **E2E / Unit Tests** | Verhalten, kein Prod-Shadow |

---

*Kein breiter Rollout ohne repräsentative PDF-, Bild- und Dokumenttypstichprobe und dokumentiertes Gate-Review.*
