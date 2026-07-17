/**
 * ReturnNeedsInspectionDetector — vehicle stress signals (V4.8.24)
 */

import { ReturnNeedsInspectionDetector } from './return-needs-inspection.detector';
import { DEFAULT_POLICY, DetectorContext } from '../insight.types';

function makeMockPrisma() {
  return {
    booking: { findMany: jest.fn() },
    rentalDrivingAnalysis: { findFirst: jest.fn() },
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

  it("flags a return when riskLevel is 'high_stress'", async () => {
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
    prisma.rentalDrivingAnalysis.findFirst.mockResolvedValue({
      riskLevel: 'high_stress',
      abuseDetectionCount: 0,
      drivingScore: 40,
      payload: {},
    });

    const candidates = await detector.detect(ctx);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].reasons.some((r) => r.includes('vehicle stress'))).toBe(true);
  });

  it('does NOT flag when stress is low and rental is short', async () => {
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
    prisma.rentalDrivingAnalysis.findFirst.mockResolvedValue({
      riskLevel: 'low_stress',
      abuseDetectionCount: 0,
      drivingScore: 20,
      payload: {},
    });

    const candidates = await detector.detect(ctx);
    expect(candidates).toEqual([]);
  });

  it('flags critical vehicle stress from drivingScore >= 76', async () => {
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
    prisma.rentalDrivingAnalysis.findFirst.mockResolvedValue({
      riskLevel: 'moderate_stress',
      abuseDetectionCount: 0,
      drivingScore: 80,
      payload: {},
    });

    const candidates = await detector.detect(ctx);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].reasons.some((r) => r.includes('Critical vehicle stress'))).toBe(true);
  });

  it('skips returns without any reason', async () => {
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
    prisma.rentalDrivingAnalysis.findFirst.mockResolvedValue(null);

    const candidates = await detector.detect(ctx);
    expect(candidates).toEqual([]);
  });
});
