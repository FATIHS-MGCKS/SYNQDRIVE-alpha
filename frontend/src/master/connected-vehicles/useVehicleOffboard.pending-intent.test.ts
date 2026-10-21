// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook, waitForHook } from '../../test/renderHook';
import { api } from '../../lib/api';
import { VehicleOffboardRequestError } from '../../lib/vehicle-offboard-api-error';
import { useVehicleOffboard } from './useVehicleOffboard';

vi.mock('../../lib/api', () => ({
  api: {
    vehicleOnboarding: {
      offboardVehicle: vi.fn(),
    },
  },
}));

const intentV1 = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  reason: 'REMOVE_FROM_PRODUCT' as const,
  idempotencyKey: 'vehicle-offboard:k1',
};

const intentV2 = {
  ...intentV1,
  vehicleId: 'veh-2',
  idempotencyKey: 'vehicle-offboard:k2',
};

describe('useVehicleOffboard pending intent guards', () => {
  beforeEach(() => {
    vi.mocked(api.vehicleOnboarding.offboardVehicle).mockReset();
  });

  it('blocks different vehicle while uncertain', async () => {
    vi.mocked(api.vehicleOnboarding.offboardVehicle).mockRejectedValueOnce(
      new VehicleOffboardRequestError('transport', {
        kind: 'TRANSPORT_UNCERTAIN',
        code: 'TRANSPORT_UNCERTAIN',
        status: 0,
      }),
    );

    const { result, unmount } = renderHook(() => useVehicleOffboard());
    await act(async () => {
      await expect(result.current.execute(intentV1)).rejects.toMatchObject({ kind: 'TRANSPORT_UNCERTAIN' });
    });
    await waitForHook(() => result.current.state.phase === 'uncertain');

    await act(async () => {
      await expect(result.current.execute(intentV2)).rejects.toMatchObject({
        code: 'OFFBOARD_PENDING_INTENT_CONFLICT',
      });
    });
    unmount();
  });

  it('status=0 from API keeps uncertain state and key on retry', async () => {
    vi.mocked(api.vehicleOnboarding.offboardVehicle)
      .mockRejectedValueOnce(
        new VehicleOffboardRequestError('Network error', {
          kind: 'TRANSPORT_UNCERTAIN',
          code: 'TRANSPORT_UNCERTAIN',
          status: 0,
        }),
      )
      .mockResolvedValueOnce({
        vehicleId: 'veh-1',
        organizationId: 'org-1',
        registryLifecycle: 'OFFBOARDED',
        offboardedAt: '2026-01-01T00:00:00.000Z',
        reason: 'REMOVE_FROM_PRODUCT',
        idempotentReplay: true,
        warnings: [],
      });

    const { result, unmount } = renderHook(() => useVehicleOffboard());
    await act(async () => {
      await expect(result.current.execute(intentV1)).rejects.toMatchObject({ kind: 'TRANSPORT_UNCERTAIN' });
    });
    await waitForHook(() => result.current.state.phase === 'uncertain');
    const replay = await act(async () => result.current.retryUncertain());
    expect(replay?.idempotentReplay).toBe(true);
    expect(vi.mocked(api.vehicleOnboarding.offboardVehicle).mock.calls[1][2]?.idempotencyKey).toBe(
      'vehicle-offboard:k1',
    );
    unmount();
  });

  it('late HTTP completion after abandon is ignored', async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(api.vehicleOnboarding.offboardVehicle).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );

    const { result, unmount } = renderHook(() => useVehicleOffboard());
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.execute(intentV1);
    });
    act(() => {
      result.current.abandonPending();
    });
    resolve({
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      registryLifecycle: 'OFFBOARDED',
      offboardedAt: '2026-01-01T00:00:00.000Z',
      reason: 'REMOVE_FROM_PRODUCT',
      idempotentReplay: false,
      warnings: [],
    });
    await act(async () => {
      await expect(pending).rejects.toMatchObject({ code: 'OFFBOARD_STALE_RESPONSE' });
    });
    expect(result.current.state.phase).toBe('idle');
    unmount();
  });

  it('abandon allows new semantic intent', async () => {
    vi.mocked(api.vehicleOnboarding.offboardVehicle).mockResolvedValue({
      vehicleId: 'veh-2',
      organizationId: 'org-1',
      registryLifecycle: 'OFFBOARDED',
      offboardedAt: '2026-01-01T00:00:00.000Z',
      reason: 'REMOVE_FROM_PRODUCT',
      idempotentReplay: false,
      warnings: [],
    });

    const { result, unmount } = renderHook(() => useVehicleOffboard());
    act(() => {
      result.current.abandonPending();
    });
    await act(async () => {
      await result.current.execute(intentV2);
    });
    expect(vi.mocked(api.vehicleOnboarding.offboardVehicle).mock.calls[0][1]).toBe('veh-2');
    unmount();
  });
});
