import { TripsService } from './trips.service';
import { TripRouteCanonicalReadService } from './route-artifact/trip-route-canonical-read.service';

jest.mock('../tenant/vehicle-intelligence-tenant.scope', () => ({
  assertVehicleInOrganization: jest.fn().mockResolvedValue(undefined),
  assertTripInOrganization: jest.fn(),
  scopedVehicleTripWhere: jest.fn(),
  buildTripDriverIdentityFilter: jest.fn(),
}));

import {
  assertTripInOrganization,
  assertVehicleInOrganization,
} from '../tenant/vehicle-intelligence-tenant.scope';

describe('TripsService.getRouteForTrip tenant safety', () => {
  const routeCanonicalRead = {
    getCanonicalRouteForTrip: jest.fn(),
  } as unknown as jest.Mocked<TripRouteCanonicalReadService>;

  const service = new TripsService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    routeCanonicalRead,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns UNAVAILABLE without calling canonical read when trip vehicle mismatches', async () => {
    (assertTripInOrganization as jest.Mock).mockResolvedValue({
      vehicleId: 'veh-actual',
    });

    const response = await service.getRouteForTrip('org-1', 'veh-requested', 'trip-1');

    expect(assertVehicleInOrganization).toHaveBeenCalled();
    expect(routeCanonicalRead.getCanonicalRouteForTrip).not.toHaveBeenCalled();
    expect(response.status.processingState).toBe('UNAVAILABLE');
    expect(response.status.failureReason).toBe('TRIP_VEHICLE_MISMATCH');
  });

  it('delegates to canonical read when trip belongs to requested vehicle', async () => {
    (assertTripInOrganization as jest.Mock).mockResolvedValue({
      vehicleId: 'veh-1',
    });
    routeCanonicalRead.getCanonicalRouteForTrip.mockResolvedValue({
      tripId: 'trip-1',
      vehicleId: 'veh-1',
      routeQuality: 'RAW',
      geometry: null,
      source: { provider: null, algorithmVersion: null, processedAt: null },
      quality: { matchConfidence: null, matchCoverage: null },
      counts: { sourcePointCount: 0, filteredPointCount: 0, matchedPointCount: null },
      continuity: { status: 'INSUFFICIENT_DATA', hasUnknownGaps: false, gapCount: 0 },
      status: {
        processingState: 'READY',
        ready: true,
        retryableFailure: false,
        failureReason: null,
      },
      speedPoints: [],
    });

    const response = await service.getRouteForTrip('org-1', 'veh-1', 'trip-1');

    expect(routeCanonicalRead.getCanonicalRouteForTrip).toHaveBeenCalledWith(
      'org-1',
      'veh-1',
      'trip-1',
    );
    expect(response.status.processingState).toBe('READY');
  });
});
