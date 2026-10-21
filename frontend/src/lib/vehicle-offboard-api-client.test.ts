// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { VehicleOffboardRequestError } from './vehicle-offboard-api-error';

vi.mock('./auth', () => ({
  getToken: () => 'test-token',
  clearAuth: vi.fn(),
}));

vi.mock('./mfa', () => ({
  getStepUpToken: () => null,
}));

describe('api.vehicleOnboarding.offboardVehicle (fetch boundary)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function loadApi() {
    const mod = await import('./api');
    return mod.api;
  }

  const body = {
    reason: 'REMOVE_FROM_PRODUCT' as const,
    idempotencyKey: 'vehicle-offboard:client-test',
    note: 'n1',
  };

  it('fetch reject → status=0 → TRANSPORT_UNCERTAIN at client', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const api = await loadApi();
    await expect(api.vehicleOnboarding.offboardVehicle('org-1', 'veh-1', body)).rejects.toMatchObject({
      kind: 'TRANSPORT_UNCERTAIN',
      status: 0,
    });
  });

  it('lost response replay with same key', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            vehicleId: 'veh-1',
            organizationId: 'org-1',
            registryLifecycle: 'OFFBOARDED',
            offboardedAt: '2026-01-01T00:00:00.000Z',
            reason: 'REMOVE_FROM_PRODUCT',
            idempotentReplay: true,
            warnings: [],
          }),
      });

    const api = await loadApi();
    await expect(api.vehicleOnboarding.offboardVehicle('org-1', 'veh-1', body)).rejects.toMatchObject({
      kind: 'TRANSPORT_UNCERTAIN',
    });
    const replay = await api.vehicleOnboarding.offboardVehicle('org-1', 'veh-1', body);
    expect(replay.idempotentReplay).toBe(true);
    expect(fetchMock.mock.calls[1][0]).toContain('/offboard');
    const sentBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(sentBody.idempotencyKey).toBe('vehicle-offboard:client-test');
  });

  it('HTTP 403 STEP_UP_REQUIRED', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ code: 'STEP_UP_REQUIRED', message: 'MFA required' }),
    });
    const api = await loadApi();
    await expect(api.vehicleOnboarding.offboardVehicle('org-1', 'veh-1', body)).rejects.toMatchObject({
      kind: 'STEP_UP_REQUIRED',
      status: 403,
    });
  });
});
