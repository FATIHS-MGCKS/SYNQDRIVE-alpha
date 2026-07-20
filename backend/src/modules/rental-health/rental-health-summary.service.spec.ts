import { RentalHealthSummaryService } from './rental-health-summary.service';
import type { VehicleHealth } from './rental-health.types';
import { stripFleetReadModelMeta } from './rental-health-summary.projection';

describe('RentalHealthSummaryService', () => {
  const detailHealth: VehicleHealth = {
    vehicle_id: 'veh-1',
    organization_id: 'org-1',
    overall_state: 'warning',
    rental_blocked: true,
    blocking_reasons: ['Brakes'],
    modules: {} as VehicleHealth['modules'],
    generated_at: '2026-07-01T00:00:00.000Z',
  };

  const rentalHealth = { getVehicleHealth: jest.fn() };
  const cache = {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  };

  let svc: RentalHealthSummaryService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new RentalHealthSummaryService(rentalHealth as any, cache as any);
  });

  it('serves fleet row from cache without calling canonical evaluator', async () => {
    cache.get.mockResolvedValue({
      health: detailHealth,
      cached_at: '2026-07-01T00:00:00.000Z',
    });

    const row = await svc.getFleetRow('org-1', 'veh-1');

    expect(rentalHealth.getVehicleHealth).not.toHaveBeenCalled();
    expect(stripFleetReadModelMeta(row)).toEqual(detailHealth);
    expect(row.cached_at).toBe('2026-07-01T00:00:00.000Z');
  });

  it('computes via canonical getVehicleHealth on cache miss and stores result', async () => {
    cache.get.mockResolvedValue(null);
    rentalHealth.getVehicleHealth.mockResolvedValue(detailHealth);

    const row = await svc.getFleetRow('org-1', 'veh-1');

    expect(rentalHealth.getVehicleHealth).toHaveBeenCalledWith('org-1', 'veh-1');
    expect(cache.set).toHaveBeenCalledWith('org-1', 'veh-1', detailHealth);
    expect(stripFleetReadModelMeta(row)).toEqual(detailHealth);
    expect(row.cache_stale).toBe(false);
  });
});
