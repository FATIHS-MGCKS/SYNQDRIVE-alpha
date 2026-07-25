# Workflow Matcher (Phase 5 Prompt 19)

**Date:** 2026-07-25  
**Code:** `backend/src/modules/workflows/matcher/`

## Purpose

`WorkflowMatcherService` maps validated `WorkflowDomainEventEnvelope` instances to **active, published workflow versions** without executing actions or creating `WorkflowRun` rows.

Match-only contract — execution is a separate phase (engine / run orchestrator).

## Match criteria

| Criterion | Source | Layer |
|-----------|--------|-------|
| `organizationId` | Envelope | DB `WHERE` |
| `eventType` | Envelope | DB `workflow_triggers.organization_id + trigger_type` index |
| Definition not archived | `WorkflowDefinition.lifecycleStatus` | DB join |
| Version published + active | `WorkflowVersion.status`, `publishedAt`, `activeForDefinition` | DB join |
| Active version pointer | `definition.activeVersionId === version.id` | In-memory guard |
| `eventVersion` | Trigger `config.supportedEventVersions` or registry default | In-memory |
| `entityType` | Trigger `config.entityTypes` | In-memory |
| Scope | `WorkflowScope` + `WorkflowScopeBinding` | In-memory (fail-closed) |
| Validity window | Trigger `config.validFrom/validUntil` | In-memory |
| Feature flags | `WorkflowFeatureFlag` + rollout scopes / % | Batch load + in-memory |
| Capabilities | `WorkflowAction.capabilityStatusAtPublish` | In-memory |
| Policy | Trigger `config.policyRequirements` | In-memory |

## Matcher query (Prisma)

```typescript
workflowTrigger.findMany({
  where: {
    organizationId,
    triggerType: eventType,
    version: {
      status: 'ACTIVE',
      publishedAt: { not: null },
      activeForDefinition: {
        is: { lifecycleStatus: 'ACTIVE', remediationRequired: false },
      },
    },
  },
  select: { trigger, version, definition, scope.bindings, actions },
  orderBy: [{ version: { definition: { createdAt: 'asc' } } }, { id: 'asc' }],
});
```

### Indexes used

| Index | Table | Columns |
|-------|-------|---------|
| `workflow_triggers_organization_id_trigger_type_idx` | `workflow_triggers` | `organization_id`, `trigger_type` |
| `workflow_definitions_organization_id_lifecycle_status_idx` | `workflow_definitions` | `organization_id`, `lifecycle_status` |
| `workflow_versions_organization_id_workflow_definition_id_st_idx` | `workflow_versions` | `organization_id`, `workflow_definition_id`, `status` |
| `workflow_scope_bindings_organization_id_binding_type_binding_id_idx` | `workflow_scope_bindings` | `organization_id`, `binding_type`, `binding_id` |
| `workflow_feature_flags_organization_id_flag_key_idx` | `workflow_feature_flags` | `organization_id`, `flag_key` |

No full-org workflow list is loaded — only triggers matching `(organizationId, eventType)`.

## Scope rules (fail-closed)

- `ORGANIZATION` — tenant-wide match
- `STATION` / `VEHICLE` — requires ≥1 binding; event must carry matching `stationId` / `vehicleId`
- Missing scope row or empty bindings on scoped types → `SCOPE_NOT_CONFIGURED` / `SCOPE_EMPTY_BINDINGS`
- Empty binding list does **not** mean global

## Deterministic ordering

After evaluation, matches are sorted by:

1. `definition.createdAt` ASC  
2. `definition.name` ASC  
3. `versionNumber` ASC  
4. `definition.id` ASC  

`matchRank` is assigned 1..n.

## Skip reasons

Standardized codes in `workflow-matcher-skip-reasons.ts` — returned in `WorkflowMatcherResult.skipped` for dry-run explainability. **No `WorkflowRun` rows** are created for skipped workflows.

Per-workflow evaluation errors (`EVALUATION_ERROR`) do not block other candidates.

## API

```typescript
const result = await workflowMatcher.match({ envelope, dryRun: true });
// result.matches — workflows to execute (next phase)
// result.skipped — explainable non-matches
```

## Tests

`backend/src/modules/workflows/matcher/workflow-matcher.spec.ts` — 16 cases including cross-tenant, scope, version, ordering, performance (250 candidates < 500ms).

## Related

- `docs/architecture/workflow-domain-event-registry-2026-07.md` — event types
- Outbox dispatch (Prompt 17) — matcher sits **before** engine execution (integration pending)
