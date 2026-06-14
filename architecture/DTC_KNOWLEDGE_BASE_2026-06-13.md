# Changes & Architektur — DTC Knowledge Base (2026-06-13)

> In-repo record for the AI-enriched DTC Knowledge Base. Full feature docs:
> [`docs/dtc-knowledge-base.md`](../docs/dtc-knowledge-base.md).

## Changes

- Added an **additive** AI knowledge layer to the existing DTC / Error Code
  feature. Active DTCs in *Vehicle Details → Health → Error Codes* now carry an
  optional, cached `knowledge` object (meaning, causes, effects, technical +
  rental urgency, rental recommendation, sources, optional vehicle-specific
  interpretation). The existing DTC system was **not** rewritten.
- New folder `backend/src/modules/vehicle-intelligence/dtc-knowledge/`:
  `dtc-knowledge.util.ts` (normalize/category/standard-type),
  `dtc-knowledge.types.ts`, `dtc-research.port.ts` (swappable adapter),
  `dtc-ai-research.service.ts` (DIMO-agent-backed JSON research),
  `dtc-knowledge.service.ts` (lookup / placeholder / dedup-safe enqueue / DTO),
  `dtc-knowledge-enrichment.service.ts` (worker logic). Worker
  `workers/processors/dtc-knowledge.processor.ts`.
- Prisma: two new tables only — `DtcKnowledge` + `DtcVehicleKnowledge`
  (**no `DtcKnowledgeJob` table**; job state lives in `enrichmentStatus`).
  Migration `20260613100000_dtc_knowledge_base` (idempotent `IF NOT EXISTS`).
- `VehicleIntelligenceController.getDtcDetail` attaches knowledge to active
  faults (enqueues missing) + history (READY generic only, no enqueue), wrapped
  in try/catch so DTC display never breaks. New admin/owner-guarded
  `POST dtc/:code/knowledge/retry`.
- Wiring: providers + `DTC_RESEARCH_PORT` binding + queue in
  `VehicleIntelligenceModule`; processor + queue in `WorkersModule`; queue name
  `dtc.knowledge.enrichment` in `queue-names.ts`.
- Frontend: `HealthErrorsView.tsx` compact knowledge panel + background polling +
  admin retry; `lib/api.ts` adds `DtcKnowledgeDto` + `dtcKnowledgeRetry`.
- Tests: 4 new spec files (21 tests) — normalization, invalid-code no-enqueue,
  placeholder+queue, dedup, FAILED auto vs retry, vehicle override, JSON
  validation/sanitization, agent 404 retry, enrichment idempotency/transitions.

## Architektur (signal/data-flow deltas)

- **New async path**: `GET dtc/detail` (DtcService.getDetail unchanged) →
  per active fault `DtcKnowledgeService.getOrQueueForActiveFault` → placeholder
  rows + BullMQ `dtc.knowledge.enrichment` (GENERIC/VEHICLE jobs) →
  `DtcKnowledgeEnrichmentService` → `DtcAiResearchService` (DIMO Agents) →
  compact sanitized result persisted, status `READY`/`FAILED`. UI polls until
  ready. Recurring DTCs are served straight from the DB.
- **DIMO**: reuses the existing `DimoAgentsService` (`createAgent` /
  `sendMessageStream`) only — no changes to DIMO auth, token exchange,
  telemetry, DTC polling, segments, trips, or vehicle latest-state logic.
- **Storage discipline**: only short structured summaries + source URLs are
  persisted; no raw HTML / prompts / transcripts / field-level confidence.
  Errors sanitized (Bearer redacted) and capped.
- Enqueue is idempotent (stable jobId + `enrichmentStatus` guard); auto path
  never re-queues `FAILED` (manual retry only) to avoid repeat AI calls.
