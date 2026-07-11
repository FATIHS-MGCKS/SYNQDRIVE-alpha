import { describe, expect, it } from 'vitest';
import {
  computeNotificationSortMs,
  formatNotificationTimeLabel,
} from './notificationTimeSemantics';
import type { NotificationQueueModel } from './notificationQueueModel';
import { NOTIFICATION_TEST_NOW_MS } from './notificationEngine.fixtures';

function baseModel(overrides: Partial<NotificationQueueModel> = {}): NotificationQueueModel {
  return {
    severity: 'warning',
    lifecycleStatus: 'open',
    readStatus: 'unread',
    domain: 'vehicle-health',
    source: 'operational-issue',
    legacySource: 'derived-operations',
    occurredAt: '2026-07-08T08:00:00.000Z',
    firstSeenAt: '2026-07-08T08:00:00.000Z',
    lastSeenAt: '2026-07-10T11:32:00.000Z',
    resolvedAt: null,
    createdAt: '2026-07-10T11:32:00.000Z',
    entityType: 'vehicle',
    entityId: 'veh-1',
    actionType: 'open-vehicle',
    actionTarget: { type: 'open-vehicle', vehicleId: 'veh-1' },
    semanticKey: 'vehicle:veh-1:vehicle_health:warning',
    sortMs: 0,
    ...overrides,
  };
}

describe('notificationTimeSemantics', () => {
  it('sorts open items by lastSeenAt', () => {
    const sortMs = computeNotificationSortMs(
      baseModel({
        lifecycleStatus: 'open',
        lastSeenAt: '2026-07-10T11:32:00.000Z',
        occurredAt: '2026-07-08T08:00:00.000Z',
      }),
    );
    expect(sortMs).toBe(Date.parse('2026-07-10T11:32:00.000Z'));
  });

  it('sorts resolved items by resolvedAt', () => {
    const sortMs = computeNotificationSortMs(
      baseModel({
        lifecycleStatus: 'resolved',
        resolvedAt: '2026-07-10T11:45:00.000Z',
        lastSeenAt: '2026-07-10T11:32:00.000Z',
      }),
    );
    expect(sortMs).toBe(Date.parse('2026-07-10T11:45:00.000Z'));
  });

  it('falls back to occurredAt then createdAt', () => {
    expect(
      computeNotificationSortMs(
        baseModel({ lastSeenAt: null, occurredAt: '2026-07-08T08:00:00.000Z' }),
      ),
    ).toBe(Date.parse('2026-07-08T08:00:00.000Z'));

    expect(
      computeNotificationSortMs(
        baseModel({ lastSeenAt: null, occurredAt: null, createdAt: '2026-07-09T10:00:00.000Z' }),
      ),
    ).toBe(Date.parse('2026-07-09T10:00:00.000Z'));
  });

  it('formats resolved time as behoben um HH:MM in German', () => {
    const label = formatNotificationTimeLabel(
      baseModel({
        lifecycleStatus: 'resolved',
        resolvedAt: '2026-07-10T18:02:00.000Z',
      }),
      { locale: 'de', referenceNowMs: NOTIFICATION_TEST_NOW_MS },
    );
    expect(label).toMatch(/^behoben um /);
    expect(label).not.toContain('2026');
  });

  it('formats recent open detection relative to referenceNowMs', () => {
    const label = formatNotificationTimeLabel(
      baseModel({
        lifecycleStatus: 'open',
        lastSeenAt: '2026-07-10T11:38:00.000Z',
      }),
      { locale: 'de', referenceNowMs: NOTIFICATION_TEST_NOW_MS },
    );
    expect(label).toContain('zuletzt erkannt');
    expect(label).toContain('Min.');
  });

  it('formatNotificationTimeLabel is stable for a fixed referenceNowMs', () => {
    const model = baseModel({
      lifecycleStatus: 'open',
      lastSeenAt: '2026-07-10T11:38:00.000Z',
    });
    const label = formatNotificationTimeLabel(model, {
      locale: 'de',
      referenceNowMs: NOTIFICATION_TEST_NOW_MS,
    });
    expect(label).toContain('zuletzt erkannt');
    expect(
      formatNotificationTimeLabel(model, {
        locale: 'de',
        referenceNowMs: NOTIFICATION_TEST_NOW_MS,
      }),
    ).toBe(label);
  });
});
