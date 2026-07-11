import { describe, expect, it } from 'vitest';
import type { ActionQueueItem } from '../dashboardTypes';
import {
  resolveNotificationIssueCopy,
  stripEntityLabelFromTitle,
} from './notification-issue-copy';

function item(overrides: Partial<ActionQueueItem> = {}): ActionQueueItem {
  return {
    id: 'n-1',
    source: 'notifications-v2',
    severity: 'warning',
    category: 'health',
    title: 'Batterie kritisch — KS MX 2024',
    reason: 'Ladespannung unter Schwellwert',
    timeSortMs: 0,
    priority: 50,
    tone: 'warning',
    cta: 'open-vehicle',
    isOverdue: false,
    issueType: 'BATTERY_CRITICAL',
    entityLabel: 'KS MX 2024',
    entityContextParams: { plate: 'KS MX 2024' },
    queue: {
      severity: 'warning',
      lifecycleStatus: 'open',
      readStatus: 'unread',
      domain: 'vehicle-health',
      source: 'runtime',
      legacySource: 'notifications-v2',
      occurredAt: '2026-07-10T18:00:00.000Z',
      firstSeenAt: '2026-07-10T18:00:00.000Z',
      lastSeenAt: '2026-07-10T18:00:00.000Z',
      resolvedAt: null,
      createdAt: '2026-07-10T18:00:00.000Z',
      entityType: 'vehicle',
      entityId: 'veh-1',
      actionType: 'open-vehicle',
      actionTarget: { type: 'open-vehicle', vehicleId: 'veh-1' },
      semanticKey: 'x',
      sortMs: 0,
      issueType: 'battery_critical',
      conditionCode: 'BATTERY_CRITICAL',
    },
    ...overrides,
  };
}

describe('stripEntityLabelFromTitle', () => {
  it('removes trailing plate suffix', () => {
    expect(stripEntityLabelFromTitle('Reifen prüfen — KS FH 660E', 'KS FH 660E')).toBe('Reifen prüfen');
  });
});

describe('resolveNotificationIssueCopy', () => {
  it('uses localized issue headline without plate', () => {
    const copy = resolveNotificationIssueCopy(item(), 'de');
    expect(copy.headline).toBe('Batterie kritisch');
    expect(copy.detail).toBe('Ladespannung unter Schwellwert');
  });

  it('shows DTC code and description for active faults', () => {
    const copy = resolveNotificationIssueCopy(
      item({
        title: 'KS MS 661',
        reason: '',
        issueType: 'ACTIVE_DTC',
        entityContextParams: {
          plate: 'KS MS 661',
          code: 'P0675',
          reason: 'Starter circuit open',
        },
        queue: {
          ...item().queue!,
          conditionCode: 'ACTIVE_DTC',
          issueType: 'active_dtc',
        },
      }),
      'de',
    );
    expect(copy.headline).toBe('Fehlercode P0675');
    expect(copy.detail).toBe('Starter circuit open');
  });

  it('uses body text for low utilization detail', () => {
    const copy = resolveNotificationIssueCopy(
      item({
        title: 'Geringe Auslastung — HMÜ C 215',
        reason: '7+ Tage ohne Buchung · ~0 € entgangen',
        issueType: 'LOW_UTILIZATION',
        category: 'operations',
        queue: { ...item().queue!, domain: 'operations', conditionCode: 'LOW_UTILIZATION' },
      }),
      'de',
    );
    expect(copy.headline).toBe('Geringe Auslastung');
    expect(copy.detail).toContain('7+ Tage');
  });
});
