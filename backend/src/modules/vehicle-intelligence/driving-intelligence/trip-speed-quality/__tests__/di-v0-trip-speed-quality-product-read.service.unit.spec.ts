import { randomUUID } from 'crypto';
import type { PrismaService } from '@shared/database/prisma.service';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../../speed-qc/di-v0-speed-qc-policy.version';
import { DiV0TripSpeedQualityProductReadService } from '../di-v0-trip-speed-quality-product-read.service';
import type { DiV0TripSpeedQualityProjectionService } from '../di-v0-trip-speed-quality-projection.service';
import type { DiV0TripSpeedQualityPersistedRow } from '../di-v0-trip-speed-quality-projection.repository';

describe('DiV0TripSpeedQualityProductReadService', () => {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const tripId = randomUUID();
  const workItemId = randomUUID();

  let prisma: PrismaService;
  let projectionService: jest.Mocked<Pick<DiV0TripSpeedQualityProjectionService, 'readCurrentOpsProjection'>>;
  let svc: DiV0TripSpeedQualityProductReadService;

  beforeEach(() => {
    projectionService = {
      readCurrentOpsProjection: jest.fn(),
    };
    prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue({ id: tripId }),
      },
      $queryRaw: jest.fn(),
    } as unknown as PrismaService;
    svc = new DiV0TripSpeedQualityProductReadService(
      prisma,
      projectionService as unknown as DiV0TripSpeedQualityProjectionService,
    );
  });

  it('returns READY when V2 CURRENT projection exists', async () => {
    projectionService.readCurrentOpsProjection.mockResolvedValue({
      id: randomUUID(),
      projection: {
        identity: {
          organizationId,
          vehicleId,
          tripId,
          workItemId,
          shadowRunId: randomUUID(),
          pinnedSnapshotHash: 'hash',
          boundaryFingerprint: 'fp',
          qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
          projectionVersion: 'DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1',
        },
        assessability: { level: 'FULL', reasons: [], assessabilityCriteriaVersion: 'v1', provisionalCalibration: true, customerClaimAuthorized: false },
        quality: {
          totalIntervalCount: 10,
          numericSpeedCount: 10,
          trustedNumericCount: 8,
          trustedLimitedCount: 1,
          trustedLimitedStationaryCount: 1,
          trustedLimitedNumericCount: 0,
          untrustedCount: 1,
          numericCoveragePercent: 100,
          trustedNumericCoveragePercent: 80,
          trustedLimitedCoveragePercent: 10,
          nonUntrustedCoveragePercent: 90,
          trustedCoveragePercent: 80,
          reasonCodeBreakdown: {},
          missingEvidenceCount: 0,
          sourceConflictCount: 0,
        },
        speed: {
          shadowRawMaxKmh: 140,
          qcTrustedMaxKmh: 130,
          qcTrustedMeanKmh: 95,
          trustedSpeedDistribution: [],
          maxSpeedAssessability: 'TRUSTED_MAX_AVAILABLE',
        },
        motion: {
          stationarySupportedCount: 1,
          movingEstimatedCount: 8,
          movingUnknownCount: 0,
          uncertainCount: 0,
          noMotionEvidenceCount: 0,
        },
      },
    } as unknown as DiV0TripSpeedQualityPersistedRow);

    const result = await svc.readForTrip(organizationId, vehicleId, tripId);
    expect(projectionService.readCurrentOpsProjection).toHaveBeenCalledWith(
      organizationId,
      tripId,
      DI_V0_SPEED_QC_POLICY_V2,
    );
    expect(result.availability).toBe('READY');
    expect(result.qcPolicyVersion).toBe(DI_V0_SPEED_QC_POLICY_V2);
  });

  it('returns UNAVAILABLE when trip is outside tenant/vehicle scope', async () => {
    (prisma.vehicleTrip.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await svc.readForTrip(organizationId, vehicleId, tripId);
    expect(result.availability).toBe('UNAVAILABLE');
    expect(projectionService.readCurrentOpsProjection).not.toHaveBeenCalled();
  });

  it('returns UNAVAILABLE when outbox SKIPPED_INELIGIBLE (not NOT_ASSESSABLE)', async () => {
    projectionService.readCurrentOpsProjection.mockResolvedValue(null);
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([{ id: workItemId, status: 'COMPLETED' }])
      .mockResolvedValueOnce([{ status: 'SKIPPED_INELIGIBLE' }]);

    const result = await svc.readForTrip(organizationId, vehicleId, tripId);
    expect(result.availability).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE when S4 work item FAILED_TERMINAL', async () => {
    projectionService.readCurrentOpsProjection.mockResolvedValue(null);
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([{ id: workItemId, status: 'FAILED_TERMINAL' }])
      .mockResolvedValueOnce([]);

    const result = await svc.readForTrip(organizationId, vehicleId, tripId);
    expect(result.availability).toBe('UNAVAILABLE');
    expect(projectionService.readCurrentOpsProjection).toHaveBeenCalled();
  });

  it('returns PENDING when outbox row is PROCESSING', async () => {
    projectionService.readCurrentOpsProjection.mockResolvedValue(null);
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([{ id: workItemId, status: 'COMPLETED' }])
      .mockResolvedValueOnce([{ status: 'PROCESSING' }]);

    const result = await svc.readForTrip(organizationId, vehicleId, tripId);
    expect(result.availability).toBe('PENDING');
  });

  it('never calls projectForWorkItem (read-only)', async () => {
    projectionService.readCurrentOpsProjection.mockResolvedValue(null);
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([{ id: workItemId, status: 'COMPLETED' }])
      .mockResolvedValueOnce([]);
    await svc.readForTrip(organizationId, vehicleId, tripId);
    expect((projectionService as { projectForWorkItem?: unknown }).projectForWorkItem).toBeUndefined();
  });
});
