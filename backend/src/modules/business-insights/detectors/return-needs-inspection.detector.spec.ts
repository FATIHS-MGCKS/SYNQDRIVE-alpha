/**
 * V4.6.95 — Fix 3: ReturnNeedsInspectionDetector risk-level casing
 *
 * `RentalDrivingAnalysis.riskLevel` is written lowercase ('low' | 'medium' |
 * 'high'). The previous detector compared against uppercase 'HIGH', which
 * silently swallowed the most important signal. These tests pin the new
 * lowercase-normalized comparison.
 */

import { ReturnNeedsInspectionDetector } from './return-needs-inspection.detector';
import { DEFAULT_POLICY, DetectorContext } from '../insight.types';

function makeMockPrisma() {
  return {
    booking: { findMany: jest.fn() },
    rentalDrivingAnalysis: { findUnique: jest.fn() },
  } as any;
}

function makeContext(now = new Date('2026-04-25T12:00:00Z')): DetectorContext {
  return {
    organizationId: 'org-1',
    now,
    policy: DEFAULT_POLICY,
  };
}

describe('ReturnNeedsInspectionDetector', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let detector: ReturnNeedsInspectionDetector;

  beforeEach(() => {
    prisma = makeMockPrisma();
    detector = new ReturnNeedsInspectionDetector(prisma);
  });

  it("flags a return when RentalDrivingAnalysis.riskLevel is lowercase 'high'", async () => {
    const ctx = makeContext();
    prisma.booking.findMany.mockResolvedValue([
      {
        id: 'booking-1',
        vehicleId: 'vehicle-1',
        endDate: new Date('2026-04-25T20:00:00Z'),
        startDate: new Date('2026-04-23T08:00:00Z'),
        kmDriven: 100,
        kmIncluded: 500,
      },
    ]);
    prisma.rentalDrivingAnalysis.findUnique.mockResolvedValue({
      riskLevel: 'high',
      abuseDetectionCount: 0,
      drivingScore: 80,
      payload: {},
    });

    const candidates = await detector.detect(ctx);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].reasons.some((r) => r.startsWith('High-risk driving profile'))).toBe(
      true,
    );
    expect(candidates[0].entityIds).toEqual(['vehicle-1']);
  });

  it("does NOT flag a high-risk reason when riskLevel is 'medium'", async () => {
    const ctx = makeContext();
    prisma.booking.findMany.mockResolvedValue([
      {
        id: 'booking-2',
        vehicleId: 'vehicle-2',
        endDate: new Date('2026-04-25T20:00:00Z'),
        startDate: new Date('2026-04-24T08:00:00Z'),
        kmDriven: 100,
        kmIncluded: 500,
      },
    ]);
    prisma.rentalDrivingAnalysis.findUnique.mockResolvedValue({
      riskLevel: 'medium',
      abuseDetectionCount: 0,
      drivingScore: 80,
      payload: {},
    });

    const candidates = await detector.detect(ctx);

    expect(candidates).toEqual([]);
  });

  it("normalizes uppercase 'HIGH' into the same high-risk reason", async () => {
    const ctx = makeContext();
    prisma.booking.findMany.mockResolvedValue([
      {
        id: 'booking-3',
        vehicleId: 'vehicle-3',
        endDate: new Date('2026-04-25T20:00:00Z'),
        startDate: new Date('2026-04-24T08:00:00Z'),
        kmDriven: 100,
        kmIncluded: 500,
      },
    ]);
    prisma.rentalDrivingAnalysis.findUnique.mockResolvedValue({
      riskLevel: 'HIGH',
      abuseDetectionCount: 0,
      drivingScore: 80,
      payload: {},
    });

    const candidates = await detector.detect(ctx);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].reasons.some((r) => r.startsWith('High-risk driving profile'))).toBe(
      true,
    );
  });

  it('skips returns without any reason (no analysis, short rental, no km overage)', async () => {
    const ctx = makeContext();
    prisma.booking.findMany.mockResolvedValue([
      {
        id: 'booking-4',
        vehicleId: 'vehicle-4',
        endDate: new Date('2026-04-25T20:00:00Z'),
        startDate: new Date('2026-04-24T08:00:00Z'),
        kmDriven: 100,
        kmIncluded: 500,
      },
    ]);
    prisma.rentalDrivingAnalysis.findUnique.mockResolvedValue(null);

    const candidates = await detector.detect(ctx);

    expect(candidates).toEqual([]);
  });
});
