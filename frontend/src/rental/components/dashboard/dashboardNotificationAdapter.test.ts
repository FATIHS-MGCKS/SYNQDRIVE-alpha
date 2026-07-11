import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildDashboardNotificationsFromInsights } from './dashboardNotificationAdapter';
import { drivingAssessmentInsight, NOTIFICATION_TEST_INSIGHTS_GENERATED_AT, NOTIFICATION_TEST_NOW_MS } from './notificationEngine.fixtures';

describe('dashboardNotificationAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOTIFICATION_TEST_NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps DEGRADED insight to alert with unread true', () => {
    const [row] = buildDashboardNotificationsFromInsights(
      [drivingAssessmentInsight('DEGRADED')],
      { generatedAt: NOTIFICATION_TEST_INSIGHTS_GENERATED_AT, intlLocale: 'de-DE' },
    );
    expect(row.type).toBe('alert');
    expect(row.unread).toBe(true);
    expect(row.title).toContain('eingeschränkt');
  });

  it('maps RECOVERING insight to alert with unread false', () => {
    const [row] = buildDashboardNotificationsFromInsights(
      [drivingAssessmentInsight('RECOVERING')],
      { generatedAt: NOTIFICATION_TEST_INSIGHTS_GENERATED_AT, intlLocale: 'de-DE' },
    );
    expect(row.type).toBe('alert');
    expect(row.unread).toBe(false);
    expect(row.title).toContain('normalisiert');
  });

  it('uses generatedAt for time label, not insight.createdAt', () => {
    const [row] = buildDashboardNotificationsFromInsights(
      [drivingAssessmentInsight('DEGRADED', { createdAt: '2026-01-01T00:00:00.000Z' })],
      { generatedAt: NOTIFICATION_TEST_INSIGHTS_GENERATED_AT, intlLocale: 'de-DE' },
    );
    expect(row.time).toBe(
      new Date(NOTIFICATION_TEST_INSIGHTS_GENERATED_AT).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  });
});
