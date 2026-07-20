// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../test/renderHook';
import { useFleetHealthMap } from './useVehicleHealth';
import { countFleetRentalHealthPages } from '../../lib/fleet-rental-health-pagination';

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

describe('useFleetHealthMap scale coverage', () => {
  beforeEach(() => {
    getFleetScoped.mockReset();
    getFleet.mockReset();
  });

  it.each([100, 500, 1000, 5000] as const)(
    'materializes health map for %i vehicles (client aggregates paginated API)',
    async (total) => {
      getFleetScoped.mockResolvedValue({
        vehicles: Array.from({ length: total }, (_, i) => health(`veh-${i}`)),
        summary: null,
      });

      const { result, unmount } = renderHook(() => useFleetHealthMap('org-scale'));
      await waitForHook(() => result.current.loading === false);

      expect(getFleetScoped).toHaveBeenCalledTimes(1);
      expect(result.current.map.size).toBe(total);
      const serializedBytes = JSON.stringify([...result.current.map.values()]).length;
      expect(serializedBytes).toBeLessThan(total * 2_500);
      unmount();
    },
    10_000,
  );

  it('documents expected upstream page count for full-fleet client fetch', () => {
    expect(countFleetRentalHealthPages(100)).toBe(2);
    expect(countFleetRentalHealthPages(500)).toBe(10);
    expect(countFleetRentalHealthPages(1000)).toBe(20);
    expect(countFleetRentalHealthPages(5000)).toBe(100);
  });
});
