# AI Request Audit Logging — 2026-07-25 (Prompt 25/32)

Revision-grade audit trail for SynqDrive Fleet AI Assistant requests and domain tool invocations.

## Zweck

- **Compliance & revision:** Nachvollziehbare Metadaten pro AI-Anfrage ohne Speicherung vollständiger Prompts/Responses.
- **Incident-Analyse:** `correlationId`, Tool-Laufzeiten, Fehlercodes und Performance-Metriken.
- **DSGVO:** Pseudonymisierte `userIdRef` standardmäßig; Roh-`userId` nur mit Produktkonfiguration `AI_AUDIT_STORE_PLAIN_USER_ID=true`.

## Datenfelder (mindestens)

| Feld | Beschreibung |
|------|----------------|
| `organizationId` | Mandant |
| `userId` / `userIdRef` | Roh oder pseudonymisiert (`pseudo:<hmac>`) |
| `membershipRole` | Rolle im Mandanten |
| `correlationId` / `requestId` | Request-Korrelation |
| `timestamp` | `created_at` |
| `channel` | z. B. `fleet_chat` |
| `primaryIntent` / `detectedIntents` | Intent-Routing |
| `resolvedVehicleId` / `resolvedVehicleRef` | Fahrzeugreferenz (Kennzeichen teilmaskiert) |
| `toolsUsed` / `toolDurations` | Tools + Laufzeiten |
| `dataSources` | Evidence-Quellen |
| `errorCodes` | Domain-Fehlercodes |
| `responseType` | Strukturierter Antworttyp |
| `modelProvider` / `modelName` / `tokenUsage` | LLM-Metadaten |
| `performance` | routing/tools/composition/llm/total ms |
| `dataClassification` | max(`public`…`restricted`) |
| `partial` / `resultComplete` | Teil- vs. Vollständigkeit |
| `securityFlags` | z. B. Prompt-Injection-Flags |

**Nicht** gespeichert: Secrets, vollständige Provider-Payloads, vollständige Kundendaten, Standortkoordinaten in normalen Logs, vollständige Prompt-/Response-Texte.

## Rechtsgrundlage / Produktkonfiguration

| Env | Default | Bedeutung |
|-----|---------|-----------|
| `AI_AUDIT_LOGGING_ENABLED` | `true` | Master switch |
| `AI_AUDIT_STORE_PLAIN_USER_ID` | `false` | Klartext-`userId` in DB |
| `AI_AUDIT_USER_REF_PEPPER` | optional | HMAC-Pepper (Fallback: `JWT_SECRET`) |
| `AI_AUDIT_RETENTION_DAYS` | `730` | Löschfrist |
| `AI_AUDIT_DEBUG_LOGGING` | `false` | Verbose Debug (getrennt von Prod-Logs) |

## Retention & Löschung

- `AiAuditRetentionService.purgeExpired()` löscht Zeilen älter als `AI_AUDIT_RETENTION_DAYS`.
- Org-Offboarding: Cascade via `organization` FK.

## Zugriffskontrolle

- Detailtabelle `ai_request_audit_logs`: Backend/ops only — nicht Tenant-UI.
- Parallel: `ActivityLog` via `AuditService` (`ActivityEntity.AI_ASSISTANT`, `ActivityAction.EXECUTE`) mit Meta-JSON ohne Secrets.

## DSGVO-Auskunft

Export über Korrelation (`correlationId`) + Mandant; keine Koordinaten oder Volltext-Prompts.

## Incident-Analyse

Strukturierte JSON-Application-Logs (`auditDomain: ai_assistant`) + DB-Index auf `(organization_id, correlation_id)`.

## Architekturpfad

```
ChatService → FleetChatOrchestratorService → AiRequestAuditService → ai_request_audit_logs
AiDomainToolRegistry.emitAudit → AiRequestAuditService (eventKind=TOOL)
```
