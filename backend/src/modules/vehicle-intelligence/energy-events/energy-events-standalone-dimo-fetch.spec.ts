import axios from 'axios';
import { fetchEnergyEventSegmentsStandalone } from '../../../../scripts/ops/energy-events-standalone-dimo-fetch';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('fetchEnergyEventSegmentsStandalone per-mechanism isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DIMO_CLIENT_ID = 'test-client';
    process.env.DIMO_PRIVATE_KEY =
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('isolates REFUEL network timeout while RECHARGE succeeds for BOTH vehicle', async () => {
    mockedAxios.post.mockImplementation(async (url: string, body?: unknown) => {
      if (url.includes('/auth/web3/generate_challenge')) {
        return { data: { state: 's', challenge: 'challenge' } };
      }
      if (url.includes('/auth/web3/submit_challenge')) {
        return { data: { developer_jwt: 'dev-jwt' } };
      }
      if (url.includes('/v1/tokens/exchange')) {
        return { data: { token: 'vehicle-jwt' } };
      }
      if (url.includes('/query')) {
        const query = (body as { query?: string })?.query ?? '';
        if (query.includes('refuel')) {
          throw new Error('ECONNABORTED timeout');
        }
        if (query.includes('recharge')) {
          return {
            status: 200,
            data: {
              data: {
                segments: [
                  {
                    id: 'recharge-1',
                    start: {
                      timestamp: '2026-06-15T10:00:00.000Z',
                      value: { latitude: 1, longitude: 2 },
                    },
                    end: {
                      timestamp: '2026-06-15T12:00:00.000Z',
                      value: { latitude: 1, longitude: 2 },
                    },
                    socStart: { value: 20 },
                    socEnd: { value: 60 },
                  },
                ],
              },
            },
          };
        }
      }
      throw new Error(`unexpected url ${url}`);
    });

    const result = await fetchEnergyEventSegmentsStandalone(
      100005,
      new Date('2026-06-15T00:00:00.000Z'),
      new Date('2026-06-16T00:00:00.000Z'),
      'BOTH',
    );

    const refuel = result.outcomes.find((o) => o.mechanism === 'refuel');
    const recharge = result.outcomes.find((o) => o.mechanism === 'recharge');
    expect(refuel?.status).toBe('FAILED');
    expect(recharge?.status).not.toBe('FAILED');
    expect(result.accounting.mechanismRequests).toBe(2);
    expect(result.accounting.telemetryGraphqlRequests).toBe(2);
    expect(result.segments.some((s) => s.mechanism === 'recharge')).toBe(true);
    expect(result.segments.some((s) => s.mechanism === 'refuel')).toBe(false);
  });
});
