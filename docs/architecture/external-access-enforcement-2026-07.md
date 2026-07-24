# External Access Enforcement (Prompt 22)

Authorization Decision Engine bound to all external and extended data usages — EXPORT, SHARE, USE_FOR_AI, and MCP READ.

## Protected paths

| Channel key | Action | Integration point |
|-------------|--------|-------------------|
| `fleet_chat` | USE_FOR_AI | `ChatService.assertAiAllowed` + fleet context minimization |
| `document_ai_extraction` | USE_FOR_AI | `DocumentAiExtractionService.extract` + vehicle context minimization |
| `vehicle_spec_ai` | USE_FOR_AI | `VehicleSpecAiService.getVehicleSpecs*` (when org resolved) |
| `generated_document_download` | EXPORT | `DocumentsController` download endpoints |
| `legal_document_download` | EXPORT | `LegalDocumentsController.download` |
| `vehicle_file_summary` | EXPORT | `VehicleIntelligenceController.getVehicleFileSummary` |
| `reporting_export` | EXPORT | Registry ready — wire at reporting export call sites |
| `bulk_export` | EXPORT | Requires `organization.settings.bulkExportEnabled === true` |
| `webhook_egress` | SHARE | `checkWebhookEgress` — recipient + transfer country |
| Voice MCP tools | READ | `VoiceMcpProtocolService.handleToolCall` — per-tool registry |
| Partner API | SHARE | `checkShare` — `EXTERNAL_PARTNER` processor + `PARTNER_ACCESS` source |
| Support break-glass | READ | `checkSupportAccess` — `synqdrive-master-admin-support` identity only |

## Core rules

- **Export ≠ Read** — normal READ permission does not imply EXPORT; explicit `EXPORT` action required.
- **AI requires purpose + categories** — channel registry maps each AI path to fixed `purpose` and `dataCategories`.
- **MCP server-side policy** — tool name → categories; agent cannot choose scope.
- **Tool tokens** — tenant-bound, short-lived, purpose-bound via existing `VoiceMcpTokenService`; revocation via Redis conversation marker.
- **Partner SHARE** — `DataSharingAuthorization` evaluated through Policy Resolver (`PARTNER_ACCESS` source).
- **Bulk export** — `DATA_AUTH_BULK_EXPORT_ORG_ALLOWLIST` env gate before category checks.

## Data minimization

| Path | Mechanism |
|------|-----------|
| Fleet chat AI | `minimizeRecordFields` on fleet vehicles (`allowedFields` in registry) |
| Document AI | `sanitizeAiPromptContext` on `vehicleContext` (`deniedFields`: iban, taxId, …) |
| Voice MCP tools | `minimizeMcpToolOutput` on tool result (`allowedFields` / `deniedFields` per tool) |

Partial fields only — never full records when registry specifies allowed/denied fields.

## External recipients

| Recipient type | Check |
|----------------|-------|
| Partner API | `checkShare` + `EXTERNAL_PARTNER` processor |
| Webhook URL | `checkWebhookEgress` + recipient id + optional `transferCountry` |
| Mistral / ElevenLabs | Implicit subprocessor via `SYNQDRIVE` processor on AI channels |
| Voice MCP (ElevenLabs agent) | MCP tool gate + output minimization |

## Token and session invalidation

| Mechanism | Behavior |
|-----------|----------|
| `VoiceMcpNonceStore.revokeConversation` | Redis key `voice:mcp:revoked:conv:{id}` |
| `VoiceMcpTokenService.verify` | Rejects tokens for revoked conversations |
| `ExternalAccessEnforcementService.handleRevocation` | Calls `MCP_TOKEN_REVOCATION` port (wired in `AppModule` → `VoiceMcpNonceStore`) |

## Environment

| Variable | Default | Effect |
|----------|---------|--------|
| `DATA_AUTH_EXTERNAL_ACCESS_SHADOW_MODE` | `true` | DENY logged; egress may continue |
| `DATA_AUTH_EXTERNAL_ACCESS_FAIL_CLOSED` | `false` | Blocks egress when enabled |

## Tests

```bash
cd backend && npm test -- --testPathPattern="external-access|data-authorizations"
```

Covers: EXPORT ALLOW/DENY, USE_FOR_AI, MCP tool mapping, SHARE, webhook, bulk export, support break-glass, multi-tenant, revocation, minimization.

## Remaining gaps

- `reporting_export` channel registered but not yet wired to a specific reporting controller
- Policy lifecycle → `handleRevocation` on REVOKED events (same pattern as notification enforcement)
- DTC AI research (`DtcAiResearchService`) — separate AI path for future gate
