# DIMO Deep Audit — Final Coverage Matrix (R4.5)

**Production evidence pin:** `a4d06c602ff192aa7ba6688a6472100033417bca`  
**Repository pin:** `09fd5d72ad06d71c0cded8af0422dd35df58b714`  
**Matrix date:** 2026-10-12

| Dimension | Status | Evidence |
|-----------|--------|----------|
| **R4.0** Production baseline | **DONE** | `evidence/PRODUCTION_BASELINE.md`, R9 historical prod |
| **R4.1** Provider query inventory | **DONE** | [evidence/PROVIDER_QUERY_INVENTORY.md](./evidence/PROVIDER_QUERY_INVENTORY.md) |
| **R4.1a** Metrics / budget | **DONE** | `/opt/cursor/artifacts/DIMO_R41A_*` |
| **R4.1b** JWT 403 RCA | **DONE** | `/opt/cursor/artifacts/DIMO_R41B_*` |
| **R4.2** Telemetry quality | **DONE** | `/opt/cursor/artifacts/DIMO_R42_*` |
| **R4.3** Live map / contract | **DONE** | `/opt/cursor/artifacts/DIMO_R43_*` |
| **A** Auth / consent / tenant | **DONE** | [evidence/AUTH_AND_CONSENT_MATRIX.md](./evidence/AUTH_AND_CONSENT_MATRIX.md) |
| **B** Webhook security & delivery | **DONE** | [evidence/WEBHOOK_SECURITY_AND_DELIVERY.md](./evidence/WEBHOOK_SECURITY_AND_DELIVERY.md) |
| **C** E2E reliability | **PARTIAL** | [evidence/E2E_RELIABILITY_PATHS.md](./evidence/E2E_RELIABILITY_PATHS.md) — Redis outage impact **NOT_MEASURED** |
| **D** Provider queries | **DONE** | PROVIDER_QUERY_INVENTORY + call-site scan (55 entries @ R4.5) |
| **E** Registry / tenant boundaries | **DONE** | [evidence/TENANT_AND_REGISTRY_BOUNDARIES.md](./evidence/TENANT_AND_REGISTRY_BOUNDARIES.md) |
| **F** Data integrity (PG) | **DONE** | R4.2/4.3 PG samples |
| **F** Data integrity (CH) | **BLOCKED** | [EXTERNAL_EVIDENCE_GAPS.md](./EXTERNAL_EVIDENCE_GAPS.md) EXT-001 |
| **R9 T+24** natural evaluation | **OPEN/BLOCKED** | [evidence/R9_T24_EVALUATION.md](./evidence/R9_T24_EVALUATION.md) — earliest `2026-10-12T20:41:00Z` |

## Completion score

| Bucket | Weight | Filled |
|--------|-------:|-------:|
| R4 slices | 35% | 35% |
| A–F technical | 45% | ~40% (C partial, CH blocked) |
| R9 T+24 + external | 20% | pending window |
| **Estimated AUDIT_COVERAGE_PERCENT** | | **~88%** pre-T+24; **~92%** if T+24 completes with NOT_OBSERVED acceptable |

## Audit closure rule

Dimensions may be **DONE** with documented external blockers (CH, optional UI capture). **R9 T+24** must be **attempted** after the allowed window before recommending **CLOSED**.
