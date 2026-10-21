# DIMO Integration — Agent Contract (Partial, `AUDIT_IN_PROGRESS`)

**Effective:** 2026-09-07
**Registry coverage:** `AUDIT_IN_PROGRESS`

## Mandatory read-first sequence

1. [README.md](README.md), [AUDIT_MANIFEST.md](AUDIT_MANIFEST.md), [CURRENT_STATE.md](CURRENT_STATE.md)
2. [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md), [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md), [operations/WEBHOOK_OPERATIONS.md](operations/WEBHOOK_OPERATIONS.md) (provider webhook mutations)
3. [decisions/DECISION_REGISTER.md](decisions/DECISION_REGISTER.md) — includes **DIM-R9-001**
4. Neighbor: [Trip Detection & Lifecycle](../trip-detection-lifecycle/README.md) for R9 wake boundary

## Substantive change duty

Any substantive DIMO Integration change **must** update this authority in the **same workstream/PR**.

Substantive includes: webhook auth/verification, trigger registration, provider gateway/limiter/budget behavior, telemetry query paths, segments client contracts, device-connection episode semantics, vehicle link policies, queue wiring affecting provider fetch.

## Production safety

Read-only by default. No trigger registration/removal, provider config mutation, deploy, or queue mutation without explicit authorization.

## Validation

```bash
bash architecture/scripts/validate-module-registry.sh
bash architecture/dimo-integration/scripts/validate-graph.sh
git diff --check
```

## Cross-module: Trip Detection R9

When changing `dimo-webhook.controller.ts` wake delegation, **also** update Trip Detection authority cross-reference and this module's `DIM-R9-001` evidence if contract changes.
