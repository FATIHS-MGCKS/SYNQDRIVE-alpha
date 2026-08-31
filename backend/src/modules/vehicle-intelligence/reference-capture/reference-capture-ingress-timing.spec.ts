import { DimoTelemetryService } from '../../dimo/dimo-telemetry.service';

describe('DimoTelemetryService.queryGraphQLWithIngressTiming (RP-039)', () => {
  it('returns distinct request and receive timestamps', async () => {
    const executor = { execute: jest.fn(({ execute }) => execute()) };
    const gateway = { execute: jest.fn(({ invoke }) => invoke()) };
    const config = { get: jest.fn() };
    const service = new DimoTelemetryService(config as never, executor as never, gateway as never);

    jest.spyOn(service as any, 'queryGraphQL').mockResolvedValue({ data: { ok: true } });

    const result = await service.queryGraphQLWithIngressTiming('jwt', 'query {}', undefined, undefined, 'REFERENCE_CAPTURE');

    expect(result.requestStartedAt).toBeInstanceOf(Date);
    expect(result.requestCompletedAt).toBeInstanceOf(Date);
    expect(result.synqReceivedAt).toBeInstanceOf(Date);
    expect(result.requestCompletedAt.getTime()).toBeGreaterThanOrEqual(
      result.requestStartedAt.getTime(),
    );
    expect(result.synqReceivedAt.getTime()).toBe(result.requestCompletedAt.getTime());
  });
});
