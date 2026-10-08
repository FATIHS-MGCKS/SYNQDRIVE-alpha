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

const intentB = {
  organizationId: 'org-1',
  vehicleId: 'veh-B',
  reason: 'REMOVE_FROM_PRODUCT' as const,
  idempotencyKey: 'vehicle-offboard:key-B',
};

describe('useVehicleOffboard stale generation ownership (VO5C-P2A.3)', () => {
  beforeEach(() => {
    vi.mocked(api.vehicleOnboarding.offboardVehicle).mockReset();
  });

  it('late success from request A does not release in-flight guard while B is pending', async () => {
    let resolveA!: (v: unknown) => void;
    let resolveB!: (v: unknown) => void;
    vi.mocked(api.vehicleOnboarding.offboardVehicle)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveA = r;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveB = r;
          }),
      );

    const intentA = {
      organizationId: 'org-1',
      vehicleId: 'veh-A',
      reason: 'REMOVE_FROM_PRODUCT' as const,
      idempotencyKey: 'vehicle-offboard:key-A',
    };

    const { result, unmount } = renderHook(() => useVehicleOffboard());

    let pendingA!: Promise<unknown>;
    act(() => {
      pendingA = result.current.execute(intentA);
    });
    await waitForHook(() => result.current.state.phase === 'submitting');

    act(() => {
      result.current.abandonPending();
    });

    let pendingB!: Promise<unknown>;
    act(() => {
      pendingB = result.current.execute(intentB);
    });
    await waitForHook(() => result.current.state.phase === 'submitting');
    expect(result.current.state.phase).toBe('submitting');
    if (result.current.state.phase === 'submitting') {
      expect(result.current.state.intent.idempotencyKey).toBe('vehicle-offboard:key-B');
    }

    await act(async () => {
      await expect(result.current.execute(intentB)).rejects.toMatchObject({
        code: 'OFFBOARD_HTTP_IN_FLIGHT',
      });
    });

    resolveA({
      vehicleId: 'veh-A',
      organizationId: 'org-1',
      registryLifecycle: 'OFFBOARDED',
      offboardedAt: '2026-01-01T00:00:00.000Z',
      reason: 'REMOVE_FROM_PRODUCT',
      idempotentReplay: false,
      warnings: [],
    });
    await act(async () => {
      await expect(pendingA).rejects.toMatchObject({ code: 'OFFBOARD_STALE_RESPONSE' });
    });

    expect(result.current.state.phase).toBe('submitting');
    if (result.current.state.phase === 'submitting') {
      expect(result.current.state.intent.idempotencyKey).toBe('vehicle-offboard:key-B');
    }

    resolveB({
      vehicleId: 'veh-B',
      organizationId: 'org-1',
      registryLifecycle: 'OFFBOARDED',
      offboardedAt: '2026-01-01T00:00:00.000Z',
      reason: 'REMOVE_FROM_PRODUCT',
      idempotentReplay: false,
      warnings: [],
    });
    await act(async () => {
      await pendingB;
    });
    expect(result.current.state.phase).toBe('success');
    unmount();
  });

  it('late rejection from request A does not release in-flight guard while B is pending', async () => {
    let rejectA!: (e: unknown) => void;
    let resolveB!: (v: unknown) => void;
    vi.mocked(api.vehicleOnboarding.offboardVehicle)
      .mockImplementationOnce(
        () =>
          new Promise((_r, rej) => {
            rejectA = rej;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveB = r;
          }),
      );

    const intentA = {
      organizationId: 'org-1',
      vehicleId: 'veh-A',
      reason: 'REMOVE_FROM_PRODUCT' as const,
      idempotencyKey: 'vehicle-offboard:key-A',
    };

    const { result, unmount } = renderHook(() => useVehicleOffboard());

    let pendingA!: Promise<unknown>;
    act(() => {
      pendingA = result.current.execute(intentA);
    });
    await waitForHook(() => result.current.state.phase === 'submitting');

    act(() => {
      result.current.abandonPending();
    });

    let pendingB!: Promise<unknown>;
    act(() => {
      pendingB = result.current.execute(intentB);
    });
    await waitForHook(() => result.current.state.phase === 'submitting');

    rejectA(
      new VehicleOffboardRequestError('blocked', {
        kind: 'OPERATIONALLY_BLOCKED',
        code: 'OFFBOARD_OPERATIONALLY_BLOCKED',
        status: 422,
      }),
    );
    await act(async () => {
      await expect(pendingA).rejects.toMatchObject({ code: 'OFFBOARD_STALE_RESPONSE' });
    });

    expect(result.current.state.phase).toBe('submitting');

    await act(async () => {
      await expect(result.current.execute(intentB)).rejects.toMatchObject({
        code: 'OFFBOARD_HTTP_IN_FLIGHT',
      });
    });

    resolveB({
      vehicleId: 'veh-B',
      organizationId: 'org-1',
      registryLifecycle: 'OFFBOARDED',
      offboardedAt: '2026-01-01T00:00:00.000Z',
      reason: 'REMOVE_FROM_PRODUCT',
      idempotentReplay: false,
      warnings: [],
    });
    await act(async () => {
      await pendingB;
    });
    expect(result.current.state.phase).toBe('success');
    unmount();
  });
});
