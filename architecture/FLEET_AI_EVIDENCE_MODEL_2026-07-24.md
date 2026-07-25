# Fleet AI — Evidence Model (2026-07-24)

> Prompt 5/32 — shared type-safe contract for all grounded facts passed to the
> Fleet AI Assistant. Baseline: `docs/audits/ai-agent-domain-grounding-baseline-2026-07.md`.

## Changes

- Added `backend/src/modules/ai/evidence/` — canonical **AI Evidence** model for
  domain-grounded Fleet Chat (Prompt 5 foundation; no tools wired yet).
- Exported public API via `backend/src/modules/ai/index.ts`.
- Unit tests: `ai-evidence.validation.spec.ts` (17 tests).

## Architektur

### Purpose

Every fact that may reach the LLM (via tools, audit, or future chat enrichment)
must be wrapped as `AiEvidence` with explicit:

- **Provenance** (`source`, `sourceEntity`)
- **Temporal semantics** (`observedAt` vs `calculatedAt` vs static)
- **Quality** (`freshness`, `confidence`, `availability`, `reasonCode`)
- **Tenant scope** (`tenantId` required)
- **Sensitivity** (`public` | `internal` | `pii` | `restricted`)

### Fact kinds

| `factKind` | `observedAt` | `calculatedAt` | `freshness` |
|------------|--------------|----------------|-------------|
| `observed` | required when available | must be `null` | telemetry-aligned |
| `calculated` | optional input | required | per derivation |
| `static` | `null` | `null` | `not_applicable` |

### Module layout

| File | Role |
|------|------|
| `ai-evidence.enums.ts` | Closed enums (Source, Freshness, Availability, …) |
| `ai-evidence.types.ts` | `AiEvidence`, `AiEvidenceValue` (JSON-safe, no `any`) |
| `ai-evidence.validation.ts` | Semantic validation + LLM PII guard |
| `ai-evidence.dto.ts` | class-validator + `@ApiProperty` DTOs |
| `ai-evidence.serialization.ts` | `serializeAiEvidenceForLlm` redaction |
| `ai-evidence.factory.ts` | Constructors for observed/calculated/static/unavailable |
| `index.ts` | Barrel export |

### Boundaries

- **Domain services** (Vehicles, RentalHealth, Bookings, …) remain source of truth.
- Future AI tools map service DTOs → `AiEvidence`; they must not embed business logic.
- `validateAiEvidence({ forLlm: true })` blocks raw PII in `pii`/`restricted` records.
- **Intent router:** `FleetChatIntentRouterService` — closed intent taxonomy,
  combined questions, hardened vehicle resolver only; no LLM tool execution from user text.
- **Orchestrator:** `FleetChatOrchestratorService` — intent → registry tools (parallel
  independent tools); partial results; token-light evidence; structured composer; audit metadata.

### Next prompts

- Tool layer adapters (telemetry, booking, health) produce `AiEvidence[]`.
- Chat audit record stores evidence snapshots per assistant turn.

### Prompt 6 — Telemetry freshness mapping (2026-07-24)

- Added `ai-evidence-telemetry.*` — maps canonical `resolveTelemetryFreshness` →
  `AiEvidenceTelemetrySemantics` + generic `AiEvidence` freshness/availability.
- **No duplicate thresholds** — re-exports `TELEMETRY_*_THRESHOLD_MS` from
  `telemetry-freshness.resolver`.
- Central function: `mapTelemetryToAiEvidenceSemantics`.
- Tests: `ai-evidence-telemetry.mapper.spec.ts` (28 tests, boundary + transitions).

### Prompt 7 — Domain error & fallback contract (2026-07-24)

- Added `ai-domain-error.*` — standardized error codes, safe public messages,
  internal diagnostics, retry policy, severity, HTTP mapping, audit events.
- `resolveSecureVehicleAccessError` — permission_denied masks existence vs
  vehicle_not_found when authorized.
- `AiDomainQueryOutcome<T>` — partial tool results with `allowLlmInference`.
- Bridge: `mapEvidenceReasonCodeToDomainErrorCode`.
- Tests: `ai-domain-error.spec.ts` (54 tests, one per error code + security).

### Prompt 8 — AI execution context & access guards (2026-07-24)

- Added `backend/src/modules/ai/execution/` — mandatory `AiExecutionContext`
  for all future AI tool calls (no domain tools wired yet).
- Context fields: `organizationId`, `userId`, `role`, `permissions`,
  `allowedVehicleScope`, `locale`, `timezone`, `correlationId`, `requestId`,
  `channel`, `dataAccessPurpose`, optional `sessionId`.
- **Trust boundary:** `organizationId` / `userId` only from verified backend auth
  (`buildAiExecutionContext` after OrgScopingGuard + membership load) — never
  from LLM, request body, or prompt.
- Reuses `computeEffectiveAccess` + `evaluateModulePermission` — no parallel RBAC.
- Guards: vehicle (org-bound + station scope), location (fleet.read + data auth
  probe), health, booking, customer PII, fleet summary, tool entry gate.
