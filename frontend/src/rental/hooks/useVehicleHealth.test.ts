// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../test/renderHook';
import { useFleetHealthMap } from './useVehicleHealth';

const getFleetScoped = vi.fn();
const getFleet = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    rentalHealth: {
      getFleetScoped: (...args: unknown[]) => getFleetScoped(...args),
      getFleet: (...args: unknown[]) => getFleet(...args),
    },
  },
}));

function health(id: string) {
  return {
    vehicle_id: id,
    organization_id: 'org-1',
    overall_state: 'good' as const,
    rental_blocked: false,
    blocking_reasons: [],
    modules: {
      battery: { state: 'good' as const, reason: '', last_updated_at: null, data_stale: false },
      tires: { state: 'good' as const, reason: '', last_updated_at: null, data_stale: false },
      brakes: { state: 'good' as const, reason: '', last_updated_at: null, data_stale: false },
      error_codes: { state: 'good' as const, reason: '', last_updated_at: null, data_stale: false },
      service_compliance: { state: 'good' as const, reason: '', last_updated_at: null, data_stale: false },
      complaints: { state: 'good' as const, reason: '', last_updated_at: null, data_stale: false },
      vehicle_alerts: { state: 'good' as const, reason: '', last_updated_at: null, data_stale: false },
    },
    generated_at: '2026-07-01T00:00:00.000Z',
  };
}

describe('useFleetHealthMap', () => {
  beforeEach(() => {
    getFleetScoped.mockReset();
    getFleet.mockReset();
  });

  it('loads fleet health via scoped pagination without vehicleIds', async () => {
    getFleetScoped.mockResolvedValueOnce({
      vehicles: [health('v-1'), health('v-2')],
      summary: null,
    });

    const { result, unmount } = renderHook(() => useFleetHealthMap('org-1'));

    await waitForHook(() => result.current.loading === false);
    expect(result.current.map.get('v-1')?.vehicle_id).toBe('v-1');
    expect(getFleetScoped).toHaveBeenCalledWith('org-1', undefined);
    expect(getFleet).not.toHaveBeenCalled();
    unmount();
  });

  it('supports legacy vehicleIds path for compatibility', async () => {
    getFleet.mockResolvedValueOnce({ vehicles: [health('legacy-1')] });

    const { result, unmount } = renderHook(() =>
      useFleetHealthMap('org-1', { legacyVehicleIds: ['legacy-1'] }),
    );

    await waitForHook(() => result.current.loading === false);
    expect(result.current.map.get('legacy-1')).toBeTruthy();
    expect(getFleet).toHaveBeenCalledWith('org-1', ['legacy-1']);
    unmount();
  });

  it('reloads when filters change', async () => {
    getFleetScoped
      .mockResolvedValueOnce({ vehicles: [health('a')], summary: null })
      .mockResolvedValueOnce({ vehicles: [health('b')], summary: null });

    const { result, rerender, unmount } = renderHook(
      ({ stationId }: { stationId?: string }) =>
        useFleetHealthMap('org-1', { filters: stationId ? { stationId } : undefined }),
      { initialProps: { stationId: undefined as string | undefined } },
    );

    await waitForHook(() => result.current.map.has('a'));
    rerender({ stationId: 'station-1' });
    await waitForHook(() => result.current.map.has('b'));
    unmount();
  });
});
