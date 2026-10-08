// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook, waitForHook } from '../../test/renderHook';
import { api } from '../../lib/api';
import { VehicleOffboardRequestError } from '../../lib/vehicle-offboard-api-error';
import { useVehicleOffboard } from './useVehicleOffboard';

const intent = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  reason: 'REMOVE_FROM_PRODUCT' as const,
  idempotencyKey: 'vehicle-offboard:key-1',
};

vi.mock('../../lib/api', () => ({
  api: {
    vehicleOnboarding: {
      offboardVehicle: vi.fn(),
    },
  },
}));

describe('useVehicleOffboard (VO5C-P2A.1)', () => {
  beforeEach(() => {
    vi.mocked(api.vehicleOnboarding.offboardVehicle).mockReset();
  });

  it('D/E — STEP_UP_REQUIRED releases HTTP in-flight lock for MFA retry', async () => {
    vi.mocked(api.vehicleOnboarding.offboardVehicle)
      .mockRejectedValueOnce(
        new VehicleOffboardRequestError('step up', {
          kind: 'STEP_UP_REQUIRED',
          code: 'STEP_UP_REQUIRED',
          status: 403,
        }),
      )
      .mockResolvedValueOnce({
        vehicleId: 'veh-1',
        organizationId: 'org-1',
        registryLifecycle: 'OFFBOARDED',
        offboardedAt: '2026-01-01T00:00:00.000Z',
        reason: 'REMOVE_FROM_PRODUCT',
        idempotentReplay: false,
        warnings: [],
      });

    const { result, unmount } = renderHook(() => useVehicleOffboard());
    await act(async () => {
      await expect(result.current.execute(intent)).rejects.toMatchObject({ kind: 'STEP_UP_REQUIRED' });
    });
    await waitForHook(() => result.current.state.phase === 'mfa_required');

    const replay = await act(async () => result.current.retryAfterMfa());
    expect(replay?.vehicleId).toBe('veh-1');
    expect(vi.mocked(api.vehicleOnboarding.offboardVehicle)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.vehicleOnboarding.offboardVehicle).mock.calls[1][2]).toMatchObject({
      idempotencyKey: 'vehicle-offboard:key-1',
    });
    unmount();
  });

  it('L — double execute while HTTP in flight is rejected', async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(api.vehicleOnboarding.offboardVehicle).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );

    const { result, unmount } = renderHook(() => useVehicleOffboard());
    let first!: Promise<unknown>;
    act(() => {
      first = result.current.execute(intent);
    });
    await waitForHook(() => result.current.state.phase === 'submitting');
    await act(async () => {
      await expect(result.current.execute(intent)).rejects.toMatchObject({ code: 'OFFBOARD_HTTP_IN_FLIGHT' });
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
      await first;
    });
    unmount();
  });

  it('I/J — transport failure → uncertain then retry with same key', async () => {
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
      await expect(result.current.execute(intent)).rejects.toMatchObject({ kind: 'TRANSPORT_UNCERTAIN' });
    });
    await waitForHook(() => result.current.state.phase === 'uncertain');

    const replay = await act(async () => result.current.retryUncertain());
    expect(replay?.idempotentReplay).toBe(true);
    expect(vi.mocked(api.vehicleOnboarding.offboardVehicle).mock.calls[1][2]?.idempotencyKey).toBe(
      'vehicle-offboard:key-1',
    );
    unmount();
  });

  it('H — MFA enrollment required clears pending intent', async () => {
    vi.mocked(api.vehicleOnboarding.offboardVehicle).mockRejectedValue(
      new VehicleOffboardRequestError('enroll', {
        kind: 'MFA_ENROLLMENT_REQUIRED',
        code: 'MFA_ENROLLMENT_REQUIRED',
        status: 403,
      }),
    );

    const { result, unmount } = renderHook(() => useVehicleOffboard());
    await act(async () => {
      await expect(result.current.execute(intent)).rejects.toMatchObject({
        kind: 'MFA_ENROLLMENT_REQUIRED',
      });
    });
    await waitForHook(() => result.current.state.phase === 'idle');
    unmount();
  });
});
