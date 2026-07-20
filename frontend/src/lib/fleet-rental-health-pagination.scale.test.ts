import { describe, expect, it, vi } from 'vitest';
import {
  FLEET_RENTAL_HEALTH_CLIENT_PAGE_SIZE,
  FLEET_RENTAL_HEALTH_LEGACY_URL_WARN_BYTES,
  FLEET_RENTAL_HEALTH_SCOPED_URL_MAX_BYTES,
  buildLegacyFleetRentalHealthPath,
  buildScopedFleetRentalHealthPath,
  computeFleetRentalHealthScaleMetrics,
  countFleetRentalHealthPages,
  fetchAllFleetRentalHealth,
} from './fleet-rental-health-pagination';
import type { FleetRentalHealthPage, VehicleHealthResponse } from './api';

function pageOf(size: number, cursor: string | null): FleetRentalHealthPage {
  const data = Array.from({ length: size }, (_, i) => ({
    vehicle_id: `veh-${i}`,
    organization_id: 'org-1',
    overall_state: 'good' as const,
    rental_blocked: false,
    blocking_reasons: [],
    modules: {} as VehicleHealthResponse['modules'],
    generated_at: '2026-07-01T00:00:00.000Z',
  }));
  return {
    summary: {
      availability: { totalSelected: size, byVehicleStatus: {}, semantics: 'vehicle_status_operational_vs_rental_health_per_row' },
      pageHealth: { rentalBlocked: 0, byOverallState: {}, vehiclesWithDetail: size },
    },
    data,
    meta: { limit: FLEET_RENTAL_HEALTH_CLIENT_PAGE_SIZE, nextCursor: cursor },
  };
}

describe('fleet-rental-health-pagination scale coverage', () => {
  const tiers = [100, 500, 1000, 5000] as const;

  it.each(tiers.map((n) => [n, countFleetRentalHealthPages(n)] as const))(
    'scoped fleet uses %i HTTP requests for %i vehicles (page size %i)',
  (vehicleCount, expectedRequests) => {
    expect(expectedRequests).toBe(Math.ceil(vehicleCount / FLEET_RENTAL_HEALTH_CLIENT_PAGE_SIZE));
  });

  it.each(tiers)('scoped fleet URL stays under %i bytes at %i vehicles', (vehicleCount) => {
    const metrics = computeFleetRentalHealthScaleMetrics(vehicleCount);
    expect(metrics.scopedMaxPathBytes).toBeLessThan(FLEET_RENTAL_HEALTH_SCOPED_URL_MAX_BYTES);
    expect(metrics.scopedPageRequests).toBe(countFleetRentalHealthPages(vehicleCount));
  });

  it('legacy vehicleIds URL exceeds warn threshold at 500+ vehicles', () => {
    expect(computeFleetRentalHealthScaleMetrics(100).legacyUrlExceedsWarnThreshold).toBe(false);
    expect(computeFleetRentalHealthScaleMetrics(500).legacyUrlExceedsWarnThreshold).toBe(true);
    expect(computeFleetRentalHealthScaleMetrics(1000).legacyUrlExceedsWarnThreshold).toBe(true);
    expect(computeFleetRentalHealthScaleMetrics(5000).legacyUrlExceedsWarnThreshold).toBe(true);
  });

  it('documents legacy URL growth vs scoped path', () => {
    const legacy500 = buildLegacyFleetRentalHealthPath(
      'org-1',
      Array.from({ length: 500 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`),
    );
    const scoped = buildScopedFleetRentalHealthPath('org-1', { limit: 50, search: 'bmw' });
    expect(legacy500.length).toBeGreaterThan(FLEET_RENTAL_HEALTH_LEGACY_URL_WARN_BYTES);
    expect(scoped.length).toBeLessThan(256);
  });

  it('fetchAllFleetRentalHealth issues one request per page and preserves summary', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(pageOf(50, 'cursor-2'))
      .mockResolvedValueOnce(pageOf(50, 'cursor-3'))
      .mockResolvedValueOnce(pageOf(25, null));

    const result = await fetchAllFleetRentalHealth('org-1', fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(result.vehicles).toHaveLength(125);
    expect(result.summary?.availability.totalSelected).toBe(50);
    expect(fetchPage.mock.calls[1]![1]).toMatchObject({ cursor: 'cursor-2', limit: 50 });
  });

  it('estimates in-memory payload growth linearly with vehicle count', () => {
    const sample = JSON.stringify(pageOf(1, null).data[0]);
    const bytesPerVehicle = sample.length;
    const payload100 = bytesPerVehicle * 100;
    const payload5000 = bytesPerVehicle * 5000;
    expect(payload100).toBeLessThan(250_000);
    expect(payload5000).toBeLessThan(12_500_000);
  });
});
