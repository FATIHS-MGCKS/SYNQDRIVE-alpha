# Phase 2.5 — Evaluations Architecture Authority Matrix

## Snapshot

- Current `origin/main`: `2d721a902feb56101eb9992249f1859ff64024cb`
- Phase-2 main: `2d721a902feb56101eb9992249f1859ff64024cb`
- Delta (left/right): `0	0`
- Generated: `2026-08-10T18:04:30Z`
- Git: `git version 2.43.0`
- GitHub CLI: `gh version 2.91.0 (2026-04-22)`

## Authority availability

- Book I–IV files matching the supplied canonical titles were not present in the repository.
- The direct Phase-2.5 mandate is controlling product authority for this audit.
- Existing ADRs, canonical platform architecture and current code were checked as lower-level contradiction evidence.
- Historical recovery PRs were used only as implementation evidence.

- A mismatch with current implementation is classified as a Phase-3 migration gap, not an authority contradiction. The accepted ADRs intentionally supersede interim EUR-only, browser-timezone, client-KPI and coarse-guard behavior where stated.

## Requirements matrix

| Decision | Requirement | Source document | Source section | Requirement | Impact |
|---|---|---|---|---|---|
| EVAL-ADR-001 | REQ-MONEY-001 | backend/prisma/schema.prisma | OrgInvoice/Billing money fields | Transaction values have integer minor units and explicit currency. | Preserve original values; add typed evaluations money/provenance. |
| EVAL-ADR-001 | REQ-MONEY-002 | docs/architecture/analytics/evaluations-calculation-versioning.md | Provenance contract | Applied filters and source versions make results reproducible. | FX timestamp/source/status become provenance inputs. |
| EVAL-ADR-002 | REQ-TIME-001 | backend/prisma/schema.prisma | Organization/Station | Organization and station carry IANA timezone candidates. | Use explicit → station → organization precedence. |
| EVAL-ADR-002 | REQ-TIME-002 | docs/audits/evaluations/evaluations-post-remediation-readiness-2026-07.md | Residual P2 | Browser-local month boundaries are an acknowledged gap. | Replace local Date business boundaries. |
| EVAL-ADR-003 | REQ-UI-001 | docs/architecture/analytics/evaluations-metric-registry.md | Purpose | Metric Registry is the evaluations KPI single source of truth. | UI renders contracts and does not calculate a second truth. |
| EVAL-ADR-003 | REQ-UI-002 | docs/audits/evaluations/evaluations-technical-inventory-2026-07.md | Navigation / duplicate calculations | Current route and duplicate client engines are documented. | Cut over the same route and retire compatibility engines. |
| EVAL-ADR-004 | REQ-ENTITY-001 | docs/architecture/analytics/evaluations-calculation-versioning.md | Applied filters/source versions | Entity scope and lineage must be reproducible. | Use tenant-validated typed references and snapshots. |
| EVAL-ADR-005 | REQ-ACTION-001 | backend/src/modules/business-audit/business-audit.service.ts | Transactional outbox | Critical business actions have durable audit support. | Material recommendation actions use central services and audit. |
| EVAL-ADR-005 | REQ-ACTION-002 | docs/compliance/workflow-audit-and-ai-transparency-2026-07.md | Workflow/AI governance | Automation requires transparent controlled execution. | No autonomous irreversible AI side effects. |
| EVAL-ADR-006 | REQ-FC-001 | docs/architecture/analytics/evaluations-metric-registry.md | metricKind | Rule estimates, statistical forecasts and ML forecasts are distinct. | Separate labels, release gates and UI semantics. |
| EVAL-ADR-006 | REQ-FC-002 | docs/architecture/analytics/evaluations-calculation-versioning.md | Reproducibility | Formula, period, filters and sources are versioned. | Forecast/model/feature versions and as-of timestamps are mandatory. |
| EVAL-ADR-007 | REQ-PERM-001 | backend/src/shared/auth/permission.constants.ts | Canonical module keys | Membership permissions use central module keys. | Add evaluations centrally; no local role engine. |
| EVAL-ADR-007 | REQ-PERM-002 | backend/src/shared/auth/operational-permission.util.ts | Granular actions | Operational actions map to central module permissions. | Add detail/export/admin actions through the registry. |
| EVAL-ADR-008 | REQ-AUDIT-001 | backend/src/modules/business-audit/business-audit.service.ts | Business audit outbox | Durable critical audit events can be transactionally enqueued. | Sensitive reads/exports and writes reuse this mechanism. |
| EVAL-ADR-009 | REQ-FLAG-001 | frontend/src/rental/lib/notifications/notifications-v2-flag.ts | Rollout modes | Existing rollout precedent is off/shadow/on plus org allowlist. | Predictive follows default-off scoped rollout. |
| EVAL-ADR-010 | REQ-VIS-001 | docs/audits/evaluations/evaluations-e2e-visual-report-2026-07.md | E2E/visual baseline | Current reproducible #818 suite is preservation evidence. | Regenerate current baselines; drop historical PNG-only patches. |

## Decision lock

| Decision | Status | Authority sources | Open question | Final decision |
|---|---|---|---|---|
| `EVAL-ADR-001` | `ACCEPTED` | 4 repository sources + direct mandate | None | A typed money contract preserves original amounts and converts only with historical FX provenance. |
| `EVAL-ADR-002` | `ACCEPTED` | 3 repository sources + direct mandate | None | UTC storage is evaluated through an explicit report timezone, station timezone, then organization timezone. |
| `EVAL-ADR-003` | `ACCEPTED` | 5 repository sources + direct mandate | None | The `financial-insights` route becomes a modular EvaluationsPage backed only by canonical analytics APIs. |
| `EVAL-ADR-004` | `ACCEPTED` | 3 repository sources + direct mandate | None | A relational typed-reference authority is paired with immutable display snapshots. |
| `EVAL-ADR-005` | `ACCEPTED` | 4 repository sources + direct mandate | None | Navigation is direct; material writes use central policies, confirmation, idempotency and audit. |
| `EVAL-ADR-006` | `ACCEPTED` | 4 repository sources + direct mandate | None | Forecasts require sufficient point-in-time data, backtesting, calibrated uncertainty and versioned release evidence. |
| `EVAL-ADR-007` | `ACCEPTED` | 4 repository sources + direct mandate | None | Evaluations capabilities extend the central module/operational permission model instead of creating a role engine. |
| `EVAL-ADR-008` | `ACCEPTED` | 5 repository sources + direct mandate | None | Routine aggregate reads are not audited; sensitive details, exports and administration are. |
| `EVAL-ADR-009` | `ACCEPTED` | 3 repository sources + direct mandate | None | Predictive APIs and UI are disabled by default and activate only after model release gates. |
| `EVAL-ADR-010` | `ACCEPTED` | 3 repository sources + direct mandate | None | Reproducible tests and current baselines are authority; historical screenshots are not recovered. |

## Cross-decision invariants

- One metric registry and calculation-provenance authority.
- One typed money/conversion authority; invoice domains retain original transaction truth.
- One timezone/period resolver.
- One central RBAC/operational-permission engine.
- One recommendation state domain delegating side effects to existing services.
- One forecast/model registry and release gate.
- No React-local KPI engine after cutover.
