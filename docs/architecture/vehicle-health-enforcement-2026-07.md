# Vehicle Health, DTC & Technical Observation Enforcement (Prompt 19)

Authorization Decision Engine bound to vehicle health signals, DTC codes, derived health scores, alerts, AI analysis, exports, and technical observations.

## Data categories

| Category | Scope | Examples |
|----------|-------|----------|
| `HEALTH_SIGNALS` | Battery, tire, brake, service compliance, health summaries, derived scores | Tire recalc, brake recalc, battery V2 jobs, health tab API |
| `DTC_CODES` | Raw fault codes + DTC-specific reads/AI | DIMO DTC poll, webhook ingest, DTC summary/detail API |

No blanket org-wide allow — each path requires an explicit category + purpose + action decision.

## Actions

| Action | Use case | Service method |
|--------|----------|----------------|
| `INGEST` | Raw DTC persist, manual/telemetry technical observations | `mayIngest()` |
| `DERIVE` | Health recalc, alert materialization, service task derivation | `mayDerive()` |
| `READ` | Health/DTC API reads, KPI surfaces | `isReadAllowed()` |
| `USE_FOR_AI` | AI Health Care, DTC knowledge enrichment | `mayUseForAi()` |
| `EXPORT` | Vehicle file summary / health document export | `mayExport()` / `assertExport()` |

Raw data (`INGEST`) and derived information (`DERIVE`) are decided separately. Revocation blocks new derivations; existing findings remain per retention policy.

## Environment

| Variable | Default | Effect |
|----------|---------|--------|
| `DATA_AUTH_HEALTH_SHADOW_MODE` | `true` | DENY logged; persist/read may continue |
| `DATA_AUTH_HEALTH_FAIL_CLOSED` | `false` | Blocks ingest/derive/read/AI/export when enabled |

## Protected pipelines (initial coverage)

| Process | Action | Category | Gate location |
|---------|--------|----------|---------------|
| DTC upsert (defense-in-depth) | INGEST | DTC_CODES | `DtcService.upsertDtc` |
| DTC poll/webhook | INGEST | DTC_CODES | `TelemetryIngestionEnforcement` (Prompt 17) + `DtcService` |
| Tire health recalc | DERIVE | HEALTH_SIGNALS | `TireRecalculationProcessor` |
| Brake health recalc | DERIVE | HEALTH_SIGNALS | `BrakeRecalculationProcessor` |
| Battery V2 jobs | DERIVE | HEALTH_SIGNALS | `BatteryV2Processor` |
| Tire/brake health alerts | DERIVE | HEALTH_SIGNALS | `TireHealthAlertService`, `BrakeHealthAlertService` |
| Service task materialization | DERIVE | HEALTH_SIGNALS | `ComplianceTaskMaterializeService` |
| DTC summary/detail API | READ | DTC_CODES | `VehicleIntelligenceController` |
| Tire/brake/battery/health summary API | READ | HEALTH_SIGNALS | `VehicleIntelligenceController` |
| Service info status API | READ | HEALTH_SIGNALS | `VehicleIntelligenceController` |
| AI Health Care | USE_FOR_AI | HEALTH_SIGNALS | `AiHealthCareAggregationService` |
| DTC knowledge enrichment | USE_FOR_AI | DTC_CODES | `DtcKnowledgeService` |
| Vehicle file summary | EXPORT | HEALTH_SIGNALS | `VehicleIntelligenceController` |
| Manual technical observation | INGEST | HEALTH_SIGNALS | `TechnicalObservationsService.create` (MANUAL_UPLOAD) |
| Telemetry/system observation | INGEST | HEALTH_SIGNALS | `TechnicalObservationsService.create` (DIMO) |

## AI and export gates

- **AI:** `USE_FOR_AI` action required. Denied → `NO_RECENT_DATA` / `HEALTH_AI_DENIED` response; DTC knowledge returns non-enqueuing placeholder.
- **Export:** `EXPORT` action required. Denied → `accessDenied: true` on file-summary; health documents excluded.
- **Alerts:** DERIVE with `ALERTS` purpose; deny suppresses new notification emission (`suppressedByPolicy: true`).
- **KPIs:** READ deny returns empty/redacted payloads — locked data never included in health scores shown to users.

## Observation source mapping

| Source | `observationSource` | Policy `sourceSystem` |
|--------|---------------------|------------------------|
| Manual entry (staff, customer, AI upload, etc.) | `MANUAL` | `MANUAL_UPLOAD` |
| Telemetry / field agent / system import | `TELEMETRY` | `DIMO` |

## Data lifecycle

- **Revocation:** blocks new INGEST/DERIVE; DTC backfills pass `effectiveTimestamp` — no bypass.
- **Existing findings:** retained per audit retention class; READ deny redacts API output.
- **Tenant isolation:** vehicle must belong to `organizationId` before decision.

## Tests

```bash
cd backend && npm test -- --testPathPattern="vehicle-health-enforcement|trip-location-enforcement|telemetry-ingestion-enforcement|data-authorizations"
```

Covers: DTC ALLOW/DENY, health derivation, service derivation, alert suppression metric, AI context (`USE_FOR_AI`), export (`EXPORT`), foreign vehicle, revoked policy with `effectiveTimestamp`, manual vs telemetry observation source mapping, resolver error without legacy fallback, empty DTC summary on deny.

## Remaining gaps

- HM health MQTT ingest path (covered by telemetry ingestion where wired)
- Dedicated health bulk export HTTP endpoint beyond file-summary
- Profiling-purpose (`ABUSE_MISUSE_DETECTION`) separate derive paths for misuse scoring
- Prometheus counters for health enforcement metrics
