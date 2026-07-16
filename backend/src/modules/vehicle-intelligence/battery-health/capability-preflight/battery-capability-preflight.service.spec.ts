import { BatteryCapabilityPreflightService } from './battery-capability-preflight.service';
import { BatteryCapabilityPreflightStatus } from './battery-capability-preflight.types';

describe('BatteryCapabilityPreflightService', () => {
  const prisma = {
    vehicle: {
      findFirst: jest.fn(),
    },
  };
  const dimoAuth = {
    getVehicleJwt: jest.fn(),
  };
  const dimoTelemetry = {
    fetchBatteryCapabilityPreflightSnapshot: jest.fn(),
    probeRechargeSegments: jest.fn(),
  };
  const repository = {
    upsertMany: jest.fn(),
  };

  const service = new BatteryCapabilityPreflightService(
    prisma as never,
    dimoAuth as never,
    dimoTelemetry as never,
    repository as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    dimoAuth.getVehicleJwt.mockResolvedValue('vehicle-jwt');
    repository.upsertMany.mockResolvedValue([]);
  });

  it('returns null when vehicle has no DIMO token', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-1',
      organizationId: 'org-1',
      dimoVehicle: null,
    });

    const result = await service.runForVehicle('org-1', 'veh-1');

    expect(result).toBeNull();
    expect(dimoAuth.getVehicleJwt).not.toHaveBeenCalled();
    expect(repository.upsertMany).not.toHaveBeenCalled();
  });

  it('persists Tesla-like capability snapshot', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-tesla',
      organizationId: 'org-1',
      dimoVehicle: { tokenId: 12345 },
    });
    dimoTelemetry.fetchBatteryCapabilityPreflightSnapshot.mockResolvedValue({
      availableSignals: [
        'lowVoltageBatteryCurrentVoltage',
        'powertrainTractionBatteryStateOfChargeCurrent',
      ],
      signalsLatest: {
        lastSeen: '2026-07-16T11:55:00.000Z',
        lowVoltageBatteryCurrentVoltage: {
          value: 12.4,
          timestamp: '2026-07-16T11:54:00.000Z',
          source: 'dimo',
        },
        powertrainTractionBatteryStateOfChargeCurrent: {
          value: 72,
          timestamp: '2026-07-16T11:54:30.000Z',
          source: 'dimo',
        },
      },
      queryError: null,
    });
    dimoTelemetry.probeRechargeSegments.mockResolvedValue({
      segments: [{ start: { timestamp: '2026-07-10T08:00:00.000Z' } }],
      queryError: null,
    });

    const result = await service.runForVehicle('org-1', 'veh-tesla');

    expect(result).not.toBeNull();
    expect(result?.signals).toHaveLength(13);
    expect(
      result?.signals.find((entry) => entry.signalKey === 'hv.soc')?.preflightStatus,
    ).toBe(BatteryCapabilityPreflightStatus.AVAILABLE_WITH_DATA);
    expect(repository.upsertMany).toHaveBeenCalledWith(
      'org-1',
      'veh-tesla',
      expect.any(Date),
      expect.arrayContaining([
        expect.objectContaining({ signalKey: 'hv.soc' }),
        expect.objectContaining({ signalKey: 'dimo.segments.recharge' }),
      ]),
    );
    expect(dimoAuth.getVehicleJwt).toHaveBeenCalledWith(12345);
  });

  it('persists QUERY_ERROR for provider failures without NOT_LISTED', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-err',
      organizationId: 'org-1',
      dimoVehicle: { tokenId: 99 },
    });
    dimoTelemetry.fetchBatteryCapabilityPreflightSnapshot.mockResolvedValue({
      availableSignals: null,
      signalsLatest: null,
      queryError: 'DIMO GraphQL error: upstream timeout',
    });
    dimoTelemetry.probeRechargeSegments.mockResolvedValue({
      segments: [],
      queryError: 'segments forbidden',
    });

    const result = await service.runForVehicle('org-1', 'veh-err');

    expect(result?.queryError).toContain('upstream timeout');
    expect(
      result?.signals.every(
        (entry) =>
          entry.preflightStatus === BatteryCapabilityPreflightStatus.QUERY_ERROR ||
          entry.signalKey === 'dimo.segments.recharge',
      ),
    ).toBe(true);
    expect(
      result?.signals.some(
        (entry) =>
          entry.preflightStatus === BatteryCapabilityPreflightStatus.NOT_LISTED,
      ),
    ).toBe(false);
  });
});
