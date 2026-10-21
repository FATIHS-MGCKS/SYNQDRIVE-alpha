import { DimoSegmentsService } from './dimo-segments.service';
import { DimoRechargeSegmentsClient } from './recharge-segments/dimo-recharge-segments.client';

const TOKEN_ID = 187336;
const FROM = new Date('2026-09-06T07:00:00.000Z');
const TO = new Date('2026-09-06T12:00:00.000Z');

describe('DimoSegmentsService.fetchFuelLevelSamplesWithOutcome', () => {
  const auth = { getVehicleJwt: jest.fn() };
  const telemetry = { queryGraphQL: jest.fn() };
  const rechargeClient = {} as DimoRechargeSegmentsClient;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  function createService() {
    return new DimoSegmentsService(
      auth as never,
      telemetry as never,
      rechargeClient,
    );
  }

  it('A — provider success with zero signal rows => SUCCESS []', async () => {
    auth.getVehicleJwt.mockResolvedValue('vehicle-jwt');
    telemetry.queryGraphQL.mockResolvedValue({ data: { signals: [] } });
    const service = createService();

    const outcome = await service.fetchFuelLevelSamplesWithOutcome(TOKEN_ID, FROM, TO);
    expect(outcome).toEqual({ status: 'SUCCESS', samples: [] });
    expect(await service.fetchFuelLevelSamples(TOKEN_ID, FROM, TO)).toEqual([]);
  });

  it('B — provider query failure => ERROR PROVIDER_QUERY_FAILED', async () => {
    auth.getVehicleJwt.mockResolvedValue('vehicle-jwt');
    telemetry.queryGraphQL.mockRejectedValue(new Error('GraphQL transport failed'));
    const service = createService();

    const outcome = await service.fetchFuelLevelSamplesWithOutcome(TOKEN_ID, FROM, TO);
    expect(outcome.status).toBe('ERROR');
    if (outcome.status === 'ERROR') {
      expect(outcome.errorClass).toBe('PROVIDER_QUERY_FAILED');
      expect(outcome.samples).toEqual([]);
    }
    expect(await service.fetchFuelLevelSamples(TOKEN_ID, FROM, TO)).toEqual([]);
  });

  it('C — auth unavailable => ERROR AUTH_UNAVAILABLE (legacy [] preserved)', async () => {
    auth.getVehicleJwt.mockResolvedValue(null);
    const service = createService();

    const outcome = await service.fetchFuelLevelSamplesWithOutcome(TOKEN_ID, FROM, TO);
    expect(outcome).toEqual({
      status: 'ERROR',
      samples: [],
      errorClass: 'AUTH_UNAVAILABLE',
      message: `vehicle JWT unavailable for tokenId=${TOKEN_ID}`,
    });
    expect(await service.fetchFuelLevelSamples(TOKEN_ID, FROM, TO)).toEqual([]);
    expect(telemetry.queryGraphQL).not.toHaveBeenCalled();
  });

  it('D — provider success with valid absolute samples => SUCCESS', async () => {
    auth.getVehicleJwt.mockResolvedValue('vehicle-jwt');
    telemetry.queryGraphQL.mockResolvedValue({
      data: {
        signals: [
          {
            timestamp: '2026-09-06T08:00:00.000Z',
            powertrainFuelSystemAbsoluteLevel: 10,
            powertrainFuelSystemRelativeLevel: null,
          },
          {
            timestamp: '2026-09-06T08:20:00.000Z',
            powertrainFuelSystemAbsoluteLevel: 34,
            powertrainFuelSystemRelativeLevel: null,
          },
        ],
      },
    });
    const service = createService();
    const outcome = await service.fetchFuelLevelSamplesWithOutcome(TOKEN_ID, FROM, TO);
    expect(outcome.status).toBe('SUCCESS');
    if (outcome.status === 'SUCCESS') {
      expect(outcome.samples).toHaveLength(2);
      expect(outcome.samples[0]?.absoluteLiters).toBe(10);
    }
  });

  it('E — provider success with relative-only samples => SUCCESS', async () => {
    auth.getVehicleJwt.mockResolvedValue('vehicle-jwt');
    telemetry.queryGraphQL.mockResolvedValue({
      data: {
        signals: [
          {
            timestamp: '2026-09-06T08:00:00.000Z',
            powertrainFuelSystemAbsoluteLevel: null,
            powertrainFuelSystemRelativeLevel: 20,
          },
          {
            timestamp: '2026-09-06T08:20:00.000Z',
            powertrainFuelSystemAbsoluteLevel: null,
            powertrainFuelSystemRelativeLevel: 45,
          },
        ],
      },
    });
    const service = createService();
    const outcome = await service.fetchFuelLevelSamplesWithOutcome(TOKEN_ID, FROM, TO);
    expect(outcome.status).toBe('SUCCESS');
    if (outcome.status === 'SUCCESS') {
      expect(outcome.samples.every((s) => s.absoluteLiters == null)).toBe(true);
      expect(outcome.samples.every((s) => s.relativePercent != null)).toBe(true);
    }
  });
});
