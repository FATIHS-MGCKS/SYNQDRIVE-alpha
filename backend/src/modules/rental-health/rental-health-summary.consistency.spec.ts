import { RentalHealthSummaryService } from './rental-health-summary.service';
import { RentalHealthService } from './rental-health.service';
import { stripFleetReadModelMeta } from './rental-health-summary.projection';
import type { VehicleHealth } from './rental-health.types';

/**
 * Consistency contract: fleet summary rows are projections of the same
 * canonical VehicleHealth the detail endpoint returns — no second evaluator.
 */
describe('Rental health detail vs fleet summary consistency', () => {
  const canonical: VehicleHealth = {
    vehicle_id: 'veh-consistency',
    organization_id: 'org-consistency',
    overall_state: 'critical',
    rental_blocked: true,
    blocking_reasons: ['Tires critical'],
    modules: {
      battery: {
        state: 'good',
        reason: 'OK',
        last_updated_at: '2026-07-01T00:00:00.000Z',
        data_stale: false,
      },
      tires: {
        state: 'critical',
        reason: 'Wear critical',
        last_updated_at: '2026-07-01T00:00:00.000Z',
        data_stale: false,
      },
      brakes: {
        state: 'good',
        reason: 'OK',
        last_updated_at: '2026-07-01T00:00:00.000Z',
        data_stale: false,
      },
      error_codes: {
        state: 'good',
        reason: 'OK',
        last_updated_at: '2026-07-01T00:00:00.000Z',
        data_stale: false,
      },
      service_compliance: {
        state: 'warning',
        reason: 'TÜV soon',
        last_updated_at: '2026-07-01T00:00:00.000Z',
        data_stale: false,
      },
      complaints: {
        state: 'n_a',
        reason: 'None',
        last_updated_at: null,
        data_stale: false,
      },
      vehicle_alerts: {
        state: 'unknown',
        reason: 'No HM link',
        last_updated_at: null,
        data_stale: true,
      },
    },
    generated_at: '2026-07-01T00:00:00.000Z',
  };

  it('fleet summary strip matches detail getVehicleHealth on cache miss', async () => {
    const rentalHealth = { getVehicleHealth: jest.fn().mockResolvedValue(canonical) };
    const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    const summarySvc = new RentalHealthSummaryService(rentalHealth as any, cache as any);

    const detailSvc = rentalHealth as unknown as RentalHealthService;

    const [detail, summaryRow] = await Promise.all([
      detailSvc.getVehicleHealth('org-consistency', 'veh-consistency'),
      summarySvc.getFleetRow('org-consistency', 'veh-consistency'),
    ]);

    expect(stripFleetReadModelMeta(summaryRow)).toEqual(detail);
    expect(summaryRow.overall_state).toBe(detail.overall_state);
    expect(summaryRow.rental_blocked).toBe(detail.rental_blocked);
    expect(summaryRow.blocking_reasons).toEqual(detail.blocking_reasons);
  });
});