- Correlation preserved via `aiExecutionContextLogFields` for controller →
  orchestrator → tool → audit.
- Tests: `ai-execution-context.spec.ts` (18 tests: allow/deny matrix).

### Prompt 9 — AI vehicle resolution (2026-07-24)

- Added `backend/src/modules/ai/vehicle-resolution/` — org-bound structured resolver
  for Fleet Chat and future AI tools.
- Reuses `normalizeVehiclePlate` / `normalizeVehicleVin` from document-extraction
  candidate matching (no duplicate normalization).
- Match types: internal id, license plate (exact/in-message), VIN, DIMO token id,
  vehicle name, make/model, optional booking assignment.
- Ambiguity: no arbitrary pick when multiple candidates ≥ min confidence; returns
  LLM-safe candidate list without VIN/internal ids.
- `ChatService` integrated via `AiVehicleResolutionService` — enriched messages no
  longer dump full VIN/tokenId fleet lists to Mistral.
- Tests: `ai-vehicle-resolution.spec.ts` + `chat.service.spec.ts` integration.

### Prompt 10 — `get_vehicle_location` domain tool (2026-07-24)

- Added `backend/src/modules/ai/tools/get-vehicle-location/` — first grounded Fleet AI
  domain tool returning structured facts via `AiDomainQueryOutcome`.
- Source of truth: `VehicleLatestState` + `resolveTelemetryFreshness` /
  `mapTelemetryToAiEvidenceSemantics`; live DIMO fetch only when
  `isLiveTracking && freshness === live` (mirrors `getVehicleWithTelemetry` policy).
- Guards: `assertAiToolExecutionAllowed`, `resolveAiVehicleAccess`,
  `assertAiLocationAccess` + `DataAuthorizationEnforcementService` probe.
- Never presents stale snapshot as live (`isLastKnownLocation`); address always
  `null` (no backend reverse-geocode SoT per baseline).
- Partial outcomes on provider timeout with snapshot fallback.
- Tests: `ai-get-vehicle-location.spec.ts` (11 scenarios).

### Prompt 11 — `get_vehicle_telemetry_status` domain tool (2026-07-24)

- Added `backend/src/modules/ai/tools/get-vehicle-telemetry-status/` — structured
  telemetry status with signal-group coverage and machine-readable explanations.
- Reuses `assembleVehicleConnectivityRuntimeBundle`, `buildFleetDataCoverage`,
  `resolveTelemetryFreshness`, `mapTelemetryToAiEvidenceSemantics` — no duplicate
  freshness thresholds (`deriveTelemetryState` exported from connectivity builder).
- Guards: `assertAiToolExecutionAllowed`, `resolveAiVehicleAccess` (no GPS auth —
  status tool, not coordinate disclosure).
- Output: all required fields (`telemetryState`, signal groups, connectivity,
  `explanation`, `isLastKnownTelemetry`) via `AiDomainQueryOutcome`.
- Partial outcome when provider unlinked but stored snapshot timestamps exist.
- Tests: `ai-get-vehicle-telemetry-status.spec.ts` (16 scenarios incl. boundaries).

### Prompt 12 — `get_vehicle_health_summary` domain tool (2026-07-24)

- Added `backend/src/modules/ai/tools/get-vehicle-health-summary/` — aggregates
  existing domain results via `RentalHealthService.getVehicleHealth()` without a
  parallel health engine.
- Enrichment: `ServiceComplianceService` (service/TÜV/BOKraft), `DamagesService`,
  `TasksService`, connectivity runtime bundle + fleet data coverage.
- Guards: `assertAiHealthAccess` + `resolveAiVehicleAccess`.
- Per-domain `AiHealthDomainSlice` with structured facts; no DTCs ⇒ healthy;
  unknown data explicitly marked.
- Tests: `ai-get-vehicle-health-summary.spec.ts` + mapper spec; **229/229** AI module
  before Prompt 13.

### Prompt 13 — `explain_overdue_return` domain tool (2026-07-24)

- Added `backend/src/modules/ai/tools/explain-overdue-return/` — deterministic
  explanation for overdue-return display state.
- Canonical util: `backend/src/modules/bookings/overdue-return/` —
  `buildOverdueReturnExplanation()` mirrors `buildTodayReturnSignals`,
  `fleet-booking-context.util`, and pricing-quote `returnAt` for calendar
  extension (PATCH `endDate`) without a parallel overdue engine.
- Grace: `BOOKING_RETURN_OVERDUE_GRACE_PERIOD_MINUTES = 0` (immediate at `endDate`).
- Reason codes: `RETURN_DEADLINE_PASSED`, `GRACE_PERIOD_EXCEEDED`,
  `RETURN_NOT_COMPLETED`, `NO_APPROVED_EXTENSION`, `HANDOVER_STILL_ACTIVE`,
  `STATUS_WITHOUT_ACTIVE_BOOKING`, `RETURN_COMPLETED_BUT_RUNTIME_STALE`,
  `BOOKING_CANCELLED_BUT_MARKED_OVERDUE`, `FLEET_CONTEXT_DIVERGENCE`, …
