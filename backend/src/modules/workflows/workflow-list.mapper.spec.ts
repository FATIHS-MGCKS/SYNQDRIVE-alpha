import { mapWorkflowListItem, isSystemWorkflow } from './workflow-list.mapper';

describe('workflow-list.mapper', () => {
  const baseWorkflow = {
    id: 'wf-1',
    organizationId: 'org-1',
    name: 'Return prep',
    description: 'Prepare vehicle after return',
    category: 'vehicle_return',
    trigger: { type: 'booking.returned' },
    conditions: [],
    actions: [{ type: 'task.create' }],
    scope: { type: 'organization' },
    status: 'ACTIVE' as const,
    enabled: true,
    version: 3,
    createdById: 'user-1',
    createdByName: 'Admin',
    updatedById: 'user-1',
    updatedByName: 'Admin',
    lastTriggeredAt: new Date('2026-07-24T10:00:00.000Z'),
    triggerCount: 5,
    isTemplate: false,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-24T10:00:00.000Z'),
  };

  it('maps runtime metadata for list items', () => {
    const item = mapWorkflowListItem(baseWorkflow as any, {
      latestRun: {
        id: 'run-1',
        workflowId: 'wf-1',
        status: 'SUCCESS',
        startedAt: new Date('2026-07-24T11:00:00.000Z'),
        finishedAt: new Date('2026-07-24T11:01:00.000Z'),
      } as any,
    });

    expect(item.riskClass).toBe('LOW');
    expect(item.sourceType).toBe('custom');
    expect(item.activeVersion).toBe(3);
    expect(item.lastRunOutcome).toBe('success');
  });

  it('flags migrated legacy trigger mappings', () => {
    const item = mapWorkflowListItem({
      ...baseWorkflow,
      trigger: { type: 'vehicle_returned' },
      actions: [{ type: 'create_task' }],
    } as any);

    expect(item.sourceType).toBe('migrated');
    expect(item.hasLegacyMapping).toBe(true);
    expect(item.unavailableActionCount).toBe(0);
  });

  it('detects unavailable actions', () => {
    const item = mapWorkflowListItem({
      ...baseWorkflow,
      actions: [{ type: 'ai_execute' }],
    } as any);

    expect(item.unavailableActionCount).toBe(1);
  });

  it('hides system anchor workflows', () => {
    expect(
      isSystemWorkflow({
        name: '__system_maker_checker_anchor__',
        isTemplate: true,
      } as any),
    ).toBe(true);
  });
});
