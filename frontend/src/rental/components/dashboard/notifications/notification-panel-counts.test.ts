import { describe, expect, it } from 'vitest';
import type { ActionQueueItem } from '../dashboardTypes';
import { computeNotificationPrimaryTabCounts } from './notification-panel-counts';

function item(overrides: Partial<ActionQueueItem> = {}): ActionQueueItem {
  return {
    id: 'n1',
    source: 'notifications-v2',
    severity: 'warning',
    category: 'operations',
    title: 'Test',
    reason: 'Reason',
    timeSortMs: 1000,
    priority: 10,
    tone: 'watch',
    cta: 'open-rental',
    isOverdue: false,
    queue: {
      severity: 'warning',
      lifecycleStatus: 'open',
      readStatus: 'unread',
      domain: 'operations',
      source: 'runtime',
      legacySource: 'notifications-v2',
      occurredAt: null,
      firstSeenAt: null,
      lastSeenAt: null,
      resolvedAt: null,
      createdAt: null,
      entityType: 'fleet',
      entityId: 'fleet',
      actionType: 'open-rental',
      actionTarget: { type: 'open-rental' },
      semanticKey: 'fleet:test',
      sortMs: 1000,
      issueType: 'test',
      conditionCode: 'TEST',
    },
    ...overrides,
  };
}

describe('computeNotificationPrimaryTabCounts', () => {
  it('counts critical bridge items without queue metadata', () => {
    const derived = item({
      id: 'derived-vehicles-without-tariff',
      source: 'derived-operations',
      severity: 'critical',
      queue: undefined,
    });

    const counts = computeNotificationPrimaryTabCounts([derived, item()]);
    expect(counts.critical).toBe(1);
    expect(counts.all).toBe(2);
  });
});
