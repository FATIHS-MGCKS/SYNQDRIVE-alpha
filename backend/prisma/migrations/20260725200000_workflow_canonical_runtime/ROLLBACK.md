# Rollback / forward-fix — `20260725200000_workflow_canonical_runtime`

## Safe rollback (Phase A — additive tables only)

This migration only **creates** new `workflow_*` tables and enums. Legacy `org_workflow*` tables are untouched.

### Rollback SQL (manual, pre-cutover)

Run in a transaction after stopping any dual-write to canonical tables:

```sql
-- Drop FK order: children first
DROP TABLE IF EXISTS "workflow_rollout_scopes" CASCADE;
DROP TABLE IF EXISTS "workflow_feature_flags" CASCADE;
DROP TABLE IF EXISTS "workflow_revisions" CASCADE;
DROP TABLE IF EXISTS "workflow_timers" CASCADE;
DROP TABLE IF EXISTS "workflow_event_outbox" CASCADE;
DROP TABLE IF EXISTS "workflow_deliveries" CASCADE;
DROP TABLE IF EXISTS "workflow_approvals" CASCADE;
DROP TABLE IF EXISTS "workflow_action_runs" CASCADE;
DROP TABLE IF EXISTS "workflow_runs" CASCADE;
DROP TABLE IF EXISTS "workflow_policy_snapshots" CASCADE;
DROP TABLE IF EXISTS "workflow_actions" CASCADE;
DROP TABLE IF EXISTS "workflow_conditions" CASCADE;
DROP TABLE IF EXISTS "workflow_condition_groups" CASCADE;
DROP TABLE IF EXISTS "workflow_scope_bindings" CASCADE;
DROP TABLE IF EXISTS "workflow_scopes" CASCADE;
DROP TABLE IF EXISTS "workflow_triggers" CASCADE;
DROP TABLE IF EXISTS "workflow_versions" CASCADE;
DROP TABLE IF EXISTS "workflow_definitions" CASCADE;

DROP TYPE IF EXISTS "WorkflowRolloutScopeType";
DROP TYPE IF EXISTS "WorkflowFeatureFlagScope";
DROP TYPE IF EXISTS "WorkflowRevisionType";
DROP TYPE IF EXISTS "WorkflowTimerStatus";
DROP TYPE IF EXISTS "WorkflowTimerType";
DROP TYPE IF EXISTS "WorkflowEventOutboxStatus";
DROP TYPE IF EXISTS "WorkflowDeliveryStatus";
DROP TYPE IF EXISTS "WorkflowDeliveryChannel";
DROP TYPE IF EXISTS "WorkflowRuntimeApprovalStatus";
DROP TYPE IF EXISTS "WorkflowRuntimeActionRunStatus";
DROP TYPE IF EXISTS "WorkflowRuntimeRunStatus";
DROP TYPE IF EXISTS "WorkflowActionCapabilityStatus";
DROP TYPE IF EXISTS "WorkflowConditionOperator";
DROP TYPE IF EXISTS "WorkflowConditionLogicOperator";
DROP TYPE IF EXISTS "WorkflowScopeBindingType";
DROP TYPE IF EXISTS "WorkflowScopeType";
DROP TYPE IF EXISTS "WorkflowVersionStatus";
DROP TYPE IF EXISTS "WorkflowDefinitionLifecycleStatus";
```

Then remove migration record:

```sql
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260725200000_workflow_canonical_runtime';
```

**Data impact:** Only rows in new `workflow_*` tables are lost. Legacy workflows continue to work.

## Forward-fix (preferred over rollback after cutover begins)

1. Set feature flag `WORKFLOW_RUNTIME_V2=false` — engine reads legacy only.
2. Leave canonical tables in place; reconcile with `legacy_org_workflow_id` bridge column.
3. Fix service-layer bugs; redeploy with flag enabled per org.

## Post-cutover

Once engine writes only to `workflow_*` and legacy is read-only, rollback requires DB restore — not supported by this script alone.
