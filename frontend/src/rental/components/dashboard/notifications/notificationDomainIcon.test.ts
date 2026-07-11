import { describe, expect, it } from 'vitest';
import type { ActionQueueGroupItem, ActionQueueItem } from '../dashboardTypes';
import { notificationDomainIcon, notificationGroupIcon } from './notificationDomainIcon';

function group(
  overrides: Partial<ActionQueueGroupItem> & Pick<ActionQueueGroupItem, 'groupType' | 'children'>,
): ActionQueueGroupItem {
  return {
    kind: 'group',
    id: 'group-test',
    groupKey: 'vehicle:v1',
    severity: 'warning',
    category: 'health',
    title: 'KS MS 661',
    subtitle: '2 Meldungen',
    priority: 50,
    ...overrides,
  };
}

function item(id: string, overrides: Partial<ActionQueueItem> = {}): ActionQueueItem {
  return {
    id,
    semanticKey: id,
    source: 'notifications-v2',
    severity: 'warning',
    category: 'health',
    title: 'Test',
    reason: '',
    entityLabel: 'KS MS 661',
    timeSortMs: 1000,
    priority: 50,
    tone: 'warning',
    cta: 'open-vehicle',
    isOverdue: false,
    ...overrides,
  };
}

describe('notificationGroupIcon', () => {
  it('uses heart for pure vehicle-health groups', () => {
    const g = group({
      groupType: 'vehicle-health',
      children: [
        {
          id: 'c1',
          itemId: 'n1',
          severity: 'warning',
          category: 'health',
          title: 'Reifen',
          timeSortMs: 1,
          priority: 1,
          cta: 'open-vehicle',
          isOverdue: false,
        },
      ],
    });
    const map = new Map([['n1', item('n1', { queue: { domain: 'vehicle-health' } as ActionQueueItem['queue'] })]]);
    expect(notificationGroupIcon(g, map)).toBe('heart');
  });

  it('uses map-pin for station groups', () => {
    const g = group({
      groupType: 'station-ops',
      groupKey: 'station:s1',
      children: [
        {
          id: 'c1',
          itemId: 'n1',
          severity: 'warning',
          category: 'operations',
          title: 'Station ausgelastet',
          timeSortMs: 1,
          priority: 1,
          cta: 'open-station',
          isOverdue: false,
        },
      ],
    });
    expect(notificationGroupIcon(g, new Map())).toBe('map-pin');
  });

  it('uses dominant child domain for mixed vehicle-ops groups', () => {
    const g = group({
      groupType: 'vehicle-ops',
      children: [
        {
          id: 'c1',
          itemId: 'n1',
          severity: 'info',
          category: 'operations',
          title: 'Geringe Auslastung',
          timeSortMs: 1,
          priority: 1,
          cta: 'open-vehicle',
          isOverdue: false,
        },
        {
          id: 'c2',
          itemId: 'n2',
          severity: 'critical',
          category: 'health',
          title: 'Batterie kritisch',
          timeSortMs: 2,
          priority: 2,
          cta: 'open-vehicle',
          isOverdue: false,
        },
      ],
    });
    const map = new Map([
      ['n1', item('n1', { category: 'operations', queue: { domain: 'operations' } as ActionQueueItem['queue'] })],
      ['n2', item('n2', { category: 'health', queue: { domain: 'vehicle-health' } as ActionQueueItem['queue'] })],
    ]);
    expect(notificationGroupIcon(g, map)).toBe('heart');
  });

  it('uses calendar-clock for operations-only vehicle groups', () => {
    const g = group({
      groupType: 'vehicle-ops',
      children: [
        {
          id: 'c1',
          itemId: 'n1',
          severity: 'warning',
          category: 'operations',
          title: 'Geringe Auslastung',
          timeSortMs: 1,
          priority: 1,
          cta: 'open-vehicle',
          isOverdue: false,
        },
      ],
    });
    const map = new Map([
      ['n1', item('n1', { category: 'operations', queue: { domain: 'operations' } as ActionQueueItem['queue'] })],
    ]);
    expect(notificationGroupIcon(g, map)).toBe('calendar-clock');
  });
});

describe('notificationDomainIcon', () => {
  it('maps vehicle-health to heart', () => {
    expect(notificationDomainIcon('vehicle-health')).toBe('heart');
  });

  it('maps operations to calendar-clock', () => {
    expect(notificationDomainIcon('operations')).toBe('calendar-clock');
  });
});
