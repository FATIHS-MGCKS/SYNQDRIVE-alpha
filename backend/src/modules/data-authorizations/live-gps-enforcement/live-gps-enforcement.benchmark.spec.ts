import { LiveGpsEnforcementService } from './live-gps-enforcement.service';
import {
  LIVE_GPS_PURPOSE,
  LIVE_GPS_SERVICE_IDENTITY,
} from './live-gps-enforcement.constants';

describe('live-gps enforcement benchmark', () => {
  it('batch fleet-map gate for 100 vehicles completes within budget', async () => {
    const prisma = { vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'v' }) } };
    const enforcement = { assertDataAuthorization: jest.fn().mockResolvedValue({}) };
    const service = new LiveGpsEnforcementService(
      prisma as never,
      { del: jest.fn() } as never,
      { ensureDimoTelemetryAuthorization: jest.fn() } as never,
      enforcement as never,
      { invalidateOrganizationCache: jest.fn() } as never,
    );

    const vehicles = Array.from({ length: 100 }, (_, i) => ({
      id: `veh-${i}`,
      latitude: 52.5,
      longitude: 13.4,
    }));

    const started = performance.now();
    const gated = await service.applyFleetMapGate('org-perf', vehicles, 'bench');
    const elapsedMs = performance.now() - started;

    expect(gated).toHaveLength(100);
    expect(elapsedMs).toBeLessThan(5_000);
    expect(enforcement.assertDataAuthorization).toHaveBeenCalled();
  });

  it('documents per-vehicle decision call count for fleet surfaces', async () => {
    const prisma = { vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'v' }) } };
    const enforcement = { assertDataAuthorization: jest.fn().mockResolvedValue({}) };
    const service = new LiveGpsEnforcementService(
      prisma as never,
      { del: jest.fn() } as never,
      { ensureDimoTelemetryAuthorization: jest.fn() } as never,
      enforcement as never,
      { invalidateOrganizationCache: jest.fn() } as never,
    );

    jest.spyOn(service, 'isVehicleGpsReadAllowed').mockResolvedValue(true);

    await service.filterAuthorizedVehicleIds(
      'org-1',
      ['a', 'b', 'c'],
      LIVE_GPS_PURPOSE.LIVE_MAP,
      LIVE_GPS_SERVICE_IDENTITY.FLEET_MAP_API,
      'bench-filter',
    );

    expect(service.isVehicleGpsReadAllowed).toHaveBeenCalledTimes(3);
  });
});
