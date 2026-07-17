# Document Intake V2 Grafana / Prometheus Ops (V4.9.657)

Operational dashboards and alerts for Document Intake V2, built on the existing SynqDrive monitoring stack (`backend/monitoring/`).

## Files

| File | Purpose |
|------|---------|
| `monitoring/grafana/dashboards/synqdrive-document-intake-v2.json` | Document Intake V2 ops dashboard |
| `monitoring/prometheus/alerts.yml` | Alert group `synqdrive_document_intake_v2` |
| `src/modules/document-extraction/observability/document-intake-v2-prometheus.metrics.ts` | V2 record helpers |
| `scripts/ops/vps-setup-grafana.sh` | Copies dashboard to VPS |

## Metrics (low-cardinality labels only)

| Metric | Labels | Source |
|--------|--------|--------|
| `synqdrive_document_upload_total` | `scope`, `source_surface` | `createFromOrgUpload` success |
| `synqdrive_document_upload_rejected_total` | `reason` | Rate limit, mime, identification, malware, validation, duplicate, queue |
| `synqdrive_document_duplicate_total` | `outcome` | Duplicate policy assessment |
| `synqdrive_document_ocr_total` | `method` | Processor OCR stage (`cached`, `OCR`, `PDF_TEXT`, …) |
| `synqdrive_document_ocr_failed_total` | `error_code`, `retryable` | OCR failures via observability |
| `synqdrive_document_classification_total` | `result` | Classification decision |
| `synqdrive_document_awaiting_type_total` | `source` | `classification` / `no_type` |
| `synqdrive_document_extraction_total` | `document_category`, `overall_status` | Structured extraction complete |
| `synqdrive_document_plausibility_blocker_total` | `blocker_code` | BLOCKER plausibility checks |
| `synqdrive_document_entity_candidate_total` | `entity_type`, `confidence` | Entity ranking (`HIGH`/`MEDIUM`/`LOW`) |
| `synqdrive_document_required_field_total` | `requirement`, `presence`, `document_category` | Required/optional field completeness |
| `synqdrive_document_action_plan_total` | `document_category`, `outcome` | Preview / ready / executing / completed / failed |
| `synqdrive_document_action_total` | `semantic_action`, `outcome` | Per-action execution |
| `synqdrive_document_action_failed_total` | `semantic_action`, `error_code` | Failed actions |
| `synqdrive_document_partial_apply_total` | `reason` | Partial apply lifecycle |
| `synqdrive_document_recovery_total` | `kind`, `outcome` | Pipeline + action recovery schedulers |
| `synqdrive_document_follow_up_total` | `follow_up_type`, `outcome` | Suggested / accepted / dismissed / task_created |
| `synqdrive_document_archive_total` | `outcome` | Archive index + archive executor |

**No document IDs, file names, license plates, or org IDs** are used as Prometheus labels.

Legacy `synqdrive_document_extraction_*` metrics remain for backward compatibility. OCR latency uses `synqdrive_document_extraction_duration_seconds{stage="OCR"}` (wired via `observeStage`).

## Dashboard sections

1. **Upload Funnel** — accepted vs rejected vs ready-for-review
2. **OCR-Latenz und Fehler** — OCR p50/p95 + throughput/failures
3. **Klassifikationsverteilung** — classification results + awaiting type
4. **Required-Field-Completeness** — required field presence ratio by category
5. **Entity-Match-Confidence** — entity candidate confidence bands
6. **Action-Erfolg** — action plan + execution outcomes, failures by semantic action
7. **Partial Apply** — partial apply reasons and ratio
8. **Duplicate Rate** — blocked duplicate ratio + outcomes
9. **Worker/Queue Stability** — queue age, active jobs, recovery, retries
10. **Follow-up-Akzeptanz** — acceptance rate + lifecycle

Grafana UID: `synqdrive-document-intake-v2`

## Deploy

After merging to `main`:

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-grafana.sh
```

Prometheus alert rules reload with the standard VPS Prometheus setup.
