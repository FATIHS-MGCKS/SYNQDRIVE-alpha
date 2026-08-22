import { DashboardUtilizationService } from './dashboard-utilization.service';
import type { E4UtilizationFacts } from '@modules/evaluations-analytics/e4/evaluations-insights.repository';

describe('DashboardUtilizationService', () => {
  const organizationId = 'org-1';
  const facts: E4UtilizationFacts = {
    vehicleCount: 1,
    telemetryOfflineVehicles: 0,
    vehicles: [
      {
        vehicleId: 'v1',
        eligibility: {
          startMs: Date.UTC(2026, 6, 1),
          endExclusiveMs: Date.UTC(2026, 8, 1),
        },
        rented: [
          {
            startMs: Date.UTC(2026, 7, 1),
            endExclusiveMs: Date.UTC(2026, 7, 16),
          },
        ],
        maintenance: [],
        blocked: [],
      },
    ],
  };

  function createService(overrides?: {
    facts?: E4UtilizationFacts;
    bookings?: Array<{ id: string; status: string; notes: string | null }>;
    vehicleStations?: Array<{
      id: string;
      homeStationId: string | null;
      currentStationId: string | null;
    }>;
  }) {
    const evaluationsRepo = {
      loadUtilizationFacts: jest.fn().mockResolvedValue(overrides?.facts ?? facts),
    };
    const prisma = {
      vehicle: {
        findMany: jest.fn().mockResolvedValue(
          overrides?.vehicleStations ?? [
            { id: 'v1', homeStationId: 'st-1', currentStationId: null },
          ],
        ),
      },
      booking: {
        findMany: jest.fn().mockResolvedValue(overrides?.bookings ?? []),
      },
    };
    return {
      service: new DashboardUtilizationService(prisma as never, evaluationsRepo as never),
      prisma,
      evaluationsRepo,
    };
  }

  it('returns month metrics and daily breakdown', async () => {
    const { service, prisma } = createService({
      bookings: [
        { id: 'b1', status: 'CONFIRMED', notes: null },
        { id: 'b2', status: 'ACTIVE', notes: null },
      ],
    });

    const result = await service.getOverview(organizationId, 2026, 8);

    expect(result.year).toBe(2026);
    expect(result.month).toBe(8);
    expect(result.days).toHaveLength(31);
    expect(result.monthMetrics.bookingCount).toBe(2);
    expect(result.days[0]?.date).toBe('2026-08-01');
    expect(prisma.booking.findMany).toHaveBeenCalled();
  });

  it('excludes cancelled bookings and wizard drafts from count', async () => {
    const { service } = createService({
      bookings: [
        { id: 'b1', status: 'CANCELLED', notes: null },
        { id: 'b2', status: 'PENDING', notes: '[synq:wizard-draft]' },
        { id: 'b3', status: 'CONFIRMED', notes: null },
      ],
    });

    const result = await service.getOverview(organizationId, 2026, 8);
    expect(result.monthMetrics.bookingCount).toBe(1);
  });

  it('returns UNAVAILABLE when no vehicles match station scope', async () => {
    const { service } = createService({
      vehicleStations: [{ id: 'v1', homeStationId: 'st-other', currentStationId: null }],
    });

    const result = await service.getOverview(organizationId, 2026, 8, 'st-1');
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.monthMetrics.utilizationPercent).toBeNull();
  });

  it('avoids division by zero for booking delta', async () => {
    const { service } = createService({ bookings: [] });
    const result = await service.getOverview(organizationId, 2026, 8);
    expect(result.monthMetrics.bookingDeltaPercent).toBeNull();
  });
});
