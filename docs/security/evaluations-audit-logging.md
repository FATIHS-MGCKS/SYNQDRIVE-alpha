# Auswertungen — Audit Logging

**Prompt 48/54** — nachvollziehbares, tenant-sicheres Audit Logging für sensible Analytics-Aktionen.

## Architektur

Evaluations-Audit nutzt die bestehende **Business Audit Outbox** (`BusinessAuditService` → `BusinessAuditOutbox` → `ActivityLog`). Keine separaten, durch Nutzer editierbaren Tabellen.

```
API / Service mutation or sensitive read
        ↓
EvaluationsAuditService.record(...)
        ↓
BusinessAuditOutbox (tenant-scoped, append-only)
        ↓
ActivityLog (org activity_log, read via users-roles / master admin)
```

## Event-Felder (Minimum)

Jedes Event enthält über Outbox + `ActivityLog.metaJson.businessAudit` / `evaluationsAudit`:

| Feld | Quelle |
|------|--------|
| `organizationId` | Outbox row |
| `actorId` | `actorUserId` |
| `action` | Evaluations audit action code |
| `targetType` | Entity type (EXPORT, MISUSE_CASE, …) |
| `targetId` | Entity ID (export UUID, case ID, policy key) |
| `timestamp` | `occurredAt` |
| `outcome` | `SUCCESS` \| `DENIED` \| `FAILED` |
| `reason` / change summary | `changeReason`, `beforeSummary` / `afterSummary` |
| `correlationId` | `X-Request-Id` / `req.requestId` |

**Nicht geloggt:** Secrets, vollständige Export-Payloads, Kundennamen/E-Mails, Roh-Evidence, Modell-Rohdaten.

## Eventtypen

| Action | Auslöser |
|--------|----------|
| `EVALUATIONS_SENSITIVE_DETAIL_ACCESSED` | Missbrauchsanalyse Liste (nicht Cockpit) / Detail |
| `EVALUATIONS_FINANCE_EXPORT` | `GET .../evaluations/export/summary` |
| `EVALUATIONS_PII_DATA_ACCESSED` | `GET .../customers/evaluation-labels` |
| `EVALUATIONS_RECOMMENDATION_CHANGED` | Missbrauch Lifecycle POST |
| `EVALUATIONS_STATUS_CHANGED` | Missbrauch Statusänderung |
| `EVALUATIONS_ASSIGNEE_CHANGED` | Reserviert für Zuweisungen (Hook bereit) |
| `EVALUATIONS_KPI_DEFINITION_CHANGED` | Insight-Policy PATCH (Master Admin) |
| `EVALUATIONS_THRESHOLD_CHANGED` | Policy-Schwellenwerte in `policyOverrides` |
| `EVALUATIONS_FORECAST_MODEL_CHANGED` | Registry-Statuswechsel (generisch) |
| `EVALUATIONS_MODEL_ACTIVATED` | Modell `APPROVED` |
| `EVALUATIONS_MODEL_DEACTIVATED` | `DISABLED` / `ROLLED_BACK` |
| `EVALUATIONS_MANUAL_RECALCULATION` | Forecast / Risk / Feature POST `run` |
| `EVALUATIONS_DATA_QUALITY_ACTION` | Backtest, Drift-Check, Admin-Diagnostik |
| `EVALUATIONS_ACCESS_DENIED` | Reserviert für explizite Denial-Audits |

Konstanten: `backend/src/modules/business-insights/access/evaluations-audit.constants.ts`

## Storage

| Layer | Tabelle / Service | Tenant-Isolation |
|-------|-------------------|------------------|
| Durable intent | `business_audit_outbox` | `organizationId` Pflichtfeld |
| Canonical trail | `activity_logs` | `organizationId` + org-scoped read API |
| Processor | `BusinessAuditOutboxProcessorService` | Secret-Scan vor Persist |

Audit-Logs sind **append-only** — keine Update/Delete-API für Tenant-Nutzer.

## Rollen & Sichtbarkeit

| Rolle | Lesen |
|-------|-------|
| Org Admin / `users-roles.read` | `GET organizations/:orgId/activity-log` (gesamtes Org-Audit inkl. Evaluations) |
| MASTER_ADMIN | `GET admin/activity-log` |
| Normale Nutzer | Kein Schreiben/Löschen; keine Audit-Manipulation |

Schreiben erfolgt nur systemseitig über `EvaluationsAuditService`.

## Retention-Empfehlung

| Artefakt | Empfehlung |
|----------|------------|
| `activity_logs` (Evaluations events) | **730 Tage** (`EVALUATIONS_AUDIT_RETENTION_DAYS`) — Compliance / Forensik |
| `business_audit_outbox` | Kurzlebig; nach `PROCESSED` archivierbar/löschbar nach 30–90 Tagen |
| Predictive artefacts | Siehe `EVALUATIONS_FORECAST_RETENTION_DAYS` (365d) — getrennt von Audit |

Operative Umsetzung: DB-Retention-Job / Partitionierung (noch nicht automatisiert im Repo).

## Implementierung

- `EvaluationsAuditService` — Facade, Sanitization, Convenience-Methoden
- `evaluations-audit-request.util.ts` — Correlation ID aus Request
- Wiring: Export, Customers labels, Misuse lifecycle, Predictive POST, Policy PATCH, Admin diagnostics

## Tests

- `evaluations-audit.service.spec.ts` — Payload-Sanitization, Outbox enqueue, Outcomes
- `evaluations-audit-request.util.spec.ts` — Correlation ID
- Bestehende Business-Audit Secret-Scans greifen auf Metadata

## Verwandte Dokumentation

- `docs/security/evaluations-role-permission-matrix.md` (Prompt 47)
- `docs/compliance/evaluations-gdpr-privacy-by-design.md` (Prompt 46)
- `docs/audits/iam-transactional-audit-outbox-2026-07.md`
