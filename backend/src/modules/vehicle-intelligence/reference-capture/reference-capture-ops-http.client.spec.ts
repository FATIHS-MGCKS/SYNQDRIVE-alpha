import axios from 'axios';
import { ReferenceCaptureOpsHttpClient } from '../../../../scripts/ops/reference-capture-ops-http.client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ReferenceCaptureOpsHttpClient deadline-aware requests', () => {
  let mockRequest: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockRequest = jest.fn();
    mockedAxios.create.mockReturnValue({
      request: mockRequest,
    } as never);
    mockedAxios.isAxiosError.mockImplementation((error: unknown) => {
      return typeof error === 'object' && error !== null && 'isAxiosError' in error;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function makeClient() {
    return new ReferenceCaptureOpsHttpClient({
      baseUrl: 'https://app.synqdrive.eu/api/v1',
      bearerToken: 'token',
      defaultTimeoutMs: 30_000,
    });
  }

  it('does not issue request when GO budget already exhausted', async () => {
    const client = makeClient();
    const result = await client.getSession('org', 'veh', 'sess', {
      goDeadlineAtMs: 1_000,
      nowMs: 2_000,
    });
    expect(result.budgetExhausted).toBe(true);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('per-request timeout is capped to remaining GO budget', async () => {
    const client = makeClient();
    mockRequest.mockResolvedValue({ status: 200, data: { id: 'sess' } });

    await client.startRecording('org', 'veh', 'sess', {
      goDeadlineAtMs: 10_000,
      nowMs: 9_500,
    });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 500,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('aborts hanging request via AbortSignal when timeout elapses', async () => {
    const client = makeClient();
    mockRequest.mockImplementation((config: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        const err = new Error('canceled') as Error & { isAxiosError: boolean; code: string; name: string };
        err.isAxiosError = true;
        err.code = 'ECONNABORTED';
        err.name = 'CanceledError';
        config.signal?.addEventListener('abort', () => reject(err));
      });
    });

    const promise = client.startRecording('org', 'veh', 'sess', {
      timeoutMs: 200,
    });

    await jest.advanceTimersByTimeAsync(250);
    const result = await promise;

    expect(result.timedOut).toBe(true);
    expect(result.status).toBe(0);
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 200,
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
