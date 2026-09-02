import axios from 'axios';
import { ReferenceCaptureOpsHttpClient } from '../../../../scripts/ops/reference-capture-ops-http.client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ReferenceCaptureOpsHttpClient deadline-aware requests', () => {
  const mockRequest = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.create.mockReturnValue({
      request: mockRequest,
    } as never);
    mockedAxios.isAxiosError.mockImplementation((error: unknown) => {
      return typeof error === 'object' && error !== null && 'isAxiosError' in error;
    });
  });

  function makeClient() {
    return new ReferenceCaptureOpsHttpClient({
      baseUrl: 'https://app.synqdrive.eu/api/v1',
      bearerToken: 'token',
      defaultTimeoutMs: 30_000,
    });
  }

  it('B — does not issue request when GO budget already exhausted', async () => {
    const client = makeClient();
    const result = await client.getSession('org', 'veh', 'sess', {
      goDeadlineAtMs: 1_000,
      nowMs: 2_000,
    });
    expect(result.budgetExhausted).toBe(true);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('B/C — per-request timeout is capped to remaining GO budget', async () => {
    const client = makeClient();
    mockRequest.mockResolvedValue({ status: 200, data: { id: 'sess' } });

    await client.startRecording('org', 'veh', 'sess', {
      goDeadlineAtMs: 10_000,
      nowMs: 9_500,
    });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 500,
      }),
    );
  });

  it('B — hanging request returns timedOut without exceeding remaining budget', async () => {
    const client = makeClient();
    mockRequest.mockRejectedValue({ isAxiosError: true, code: 'ECONNABORTED', name: 'AxiosError' });

    const result = await client.startRecording('org', 'veh', 'sess', {
      goDeadlineAtMs: 10_000,
      nowMs: 9_000,
    });

    expect(result.timedOut).toBe(true);
    expect(result.status).toBe(0);
  });
});