- Guards: `assertAiBookingAccess`, `resolveAiVehicleAccess`, optional
  `assertAiLocationAccess` for `latestKnownLocation`.
- Only current ACTIVE booking is used as cause; historical `bookingId` flagged
  `HISTORICAL_BOOKING_NOT_CURRENT`.
- Tests: `ai-explain-overdue-return.spec.ts` (6) + `overdue-return-explanation.util.spec.ts` (7);
  **235/235** AI module.

### Prompt 14 — `get_vehicle_booking_context` domain tool (2026-07-24)

- Added `backend/src/modules/ai/tools/get-vehicle-booking-context/` — structured
  operational booking/return context for Fleet AI.
- Canonical service: `backend/src/modules/bookings/vehicle-booking-context/`
  — `VehicleBookingContextService` reuses `buildFleetBookingContextFromRows`,
  `VehiclesService.deriveFleetStatusContext`, handover protocols, pricing-quote
  extension (`returnAt` vs PATCH `endDate`).
- Output: `contextKind`, current/reserved/upcoming snapshots, `runtimeState`,
  `openProcessSteps`, `nextRelevantDeadline`, `pickupOverdue`, `returnOverdue`,
  `reasonCodes`, `inconsistencyFlags`.
- Customer PII: `customerDisplayName` only when `assertAiCustomerDataAccess`.
- Tests: `ai-explain-overdue-return.spec.ts` (6) + `overdue-return-explanation.util.spec.ts` (7);
  **235/235** AI module before Prompt 15.

### Prompt 15 — `AiDomainToolRegistry` (2026-07-25)

- Added `backend/src/modules/ai/registry/` — closed typed registry for five domain tools.
- `AiDomainToolRegistry` — explicit handlers only; preflight + central timeout.

### Prompt 16 — Fleet Chat intent router (2026-07-25)

- Added `backend/src/modules/ai/routing/` — controlled intent + entity router for Fleet Chat.
- `FleetChatIntentRouterService` + `routeFleetChatMessage()` — deterministic DE/EN keyword
  rules; hardened `AiVehicleResolutionService` for vehicle refs; combined intents
  (`COMBINED_VEHICLE_STATUS`); injection/tool-name stripping before scoring.
- Optional schema-validated LLM classification via `purpose: 'router'` when enabled.
- Tests: `fleet-chat-intent-router.spec.ts` (11); **262/262** AI module before Prompt 17.

### Prompt 17 — Fleet Chat orchestrator (2026-07-25)

- Added `backend/src/modules/ai/chat/fleet-chat-orchestrator.service.ts` —
  `FleetChatOrchestratorService.orchestrate(context, message)`.
- Flow: `FleetChatIntentRouterService` → minimal `AiDomainToolRegistry` tools
  (parallel independent) → `fleet-chat-evidence.util` + `fleet-chat-response.composer`
  → LLM (`purpose: chat`) with token-light grounded facts.
- Partial outcomes, tool budget + LLM timeouts, structured audit + performance metadata.
- `ChatService` legacy enrichment path unchanged until controller passes auth context.
- Tests: `fleet-chat-orchestrator.spec.ts` (8); **270/270** AI module.

### Prompt 20 — Fleet Chat evidence response composer (2026-07-25)

- Added `backend/src/modules/ai/chat/fleet-chat-evidence-response/` —
  `FleetChatEvidenceResponseComposerService`.
- Response types: DIRECT_ANSWER, LOCATION_SUMMARY, HEALTH_SUMMARY, OVERDUE_EXPLANATION,
  PARTIAL_DATA, INCONSISTENT_STATE, PERMISSION_RESTRICTED, AMBIGUITY_QUESTION, …
- Structured API metadata: `responseType`, `dataFreshness`, `sources`, `warnings`, `partial`,
  `correlationId`, optional `actions`, optional `evidenceSummary`.
- Deterministic fallback when LLM output fails evidence validation.
- Golden tests: location, health, overdue (DE core questions).
- Wired into `FleetChatOrchestratorService` → `FleetChatOrchestrateResult.structuredResponse`.

### Prompt 21 — AI Frontend structured Fleet Chat response (2026-07-25)

- `ChatService` calls `FleetChatOrchestratorService` with verified `AiExecutionContext`
  (`ChatExecutionContextResolver` from JWT + membership).
- SSE `result` and history include client-safe `structured` payload (no internal tool ids;
  `correlationId` omitted from persisted structured JSON).
- Prisma `chat_messages.structured_payload` JSON column for chat history metadata.
- Frontend `AIAssistantView` + `fleet-chat-response-display` + `safe-markdown` + metadata components.
- Vitest: 11 response-type component tests + display + XSS-safe markdown.

