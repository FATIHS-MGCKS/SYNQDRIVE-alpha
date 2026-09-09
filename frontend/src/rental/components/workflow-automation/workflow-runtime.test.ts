import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { de } from '../../../i18n/translations/de';
import { en } from '../../../i18n/translations/en';
import type { WorkflowListItemDto } from '../../../lib/api';
import {
  filterWorkflowItems,
  matchesWorkflowFilter,
  workflowLastRunOutcomeLabel,
  workflowStatusLabel,
} from './workflow-runtime.utils';

const workflowDir = resolve(__dirname);

function baseItem(overrides: Partial<WorkflowListItemDto> = {}): WorkflowListItemDto {
  return {
    id: 'wf-1',
    organizationId: 'org-1',
    name: 'Return prep',
    description: 'Prepare vehicle',
    category: 'vehicle_return',
    trigger: { type: 'booking.returned' },
    conditions: [],
    actions: [{ type: 'create_task' }],
    scope: { type: 'organization' },
    status: 'ACTIVE',
    statusLabel: 'Active',
    enabled: true,
    version: 2,
    createdById: null,
    createdByName: null,
    updatedById: null,
    updatedByName: null,
    lastTriggeredAt: null,
    triggerCount: 0,
    isTemplate: false,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-24T10:00:00.000Z',
    riskClass: 'LOW',
    sourceType: 'custom',
    approvalStatus: 'none',
    activeVersion: 2,
    lastRunAt: null,
    lastRunOutcome: 'none',
    lastRunLabel: null,
    hasLegacyMapping: false,
    unavailableActionCount: 0,
    ...overrides,
  };
}

const tEn = (key: keyof typeof en) => en[key];
const tDe = (key: keyof typeof de) => de[key];

describe('workflow runtime utils', () => {
  it('filters by archived status', () => {
    const items = [
      baseItem({ id: 'a', status: 'ARCHIVED' }),
      baseItem({ id: 'b', status: 'ACTIVE' }),
    ];
    const filtered = filterWorkflowItems(items, 'archived', '', tEn);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('a');
  });

  it('filters invalid workflows with unavailable actions', () => {
    const item = baseItem({ unavailableActionCount: 2, status: 'ACTIVE' });
    expect(matchesWorkflowFilter(item, 'invalid')).toBe(true);
  });

  it('labels status and last run outcomes in DE/EN', () => {
    expect(workflowStatusLabel('DRAFT', tEn)).toBe('Draft');
    expect(workflowStatusLabel('DRAFT', tDe)).toBe('Entwurf');
    expect(workflowLastRunOutcomeLabel('partial', tEn)).toBe('Partial success');
    expect(workflowLastRunOutcomeLabel('policy_blocked', tDe)).toBe('Policy blockiert');
  });

  it('filters by search without exposing uuid labels', () => {
    const item = baseItem({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Cleaning workflow',
    });
    const byName = filterWorkflowItems([item], 'all', 'cleaning', tEn);
    const byUuid = filterWorkflowItems([item], 'all', '00000000', tEn);
    expect(byName).toHaveLength(1);
    expect(byUuid).toHaveLength(0);
  });
});

describe('workflow runtime UI integration', () => {
  it('wires overview section and api list dto', () => {
    const overviewSource = readFileSync(resolve(workflowDir, 'WorkflowOverviewSection.tsx'), 'utf8');
    const viewSource = readFileSync(resolve(workflowDir, '../WorkflowAutomationView.tsx'), 'utf8');
    const apiSource = readFileSync(resolve(workflowDir, '../../../lib/api.ts'), 'utf8');

    expect(overviewSource).toContain('data-testid="workflow-runtime-overview"');
    expect(overviewSource).toContain('WORKFLOW_RUNTIME_FILTERS');
    expect(overviewSource).toContain('ErrorState');
    expect(viewSource).toContain('WorkflowOverviewSection');
    expect(viewSource).toContain('workflow-automation-no-access');
    expect(apiSource).toContain('WorkflowListItemDto');
    expect(apiSource).toContain('includeArchived');
  });

  it('includes mobile-friendly list layout hooks', () => {
    const overviewSource = readFileSync(resolve(workflowDir, 'WorkflowOverviewSection.tsx'), 'utf8');
    expect(overviewSource).toContain('grid-cols-1');
    expect(overviewSource).toContain('flex-wrap');
  });
});
