import { NotificationEventKind } from '@prisma/client';
import { isManualResolutionAllowed } from './notification-manual-resolution.policy';

describe('isManualResolutionAllowed', () => {
  it('allows manual resolve for EVENT kinds', () => {
    expect(
      isManualResolutionAllowed('TRIP_ANALYSIS_COMPLETED', NotificationEventKind.EVENT),
    ).toBe(true);
  });

  it('allows manual resolve for technical observations', () => {
    expect(
      isManualResolutionAllowed('TECHNICAL_OBSERVATION_ACTIVE', NotificationEventKind.STATE),
    ).toBe(true);
  });

  it('blocks manual resolve for auto-cleared telemetry STATE events', () => {
    expect(
      isManualResolutionAllowed('DRIVING_ASSESSMENT_DEVICE_QUALITY', NotificationEventKind.STATE),
    ).toBe(false);
  });

  it('blocks manual resolve for station shortage STATE events', () => {
    expect(
      isManualResolutionAllowed('STATION_SHORTAGE', NotificationEventKind.STATE),
    ).toBe(false);
  });
});
