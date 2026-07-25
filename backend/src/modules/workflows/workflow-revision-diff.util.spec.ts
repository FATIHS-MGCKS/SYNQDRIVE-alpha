import { buildWorkflowRevisionDiff } from './workflow-revision-diff.util';

describe('workflow-revision-diff.util', () => {
  const baseline = {
    name: 'Return workflow',
    description: 'Checks vehicle on return',
    category: 'vehicle_return',
    trigger: { type: 'booking.returned' },
    conditions: [{ field: 'vehicle_status', operator: 'equals', value: 'DIRTY' }],
    actions: [{ type: 'task.create', config: { title: 'Clean vehicle' } }],
    scope: { type: 'organization' },
    status: 'ACTIVE',
    version: 3,
  };

  it('detects trigger and scope changes', () => {
    const diff = buildWorkflowRevisionDiff({
      baseline,
      proposed: {
        ...baseline,
        trigger: { type: 'booking.confirmed' },
        scope: { type: 'station', stationIds: ['st-1'] },
        version: 4,
      },
    });

    expect(diff.hasChanges).toBe(true);
    expect(diff.changes.some((c) => c.kind === 'trigger_changed')).toBe(true);
    expect(diff.changes.some((c) => c.kind === 'scope_changed')).toBe(true);
    expect(diff.changes.some((c) => c.kind === 'policy_changed')).toBe(true);
  });

  it('detects action add/remove and reorder', () => {
    const added = buildWorkflowRevisionDiff({
      baseline,
      proposed: {
        ...baseline,
        actions: [
          ...baseline.actions,
          { type: 'notification.prepare', config: { target: 'admin' } },
        ],
        version: 4,
      },
    });
    expect(added.changes.some((c) => c.kind === 'action_added')).toBe(true);
    expect(added.proposedRiskClass).toBe('HIGH');

    const removed = buildWorkflowRevisionDiff({
      baseline: {
        ...baseline,
        actions: [
          { type: 'task.create', config: { title: 'A' } },
          { type: 'alert.create', config: { message: 'B' } },
        ],
      },
      proposed: {
        ...baseline,
        actions: [{ type: 'task.create', config: { title: 'A' } }],
        version: 4,
      },
    });
    expect(removed.changes.some((c) => c.kind === 'action_removed')).toBe(true);

    const reordered = buildWorkflowRevisionDiff({
      baseline: {
        ...baseline,
        actions: [
          { type: 'task.create', config: { title: 'A' } },
          { type: 'alert.create', config: { message: 'B' } },
        ],
      },
      proposed: {
        ...baseline,
        actions: [
          { type: 'alert.create', config: { message: 'B' } },
          { type: 'task.create', config: { title: 'A' } },
        ],
        version: 4,
      },
    });
    expect(reordered.changes.some((c) => c.kind === 'action_reordered')).toBe(true);
  });

  it('includes actor metadata', () => {
    const diff = buildWorkflowRevisionDiff({
      baseline,
      proposed: { ...baseline, name: 'Renamed workflow', version: 4 },
      actor: 'Admin User',
      reason: 'Clarify naming',
      changedAt: '2026-07-25T10:00:00.000Z',
    });

    expect(diff.actor).toBe('Admin User');
    expect(diff.reason).toBe('Clarify naming');
    expect(diff.changedAt).toBe('2026-07-25T10:00:00.000Z');
  });
});
