# Battery V2 — Evidence Index

Evidence nodes live in `graph/nodes.yaml` (`BAT-V2-EVID-*`, `BAT-V2-TEST-*`).

## By source_type

| source_type | Examples |
|-------------|----------|
| `CURRENT_CODE` | `BAT-V2-EVID-CODE-ANCHOR-001`, `BAT-V2-EVID-CODE-HAS-LIVE-JOB-001` |
| `CURRENT_TEST` | `BAT-V2-TEST-ORPHAN-ENQ-001`, `BAT-V2-TEST-PEND-EVAL-001` |
| `ARCHITECTURE_DOCUMENT` | `BAT-V2-EVID-ARCH-PIPELINE-CLOSURE-001` |
| `PRODUCTION_OBSERVATION` | `BAT-V2-EVID-PROD-EA7696B6-001` |
| `PR_HISTORY` | `BAT-V2-EVID-PR-1445-001` |

## Epistemic classification

Each evidence node carries `epistemic_status` for the **claim it supports**, not for its own existence.

Example: `BAT-V2-EVID-ARCH-PIPELINE-CLOSURE-001` exists (CONFIRMED) but claims within may be HISTORICAL or require code re-verification.

Pre-change production observations support OBSERVATION/WHY — they do **not** constitute post-fix `PRODUCTION_VALIDATED` evidence.

## Rules

- Do not treat tests as production validation
- Do not treat architecture memos as current code truth without `source_paths` verification
- Production correlation ≠ causation unless supported
- Evidence nodes require machine-readable `source_type`

## Source path convention

`source_paths` in YAML use repository-relative paths, e.g.:

```
backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-reconciliation.service.ts
```

Optional: `source_locator`, `verified_ref`, `verified_at` for PR/commit provenance.
