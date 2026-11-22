import { OrganizationStatus, TripDetectionState } from '@prisma/client';
import { organizationAllowsRoutineProviderPolling } from './organization-routine-polling.policy';

describe('organizationAllowsRoutineProviderPolling (P6D4)', () => {
  it('allows ACTIVE organizations', () => {
    expect(
      organizationAllowsRoutineProviderPolling({
        organizationStatus: OrganizationStatus.ACTIVE,
        tripDetectionState: TripDetectionState.RESTING,
      }),
    ).toBe(true);
  });

  it('blocks SUSPENDED without in-flight trip detection', () => {
    expect(
      organizationAllowsRoutineProviderPolling({
        organizationStatus: OrganizationStatus.SUSPENDED,
        tripDetectionState: TripDetectionState.RESTING,
      }),
    ).toBe(false);
  });

  it('allows SUSPENDED during in-flight trip detection', () => {
    expect(
      organizationAllowsRoutineProviderPolling({
        organizationStatus: OrganizationStatus.SUSPENDED,
        tripDetectionState: TripDetectionState.ACTIVE_TRIP,
      }),
    ).toBe(true);
  });

  it('blocks ARCHIVED', () => {
    expect(
      organizationAllowsRoutineProviderPolling({
        organizationStatus: OrganizationStatus.ARCHIVED,
        tripDetectionState: TripDetectionState.ACTIVE_TRIP,
      }),
    ).toBe(false);
  });
});