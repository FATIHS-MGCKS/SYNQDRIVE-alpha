import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.join(__dirname, '../../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  'prisma/migrations/20260725200000_workflow_canonical_runtime/migration.sql',
);

describe('Workflow canonical runtime schema (Phase 3 Prompt 10)', () => {
  it('passes prisma validate', () => {
    const output = execSync('npm run prisma:validate', {
      cwd: BACKEND_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://synqdrive:synqdrive@localhost:5432/synqdrive',
      },
    });
    expect(output).toContain('valid');
  });

  it('defines canonical workflow models with tenant scoping and idempotency', () => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    expect(schema).toContain('model WorkflowDefinition');
    expect(schema).toContain('model WorkflowVersion');
    expect(schema).toContain('model WorkflowTrigger');
    expect(schema).toContain('model WorkflowScope');
    expect(schema).toContain('model WorkflowScopeBinding');
    expect(schema).toContain('model WorkflowConditionGroup');
    expect(schema).toContain('model WorkflowCondition');
    expect(schema).toContain('model WorkflowAction');
    expect(schema).toContain('model WorkflowRun');
    expect(schema).toContain('model WorkflowActionRun');
    expect(schema).toContain('model WorkflowApproval');
    expect(schema).toContain('model WorkflowDelivery');
    expect(schema).toContain('model WorkflowEventOutbox');
    expect(schema).toMatch(/enum WorkflowEventOutboxStatus[\s\S]*?CLAIMED/);
    expect(schema).toMatch(/enum WorkflowEventOutboxStatus[\s\S]*?DISPATCHED/);
    expect(schema).toMatch(/enum WorkflowEventOutboxStatus[\s\S]*?RETRY_SCHEDULED/);
    expect(schema).toMatch(/model WorkflowEventOutbox[\s\S]*?eventId/);
    expect(schema).toMatch(/model WorkflowEventOutbox[\s\S]*?claimedAt/);
    expect(schema).toMatch(/model WorkflowEventOutbox[\s\S]*?leaseExpiresAt/);
    expect(schema).toMatch(/model WorkflowEventOutbox[\s\S]*?attemptCount/);
    expect(schema).toContain('model WorkflowTimer');
    expect(schema).toContain('model WorkflowRevision');
    expect(schema).toContain('model WorkflowPolicySnapshot');
    expect(schema).toContain('model WorkflowFeatureFlag');
    expect(schema).toContain('model WorkflowRolloutScope');

    expect(schema).toMatch(/model WorkflowRun[\s\S]*?@@unique\(\[organizationId, idempotencyKey\]/);
    expect(schema).toMatch(/model WorkflowActionRun[\s\S]*?@@unique\(\[organizationId, idempotencyKey\]/);
    expect(schema).toMatch(/model WorkflowApproval[\s\S]*?actionRunId\s+String\s+@unique/);
    expect(schema).toMatch(/model WorkflowVersion[\s\S]*?onDelete: Restrict/);
    expect(schema).toMatch(/model OrgWorkflow[\s\S]*?@deprecated/);
  });

  it('migration is additive and avoids cascade deletes on runtime lineage', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toContain('CREATE TABLE "workflow_definitions"');
    expect(sql).toContain('CREATE TABLE "workflow_runs"');
    expect(sql).toContain('ON DELETE RESTRICT');
    expect(sql).not.toMatch(/DROP TABLE "org_workflow/i);
    expect(sql).not.toMatch(/DELETE FROM/i);
    expect(sql).toContain('workflow_runs_org_idempotency_key');
    expect(sql).toContain('workflow_approvals_action_run_id_key');
    expect(sql).toContain('workflow_approvals_pending_expiry_idx');
    expect(sql).toContain('workflow_timers_status_fire_at_idx');
    expect(sql).toContain('workflow_event_outbox_status_available_idx');
    expect(sql).toContain('workflow_definitions_org_slug_active_key');
  });

  it('documents JSON field purpose bindings in schema', () => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    expect(schema).toContain('/// Frozen normalized graph at publish');
    expect(schema).toContain('/// Action config — no API keys');
    expect(schema).toContain('/// IDs/links only — no message bodies');
    expect(schema).toContain('/// Domain event payload — may contain PII');
  });
});
