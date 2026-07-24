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
- No parallel AI module — extends existing `backend/src/modules/ai/`.

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
