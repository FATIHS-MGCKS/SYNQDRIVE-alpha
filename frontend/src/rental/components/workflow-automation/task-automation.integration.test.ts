import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowDir = resolve(__dirname);
const rentalDir = resolve(__dirname, '../..');

describe('task automation workflow integration', () => {
  it('wires permissions in App and workflow section tab', () => {
    const appSource = readFileSync(resolve(rentalDir, 'App.tsx'), 'utf8');
    const workflowSource = readFileSync(resolve(workflowDir, '../WorkflowAutomationView.tsx'), 'utf8');
    const sidebarSource = readFileSync(resolve(rentalDir, 'components/Sidebar.tsx'), 'utf8');

    const drawerSource = readFileSync(resolve(workflowDir, 'TaskAutomationRuleDrawer.tsx'), 'utf8');

    expect(appSource).toContain("hasPermission('workflow-automation', 'read')");
    expect(appSource).toContain("hasPermission('workflow-automation', 'write')");
    expect(workflowSource).toContain('Aufgaben-Automationen');
    expect(drawerSource).toContain('TaskAutomationSimulationPanel');
    expect(sidebarSource).toContain("hasPermission('workflow-automation', 'read')");
  });

  it('exposes task automation api namespace', () => {
    const apiSource = readFileSync(resolve(rentalDir, '../lib/api.ts'), 'utf8');
    expect(apiSource).toContain('taskAutomation:');
    expect(apiSource).toContain('/task-automation/rules');
    expect(apiSource).toContain('/simulate');
  });
});
