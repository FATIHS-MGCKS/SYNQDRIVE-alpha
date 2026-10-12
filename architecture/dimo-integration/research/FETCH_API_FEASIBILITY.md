# R2 — Fetch API feasibility (assessment only)

**Source:** https://dimo.org/docs/api-references/fetch-api/introduction @ 2026-10-11

| Aspect | Assessment |
|--------|------------|
| Endpoint | `https://fetch-api.dimo.zone/query` GraphQL |
| Data model | CloudEvents (`header`, `data`, `dataBase64`, `dataUrl`) |
| Auth | Vehicle JWT with **raw data privilege** (separate from standard telemetry GraphQL) |
| SynqDrive usage | **NOT_IMPLEMENTED** in `backend/src/modules/dimo/` |
| Use case | Bulk historical raw events; potential HF replay reduction vs repeated `signals()` |
| Pagination | `cloudEvents(did, limit, filter)` — details in full schema (not introspected in R2) |
| Cost | **UNKNOWN** — requires provider pricing / limits |
| Integration effort | New client module, privilege audit, retention alignment |

**Verdict:** **NOT_APPLICABLE** to current production path; **POSSIBLE** future architecture for document/raw pipelines — no implementation in R2.
