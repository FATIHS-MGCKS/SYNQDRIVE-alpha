import { ReferenceCaptureSettlementShadowService } from './reference-capture-settlement-shadow.service';

describe('ReferenceCaptureSettlementShadowService provider ERROR observations', () => {
  it('PROVIDER_ERROR_OBSERVATION_PERSISTED and idempotent', async () => {
    const observations: unknown[] = [];
    let persisted = false;
    const schedule = {
      id: 'sched-err',
      experimentId: 'exp-db-1',
      sessionId: 'sess-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tokenId: 187361,
      probeId: 'SP-60-A',
      probeType: 'FIXED_INTERVAL',
      phase: '60s',
      sourceIntervalStart: new Date('2026-09-10T10:00:00.000Z'),
      sourceIntervalEnd: new Date('2026-09-10T10:01:00.000Z'),
      queryFrom: new Date('2026-09-10T10:00:00.000Z'),
      queryTo: new Date('2026-09-10T10:01:00.000Z'),
      aggregationInterval: '1s',
      scheduledAgeMs: 30_000,
      scheduledAt: new Date('2026-09-10T10:01:30.000Z'),
      status: 'EXECUTING',
      observation: null,
    };

    const repository = {
      findScheduleById: jest.fn().mockResolvedValue(schedule),
      findExperimentStatusById: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      markExecutingIfEligible: jest.fn().mockResolvedValue(true),
      markSkipped: jest.fn(),
      createObservationIfEligible: jest.fn(async (input: { providerRequestStatus: string }) => {
        if (persisted) return false;
        persisted = true;
        observations.push(input);
        return true;
      }),
    };

    const service = new ReferenceCaptureSettlementShadowService(
      { isSettlementShadowEnabled: () => true } as never,
      repository as never,
      {} as never,
      {
        queryGraphQLWithIngressTiming: jest.fn().mockRejectedValue(new Error('dimo_unavailable')),
      } as never,
      { getVehicleJwt: jest.fn().mockResolvedValue('jwt') } as never,
      { referenceCaptureSettlementShadowObservation: { findMany: jest.fn().mockResolvedValue([]) } } as never,
    );

    await service.executeScheduledObservation('sched-err');
    await service.executeScheduledObservation('sched-err');

    expect(observations).toHaveLength(1);
    expect((observations[0] as { providerRequestStatus: string }).providerRequestStatus).toBe('ERROR');
    expect(repository.createObservationIfEligible).toHaveBeenCalledTimes(2);
  });
});
