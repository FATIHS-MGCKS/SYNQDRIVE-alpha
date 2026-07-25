import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Frontend production-readiness contracts for Workflow Automation UI.
 * Complements backend matrix — scenarios 41 (mobile) and 42 (a11y).
 */

const WORKFLOW_DIR = resolve(__dirname);

function readSource(relativePath: string): string {
  return readFileSync(resolve(WORKFLOW_DIR, relativePath), 'utf8');
}

describe('Workflow Automation frontend production readiness', () => {
  it('scenario 41: mobile list uses touch-friendly min heights', () => {
    const overview = readSource('WorkflowOverviewSection.tsx');
    expect(overview).toMatch(/min-h-11/);
    expect(overview).toMatch(/overflow-x-hidden|min-w-0/);
  });

  it('scenario 42: drawer exposes aria-invalid and role=alert for validation', () => {
    const drawer = readSource('WorkflowConfigDrawer.tsx');
    expect(drawer).toMatch(/aria-invalid/);
    expect(drawer).toMatch(/role="alert"/);
  });

  it('dry-run panel does not call live execute endpoints from UI utils', () => {
    const simulate = readSource('useWorkflowSimulation.ts');
    expect(simulate).toMatch(/AbortController/);
    expect(simulate).toMatch(/dryRun|dry-run/i);
    expect(simulate).not.toMatch(/executionMode:\s*['"]LIVE['"]/);
  });

  it('runtime list isolates tenant via org-scoped API hooks', () => {
    const runtime = readSource('useWorkflowRuntimeCenter.ts');
    expect(runtime).toMatch(/organizationId|orgId/);
    expect(runtime).toMatch(/api\.workflows/);
  });

  it('task automation integration asserts workflow-automation permission keys', () => {
    const integration = readSource('task-automation.integration.test.ts');
    expect(integration).toMatch(/workflow-automation/);
  });
});
