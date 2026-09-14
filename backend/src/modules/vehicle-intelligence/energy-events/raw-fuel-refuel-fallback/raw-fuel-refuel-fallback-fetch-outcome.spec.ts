import { FuelType } from '@prisma/client';
import { DimoSegmentsService } from '@modules/dimo/dimo-segments.service';
import { RawFuelRefuelFallbackRuntimeService } from './raw-fuel-refuel-fallback-runtime.service';
import {
  linearRiseSamples,
  stablePlateauSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';

describe('RFRF F4-PR2.1 fetch outcome integration', () => {
  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tokenId: 123,
    windowFrom: new Date('2026-09-06T07:00:00.000Z'),
    windowTo: new Date('2026-09-06T12:00:00.000Z'),
    fuelType: FuelType.GASOLINE,
    requestContext: { organizationId: 'org-1', vehicleId: 'veh-1', tokenId: 123 },
  };

  const riseSamples = [
    ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
    ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
    ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
  ];

  function createRuntimeWithDimo(dimoSegments: DimoSegmentsService) {
    return new RawFuelRefuelFallbackRuntimeService(
      dimoSegments,
      { resolveOrCreateCandidate: jest.fn() } as never,
      undefined,
      undefined,
    ).withConfigLoader(() => ({ masterEnabled: true, persistEnabled: false, cutoverAt: null }));
  }

  it('SUCCESS empty telemetry => no_samples (not sample_fetch_failed)', async () => {
    const auth = { getVehicleJwt: jest.fn().mockResolvedValue('jwt') };
    const telemetry = { queryGraphQL: jest.fn().mockResolvedValue({ data: { signals: [] } }) };
    const dimo = new DimoSegmentsService(auth as never, telemetry as never, {} as never);
    const service = createRuntimeWithDimo(dimo);
    const result = await service.scanIfEnabled(baseInput);
    expect(result.skipReason).toBe('no_samples');
    expect(result.fetchErrorClass).toBeUndefined();
  });

  it('PROVIDER_QUERY_FAILED => sample_fetch_failed', async () => {
    const auth = { getVehicleJwt: jest.fn().mockResolvedValue('jwt') };
    const telemetry = { queryGraphQL: jest.fn().mockRejectedValue(new Error('provider down')) };
    const dimo = new DimoSegmentsService(auth as never, telemetry as never, {} as never);
    const service = createRuntimeWithDimo(dimo);
    const result = await service.scanIfEnabled(baseInput);
    expect(result.skipReason).toBe('sample_fetch_failed');
    expect(result.fetchErrorClass).toBe('PROVIDER_QUERY_FAILED');
  });

  it('AUTH_UNAVAILABLE => sample_fetch_failed with AUTH_UNAVAILABLE class', async () => {
    const auth = { getVehicleJwt: jest.fn().mockResolvedValue(null) };
    const telemetry = { queryGraphQL: jest.fn() };
    const dimo = new DimoSegmentsService(auth as never, telemetry as never, {} as never);
    const service = createRuntimeWithDimo(dimo);
    const result = await service.scanIfEnabled(baseInput);
    expect(result.skipReason).toBe('sample_fetch_failed');
    expect(result.fetchErrorClass).toBe('AUTH_UNAVAILABLE');
    expect(telemetry.queryGraphQL).not.toHaveBeenCalled();
  });

  it('SUCCESS with absolute samples => detector emits observation', async () => {
    const auth = { getVehicleJwt: jest.fn().mockResolvedValue('jwt') };
    const telemetry = {
      queryGraphQL: jest.fn().mockResolvedValue({
        data: {
          signals: riseSamples.map((s) => ({
            timestamp: s.timestamp.toISOString(),
            powertrainFuelSystemAbsoluteLevel: s.absoluteLiters,
            powertrainFuelSystemRelativeLevel: s.relativePercent,
          })),
        },
      }),
    };
    const dimo = new DimoSegmentsService(auth as never, telemetry as never, {} as never);
    const service = createRuntimeWithDimo(dimo);
    const result = await service.scanIfEnabled(baseInput);
    expect(result.detectorInvoked).toBe(true);
    expect(result.observationsEmitted).toBe(1);
    expect(result.skipReason).toBeUndefined();
  });
});
