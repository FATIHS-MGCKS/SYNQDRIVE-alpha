import { DrivingImpactReconciliationService } from './driving-impact-reconciliation.service';

describe('DrivingImpactReconciliationService', () => {
  function makePrisma(overrides: {
    impacts?: Array<{
      tripId: string;
      vehicleId: string;
      modelVersion: string;
      updatedAt: Date;
      sourceSummaryJson?: Record<string, unknown>;
    }>;
    tripsById?: Record<
      string,
      {
        id: string;
        vehicleId: string;
        drivingImpactStatus: string | null;
        drivingImpactComputedAt: Date | null;
        analysisStagesJson?: Record<string, string>;
      }
    >;
    readyTrips?: Array<{
      id: string;
      vehicleId: string;
      drivingImpactStatus: string;
      drivingImpactComputedAt: Date | null;
      analysisStagesJson?: Record<string, string>;
    }>;
    impactExists?: Record<string, boolean>;
  }) {
    const impacts = overrides.impacts ?? [];
    const tripsById = overrides.tripsById ?? {};
    const readyTrips = overrides.readyTrips ?? [];
    const impactExists = overrides.impactExists ?? {};

    return {
      tripDrivingImpact: {
        findMany: jest.fn().mockResolvedValue(impacts),
        findUnique: jest.fn(async ({ where }: { where: { tripId: string } }) =>
          impactExists[where.tripId] ? { id: 'impact-1' } : null,
        ),
      },
      vehicleTrip: {
        findMany: jest.fn(async (args: { where?: { id?: { in: string[] }; drivingImpactStatus?: unknown } }) => {
          if (args.where?.id?.in) {
            return args.where.id.in
              .map((id) => tripsById[id])
              .filter(Boolean);
          }
          if (args.where?.drivingImpactStatus) {
            return readyTrips;
          }
          return [];
        }),
      },
    } as any;
  }

  it('detects impact row with PENDING trip status', async () => {
    const prisma = makePrisma({
      impacts: [
        {
          tripId: 'trip-1',
          vehicleId: 'vehicle-1',
          modelVersion: 'v1.1.0',
          updatedAt: new Date('2026-07-16T10:00:00.000Z'),
          sourceSummaryJson: { calculatedAt: '2026-07-16T10:00:00.000Z' },
        },
      ],
      tripsById: {
        'trip-1': {
          id: 'trip-1',
          vehicleId: 'vehicle-1',
          drivingImpactStatus: 'PENDING',
          drivingImpactComputedAt: null,
          analysisStagesJson: { drivingImpact: 'pending' },
        },
      },
    });

    const service = new DrivingImpactReconciliationService(prisma);
    const report = await service.scanInconsistencies();

    expect(report.issueCount).toBe(1);
    expect(report.issues[0]).toMatchObject({
      tripId: 'trip-1',
      issueType: 'impact_row_with_pending_status',
      hasImpactRow: true,
      drivingImpactStatus: 'PENDING',
    });
  });

  it('returns no issue when impact row and READY status are aligned', async () => {
    const prisma = makePrisma({
      impacts: [
        {
          tripId: 'trip-2',
          vehicleId: 'vehicle-1',
          modelVersion: 'v1.1.0',
          updatedAt: new Date('2026-07-16T10:00:00.000Z'),
        },
      ],
      tripsById: {
        'trip-2': {
          id: 'trip-2',
          vehicleId: 'vehicle-1',
          drivingImpactStatus: 'READY',
          drivingImpactComputedAt: new Date('2026-07-16T10:00:00.000Z'),
          analysisStagesJson: { drivingImpact: 'done' },
        },
      },
    });

    const service = new DrivingImpactReconciliationService(prisma);
    const report = await service.scanInconsistencies();

    expect(report.issues.filter((i) => i.tripId === 'trip-2')).toHaveLength(0);
  });
});
