import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  DI_V0_SPEED_QC_POLICY_V1,
  DI_V0_SPEED_QC_POLICY_V2,
} from '../../speed-qc/di-v0-speed-qc-policy.version';
import { computeDiV0TripSpeedQualityProjectionV1ForWorkItem } from '../di-v0-trip-speed-quality-projection.engine';
import { DiV0TripSpeedQualityProjectionService } from '../di-v0-trip-speed-quality-projection.service';
import {
  DiV0TripSpeedQualityProjectionRepository,
  type DiV0TripSpeedQualityPersistedRow,
} from '../di-v0-trip-speed-quality-projection.repository';
import { buildDiV0TripSpeedQualityProjectionV1 } from '../build-di-v0-trip-speed-quality-projection.v1';
import { syntheticHighway130Input } from '../../speed-qc/__tests__/fixtures/synthetic-scenarios';

jest.mock('../di-v0-trip-speed-quality-projection.engine', () => ({
  computeDiV0TripSpeedQualityProjectionV1ForWorkItem: jest.fn(),
}));

jest.mock('../di-v0-trip-speed-quality-projection.repository');

const computeMock = computeDiV0TripSpeedQualityProjectionV1ForWorkItem as jest.MockedFunction<
  typeof computeDiV0TripSpeedQualityProjectionV1ForWorkItem
>;

function minimalProjection(
  scope: { organizationId: string; tripId: string; workItemId: string },
  qcPolicyVersion: string,
) {
  const qc = syntheticHighway130Input();
  const shadow = {
    intervalStart: new Date(qc.shadow.intervalStart),
    intervalEnd: new Date(qc.shadow.intervalEnd),
    referenceTime: new Date(qc.shadow.referenceTime),
    motionState: qc.shadow.motionState,
    positionState: qc.shadow.positionState,
    estimatedSpeedKmh: qc.shadow.estimatedSpeedKmh,
    speedEvidenceState: qc.shadow.speedEvidenceState,
    valueConfidence: qc.shadow.valueConfidence,
    sourceRelation: qc.shadow.sourceRelation,
    abstentionReason: qc.shadow.abstentionReason,
    evidenceSources: qc.shadow.evidenceSources,
    sourceQualityFlags: qc.shadow.sourceQualityFlags,
  };
  const p = buildDiV0TripSpeedQualityProjectionV1({
    organizationId: scope.organizationId,
    vehicleId: randomUUID(),
    tripId: scope.tripId,
    workItemId: scope.workItemId,
    shadowRunId: randomUUID(),
    pinnedSnapshotHash: 'SYNTHETIC:HASH',
    boundaryFingerprint: 'fp',
    sourceFamily: 'API_SYNTHETIC',
    combinedInputIdentity: 'ci',
    shadowInputEvidenceVersion: 'iev',
    workItemCompletedAt: new Date('2020-06-01T12:30:00Z'),
    snapshotVerified: true,
    evidence: {
      positions: qc.positions,
      positionStateByLabel: new Map(qc.positions.map((pos) => [pos.bucketLabel, pos.positionState ?? 'FRESH'])),
      r1Obd: qc.r1Obd ?? [],
    },
    shadowIntervals: [shadow],
    qcPolicyVersion,
  });
  return p;
}

describe('DiV0TripSpeedQualityProjectionService qcPolicyVersion', () => {
  const organizationId = randomUUID();
  const tripId = randomUUID();
  const workItemId = randomUUID();

  let prisma: PrismaClient;
  let persistMock: jest.Mock;
  let readCurrentMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ trip_id: tripId }]),
    } as unknown as PrismaClient;

    persistMock = jest.fn();
    readCurrentMock = jest.fn();
    (DiV0TripSpeedQualityProjectionRepository as jest.Mock).mockImplementation(() => ({
      persistCurrentProjection: persistMock,
      readCurrentForTrip: readCurrentMock,
    }));
  });

  it('defaults projectForWorkItem to V1 when options omitted', async () => {
    const projection = minimalProjection(
      { organizationId, tripId, workItemId },
      DI_V0_SPEED_QC_POLICY_V1,
    );
    computeMock.mockResolvedValue(projection);
    persistMock.mockResolvedValue({ id: randomUUID() } as DiV0TripSpeedQualityPersistedRow);

    const svc = new DiV0TripSpeedQualityProjectionService(prisma);
    await svc.projectForWorkItem(organizationId, workItemId);

    expect(computeMock).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V1 }),
    );
  });

  it('forwards explicit V2 to compute on projectForWorkItem', async () => {
    const projection = minimalProjection(
      { organizationId, tripId, workItemId },
      DI_V0_SPEED_QC_POLICY_V2,
    );
    computeMock.mockResolvedValue(projection);
    persistMock.mockResolvedValue({ id: randomUUID() } as DiV0TripSpeedQualityPersistedRow);

    const svc = new DiV0TripSpeedQualityProjectionService(prisma);
    await svc.projectForWorkItem(organizationId, workItemId, {
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });

    expect(computeMock).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2 }),
    );
  });

  it('readCurrentOpsProjection defaults to V1 policy key', async () => {
    readCurrentMock.mockResolvedValue(null);
    const svc = new DiV0TripSpeedQualityProjectionService(prisma);
    await svc.readCurrentOpsProjection(organizationId, tripId);

    expect(readCurrentMock).toHaveBeenCalledWith(
      organizationId,
      tripId,
      DI_V0_SPEED_QC_POLICY_V1,
      expect.any(String),
    );
  });

  it('readCurrentOpsProjection honors explicit V2 policy key', async () => {
    readCurrentMock.mockResolvedValue(null);
    const svc = new DiV0TripSpeedQualityProjectionService(prisma);
    await svc.readCurrentOpsProjection(organizationId, tripId, DI_V0_SPEED_QC_POLICY_V2);

    expect(readCurrentMock).toHaveBeenCalledWith(
      organizationId,
      tripId,
      DI_V0_SPEED_QC_POLICY_V2,
      expect.any(String),
    );
  });
});
