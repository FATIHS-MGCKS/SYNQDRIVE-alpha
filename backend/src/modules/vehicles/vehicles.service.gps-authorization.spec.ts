import { NotFoundException } from '@nestjs/common';
import { DataAuthorizationDeniedException } from '@modules/data-authorizations/data-authorization.exceptions';
import { VehiclesService } from './vehicles.service';
import { makeGpsPositionAccessStub } from './operational/vehicle-operational-state-v2.test-helpers';

function makeVehiclesService(deps: {
  prisma?: Record<string, unknown>;
  gpsPositionAccess?: ReturnType<typeof makeGpsPositionAccessStub>;
  dimoAuth?: { getVehicleJwt: jest.Mock };
  dimoTelemetry?: { fetchLastSeenLocation: jest.Mock };
}): VehiclesService {
  const stub = (): Record<string, unknown> => ({});
  const gpsPositionAccess = deps.gpsPositionAccess ?? makeGpsPositionAccessStub();
  return new (VehiclesService as unknown as { new (...args: unknown[]): VehiclesService })(
    deps.prisma ?? {},
    stub(),
    deps.dimoAuth ?? { getVehicleJwt: jest.fn() },
    deps.dimoTelemetry ?? { fetchLastSeenLocation: jest.fn() },
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    gpsPositionAccess,
    stub(),
    { projectForVehicles: jest.fn().mockResolvedValue(new Map()) },
    stub(),
    stub(),
    { cacheKey: (orgId: string) => `fleet-map:${orgId}:v1`, invalidate: jest.fn() },
    { record: jest.fn() },
    { record: jest.fn() },
    undefined,
    undefined,
    undefined,
  );
}

describe('VehiclesService GPS authorization (Prompt 15/36)', () => {
  describe('getLiveGps', () => {
    it('returns cached coordinates when provider fetch fails after authorization', async () => {
      const gpsPositionAccess = makeGpsPositionAccessStub();
      const dimoAuth = { getVehicleJwt: jest.fn().mockRejectedValue(new Error('DIMO down')) };
      const prisma = {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'veh-1',
            dimoVehicle: { tokenId: 42 },
            latestState: { latitude: 51.3, longitude: 9.4 },
          }),
        },
      };
      const service = makeVehiclesService({ prisma, gpsPositionAccess, dimoAuth });

      const result = await service.getLiveGps('veh-1', 'org-1');

      expect(gpsPositionAccess.assertVehicleGpsAccess).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', vehicleId: 'veh-1', purpose: 'LIVE_MAP' }),
      );
      expect(result.latitude).toBe(51.3);
      expect(result.longitude).toBe(9.4);
      expect(result.source).toBe('cache');
    });

    it('denies live GPS when data authorization fails', async () => {
      const gpsPositionAccess = makeGpsPositionAccessStub();
      gpsPositionAccess.assertVehicleGpsAccess.mockRejectedValue(
        new DataAuthorizationDeniedException('denied'),
      );
      const prisma = {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'veh-1',
            dimoVehicle: { tokenId: 42 },
            latestState: { latitude: 51.3, longitude: 9.4 },
          }),
        },
      };
      const service = makeVehiclesService({ prisma, gpsPositionAccess });

      await expect(service.getLiveGps('veh-1', 'org-1')).rejects.toBeInstanceOf(
        DataAuthorizationDeniedException,
      );
    });
  });

  describe('getVehicleWithTelemetry', () => {
    it('requires GPS access before returning telemetry coordinates', async () => {
      const gpsPositionAccess = makeGpsPositionAccessStub();
      const prisma = {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'veh-1',
            vin: 'VIN',
            make: 'VW',
            model: 'Golf',
            year: 2024,
            tankCapacityLiters: 50,
            homeStation: { name: 'Berlin' },
            dimoVehicle: null,
            latestState: {
              lastSeenAt: new Date(),
              latitude: 52.5,
              longitude: 13.4,
              speedKmh: null,
              odometerKm: null,
              fuelLevelRelative: null,
              fuelLevelAbsolute: null,
              evSoc: null,
              coolantTempC: null,
              brakePadPercent: null,
              tireHealthPercent: null,
              engineOilPercent: null,
              oilLevelRelative: null,
              lvBatteryVoltage: null,
              engineLoad: null,
              rangeKm: null,
              tractionBatteryTemperatureC: null,
              isIgnitionOn: null,
              rawPayloadJson: null,
            },
          }),
        },
        vehicleTripDetectionState: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const service = makeVehiclesService({ prisma, gpsPositionAccess });

      const result = await service.getVehicleWithTelemetry('veh-1', 'org-1');

      expect(gpsPositionAccess.assertVehicleGpsAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          purpose: 'TECHNICAL_OVERVIEW',
        }),
      );
      expect(result.latitude).toBe(52.5);
      expect(result.longitude).toBe(13.4);
    });

    it('denies telemetry for vehicle outside organization', async () => {
      const gpsPositionAccess = makeGpsPositionAccessStub();
      const prisma = {
        vehicle: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = makeVehiclesService({ prisma, gpsPositionAccess });

      await expect(
        service.getVehicleWithTelemetry('veh-foreign', 'org-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(gpsPositionAccess.assertVehicleGpsAccess).not.toHaveBeenCalled();
    });
  });
});
