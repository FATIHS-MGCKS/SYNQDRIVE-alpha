import axios from 'axios';
import { DimoTelemetryService } from '../../dimo/dimo-telemetry.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DimoTelemetryService.queryGraphQLWithIngressTiming (RP-039)', () => {
  it('sets synqReceivedAt at Axios HTTP response boundary', async () => {
    const httpResponseReceivedAt = new Date('2026-08-31T10:00:01.250Z');
    let resolvePost: (value: unknown) => void = () => {};
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });

    const postMock = jest.fn().mockImplementation(() => {
      resolvePost({
        data: { data: { ok: true } },
      });
      return postPromise;
    });

    mockedAxios.create.mockReturnValue({ post: postMock } as never);

    const executor = { execute: jest.fn(({ execute }) => execute()) };
    const gateway = { execute: jest.fn(({ invoke }) => invoke()) };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'dimo.telemetryApiUrl') return 'https://telemetry-api.dimo.zone/query';
        if (key === 'dimo.requestTimeoutMs') return 10000;
        return undefined;
      }),
    };

    const service = new DimoTelemetryService(config as never, executor as never, gateway as never);

    const before = Date.now();
    const result = await service.queryGraphQLWithIngressTiming(
      'jwt',
      'query { availableSignals(tokenId: 1) }',
      undefined,
      { tokenId: 1 },
      'REFERENCE_CAPTURE',
    );
    const after = Date.now();

    expect(postMock).toHaveBeenCalled();
    expect(result.timing.httpResponseReceivedAt).toBeInstanceOf(Date);
    expect(result.timing.synqReceivedAt).toEqual(result.timing.httpResponseReceivedAt);
    expect(result.synqReceivedAt).toEqual(result.timing.httpResponseReceivedAt);
    expect(result.timing.processingCompletedAt.getTime()).toBeGreaterThanOrEqual(
      result.timing.httpResponseReceivedAt.getTime(),
    );
    expect(result.requestCompletedAt.getTime()).toBeGreaterThanOrEqual(
      result.timing.httpResponseReceivedAt.getTime(),
    );
    expect(result.timing.httpResponseReceivedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.timing.httpResponseReceivedAt.getTime()).toBeLessThanOrEqual(after + 50);
  });
});
