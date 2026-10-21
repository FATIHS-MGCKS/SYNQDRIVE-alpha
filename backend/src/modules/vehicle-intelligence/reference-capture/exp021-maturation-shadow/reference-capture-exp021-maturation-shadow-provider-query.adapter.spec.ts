import { Exp021MaturationShadowProviderOutcomeClass } from '@prisma/client';
import { ReferenceCaptureExp021MaturationShadowProviderQueryAdapter } from './reference-capture-exp021-maturation-shadow-provider-query.adapter';

describe('ReferenceCaptureExp021MaturationShadowProviderQueryAdapter timing', () => {
  const input = {
    tokenId: 1,
    organizationId: 'org',
    vehicleId: 'veh',
    providerFields: ['speed'],
    windowFrom: new Date('2026-09-16T11:59:00.000Z'),
    windowTo: new Date('2026-09-16T12:00:00.000Z'),
    interval: '1s',
  };

  it('uses provider ingress timing for successful GraphQL requests (JWT delay does not bias requestStartedAt)', async () => {
    const authStartedAt = new Date('2026-09-16T12:00:44.000Z');
    const providerStartedAt = new Date('2026-09-16T12:00:45.000Z');
    const providerCompletedAt = new Date('2026-09-16T12:00:45.500Z');
    const windowTo = new Date('2026-09-16T12:00:00.000Z');

    const getVehicleJwt = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('jwt'), 80);
        }),
    );

    const adapter = new ReferenceCaptureExp021MaturationShadowProviderQueryAdapter(
      { getVehicleJwt } as never,
      {
        queryGraphQLWithIngressTiming: jest.fn().mockResolvedValue({
          result: { data: { signals: [] } },
          requestStartedAt: providerStartedAt,
          requestCompletedAt: providerCompletedAt,
          synqReceivedAt: providerCompletedAt,
          timing: {},
        }),
      } as never,
    );

    const result = await adapter.executeHistoricalQuery(input);
    expect(getVehicleJwt).toHaveBeenCalled();
    expect(result.providerRequestPhase).toBe('PROVIDER_HTTP');
    expect(result.requestStartedAt.toISOString()).toBe(providerStartedAt.toISOString());
    expect(result.requestCompletedAt.toISOString()).toBe(providerCompletedAt.toISOString());

    const actualAgeMs = result.requestStartedAt.getTime() - windowTo.getTime();
    const authBiasMs = authStartedAt.getTime() - providerStartedAt.getTime();
    expect(actualAgeMs).toBe(45_000);
    expect(authBiasMs).toBeLessThan(0);
    expect(result.providerOutcomeClass).toBe(
      Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO,
    );
  });
});
