import { describe, expect, it } from 'vitest';
import type { ActionQueueItem } from '../dashboardTypes';
import { buildNotificationCardViewModel } from './notificationCardViewModel';
import {
  filterNotificationPanelItems,
  headerStatusTone,
} from './notificationPanelFilters';
import { mapApiCountsToPrimaryTabCounts } from '../../../lib/notifications/map-api-counts-to-tab-counts';
import { NOTIFICATION_TEST_NOW_MS } from '../notificationEngine.fixtures';

function v2Item(overrides: Partial<ActionQueueItem> = {}): ActionQueueItem {
  return {
    id: 'n-wob',
    source: 'notifications-v2',
    severity: 'warning',
    category: 'health',
    title: 'Fahrbewertung vorübergehend eingeschränkt',
    reason:
      'Die Telemetriequalität reicht aktuell nicht für eine vollständig belastbare Fahrbewertung aus.',
    timeSortMs: NOTIFICATION_TEST_NOW_MS,
    priority: 50,
    tone: 'warning',
    cta: 'open-vehicle',
    isOverdue: false,
    issueType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
    entityContextParams: {
      plate: 'WOB L 7503',
      make: 'Volkswagen',
      model: 'Tiguan',
      year: 2026,
    },
    occurrenceCount: 2,
    availableActions: ['read', 'acknowledge', 'snooze', 'open_entity'],
    queue: {
      severity: 'warning',
      lifecycleStatus: 'open',
      readStatus: 'unread',
      domain: 'driving-analysis',
      source: 'runtime',
      legacySource: 'notifications-v2',
      occurredAt: '2026-07-08T18:02:00.000Z',
      firstSeenAt: '2026-07-08T18:02:00.000Z',
      lastSeenAt: '2026-07-10T18:02:00.000Z',
      resolvedAt: null,
      createdAt: '2026-07-08T18:02:00.000Z',
      entityType: 'vehicle',
      entityId: 'veh-wob',
      actionType: 'open-vehicle',
      actionTarget: { type: 'open-vehicle', vehicleId: 'veh-wob' },
      semanticKey: 'VEHICLE:veh-wob:DRIVING_ANALYSIS:DRIVING_ASSESSMENT_DEVICE_QUALITY',
      sortMs: NOTIFICATION_TEST_NOW_MS,
      issueType: 'driving_assessment_device_quality',
      conditionCode: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
    },
    ...overrides,
  };
}

describe('notification panel filters', () => {
  it('hides snoozed items from active tabs', () => {
    const snoozed = v2Item({
      queue: { ...v2Item().queue!, lifecycleStatus: 'snoozed' },
    });
    const result = filterNotificationPanelItems([snoozed, v2Item()], 'all', null);
    expect(result).toHaveLength(1);
  });

  it('filters critical tab by severity only', () => {
    const critical = v2Item({
      queue: { ...v2Item().queue!, severity: 'critical' },
      severity: 'critical',
    });
    const result = filterNotificationPanelItems([critical, v2Item()], 'critical', null);
    expect(result).toHaveLength(1);
    expect(result[0]?.queue?.severity).toBe('critical');
  });

  it('filters by domain secondary filter', () => {
    const booking = v2Item({
      queue: { ...v2Item().queue!, domain: 'bookings' },
      category: 'booking',
    });
    const result = filterNotificationPanelItems([booking, v2Item()], 'all', 'bookings');
    expect(result).toHaveLength(1);
    expect(result[0]?.queue?.domain).toBe('bookings');
  });
});

describe('notification card view model — WOB L 7503', () => {
  it('builds four-line hierarchy from V2 queue', () => {
    const card = buildNotificationCardViewModel(v2Item(), 'de', NOTIFICATION_TEST_NOW_MS);
    expect(card).not.toBeNull();
    expect(card!.title).toBe('Fahrbewertung vorübergehend eingeschränkt');
    expect(card!.entityLine).toBe('WOB L 7503 · Volkswagen Tiguan 2026');
    expect(card!.description).toContain('Telemetriequalität');
    expect(card!.ctaLabel).toBe('Fahrzeug prüfen');
    expect(card!.domainLabel).toBe('Fahranalyse');
    expect(card!.occurrenceLabel).toContain('2');
  });

  it('resolved state uses success styling semantics', () => {
    const resolved = v2Item({
      title: 'Fahrbewertung wieder zuverlässig',
      reason: 'Die Telemetriequalität hat sich stabilisiert.',
      queue: {
        ...v2Item().queue!,
        severity: 'success',
        lifecycleStatus: 'resolved',
        resolvedAt: '2026-07-10T20:00:00.000Z',
      },
    });
    const card = buildNotificationCardViewModel(resolved, 'de', NOTIFICATION_TEST_NOW_MS);
    expect(card!.severity).toBe('success');
    expect(card!.resolved).toBe(true);
    expect(card!.timeLabel).toContain('behoben');
  });
});

describe('primary tab counts from API', () => {
  it('maps severity counts without estimating from page', () => {
    const counts = mapApiCountsToPrimaryTabCounts({
      totalActive: 8,
      unread: 3,
      critical: 1,
      warning: 4,
      info: 3,
      resolvedRecent: 5,
      byDomain: {},
    });
    expect(counts.all).toBe(8);
    expect(counts.critical).toBe(1);
    expect(counts.warning).toBe(4);
    expect(counts.resolved).toBe(5);
  });
});

describe('header status tone', () => {
  it('prefers critical over warning', () => {
    expect(
      headerStatusTone([], { all: 2, critical: 1, warning: 3, resolved: 0 }),
    ).toBe('critical');
  });
});
