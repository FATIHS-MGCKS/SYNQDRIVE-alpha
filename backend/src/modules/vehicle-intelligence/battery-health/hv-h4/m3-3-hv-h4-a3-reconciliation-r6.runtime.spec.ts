import { Test } from '@nestjs/testing';
import type { HvChargeSession } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { M3_3HvH4ChargeSessionEvidenceWriterService } from './m3-3-hv-h4-a3-charge-session-evidence-writer.service';
import { M3_3HvH4A3ReconciliationCursorStore } from './m3-3-hv-h4-a3-reconciliation-cursor.store';
import { M3_3HvH4A3ReconciliationService } from './m3-3-hv-h4-a3-reconciliation.service';
import { buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import { computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1 } from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import { M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1 } from './m3-3-hv-h4-a3.constants';

jest.mock('./m3-3-hv-h4-a3-reconciliation.config', () => ({
  isBatteryHvH4A3ReconciliationEnabled: jest.fn(),
  getBatteryHvH4A3ReconciliationBatchSize: jest.fn(() => 5),
  getBatteryHvH4A3ReconciliationInspectionLimit: jest.fn(() => 50),
}));

jest.mock('./m3-3-hv-h4-a3-reconciliation-cohort.config', () => ({
  evaluateBatteryHvH4A3ReconciliationCohortRuntimeV1: jest.fn(),
  buildHvH4A3ReconciliationCohortPrismaOrV1: jest.fn(),
  isHvH4A3ReconciliationCohortMemberV1: jest.fn(),
}));

import { isBatteryHvH4A3ReconciliationEnabled } from './m3-3-hv-h4-a3-reconciliation.config';
import {
  buildHvH4A3ReconciliationCohortPrismaOrV1,
  evaluateBatteryHvH4A3ReconciliationCohortRuntimeV1,
  isHvH4A3ReconciliationCohortMemberV1,
} from './m3-3-hv-h4-a3-reconciliation-cohort.config';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const TESLA = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const OTHER_VEH = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SESSION_ID = '3e5fe028-a217-4dfd-b165-76993117c794';

const baseSession = {
  id: SESSION_ID,
  organizationId: ORG,
  vehicleId: TESLA,
  segmentFingerprint: 'dimo-recharge-186946-1791810415314',
  energyAddedKwh: 5.06,
  dimoSegmentId: 'dimo-recharge-186946-1791810415314',
  source: 'DIMO_RECHARGE_SEGMENT',
  startAt: new Date('2026-10-12T13:06:55.314Z'),
  endAt: new Date('2026-10-12T15:10:30.313Z'),
  isOngoing: false,
  idempotencyKey: 'idem',
  createdAt: new Date(),
  receivedAt: new Date(),
  updatedAt: new Date(),
  providerObservedAt: new Date('2026-10-12T15:10:30.313Z'),
  metadata: {
    qualityStatus: 'PARTIAL',
    addedEnergyProvenance: 'SEGMENT_EXTREMA',
  },
};

describe('M3.3-HV-H4 R6 automatic reconciliation runtime', () => {
  const enabledMock = isBatteryHvH4A3ReconciliationEnabled as jest.Mock;
  const cohortRuntimeMock = evaluateBatteryHvH4A3ReconciliationCohortRuntimeV1 as jest.Mock;
  const cohortOrMock = buildHvH4A3ReconciliationCohortPrismaOrV1 as jest.Mock;
  const isMemberMock = isHvH4A3ReconciliationCohortMemberV1 as jest.Mock;

  const prisma = {
    hvChargeSession: { findMany: jest.fn(), findUnique: jest.fn() },
    vehicle: { findUnique: jest.fn() },
    batteryHvChargeSessionEvidenceAck: { findFirst: jest.fn() },
  } as unknown as PrismaService;

  const writer = { persistFromHvChargeSession: jest.fn() } as unknown as M3_3HvH4ChargeSessionEvidenceWriterService;
  const cursorStore = {
    load: jest.fn(),
    save: jest.fn(),
  } as unknown as M3_3HvH4A3ReconciliationCursorStore;

  let service: M3_3HvH4A3ReconciliationService;

  const cohortReady = {
    state: 'READY' as const,
    config: {
      version: 'M3_3_HV_H4_A3_RECONCILIATION_COHORT_V1' as const,
      members: [{ organizationId: ORG, vehicleId: TESLA }],
    },
    configFingerprintSha256: 'fp',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    enabledMock.mockReturnValue(true);
    cohortRuntimeMock.mockReturnValue(cohortReady);
    cohortOrMock.mockReturnValue([{ organizationId: ORG, vehicleId: TESLA }]);
    isMemberMock.mockImplementation(
      (_cfg, org: string, veh: string) => org === ORG && veh === TESLA,
    );
    (cursorStore.load as jest.Mock).mockResolvedValue({ status: 'ABSENT' });
    (cursorStore.save as jest.Mock).mockResolvedValue(true);
    (prisma.hvChargeSession.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ organizationId: ORG });
    (prisma.batteryHvChargeSessionEvidenceAck.findFirst as jest.Mock).mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        M3_3HvH4A3ReconciliationService,
        { provide: PrismaService, useValue: prisma },
        { provide: M3_3HvH4ChargeSessionEvidenceWriterService, useValue: writer },
        { provide: M3_3HvH4A3ReconciliationCursorStore, useValue: cursorStore },
      ],
    }).compile();
    service = moduleRef.get(M3_3HvH4A3ReconciliationService);
  });

  it('feature disabled — no scan', async () => {
    enabledMock.mockReturnValue(false);
    const outcome = await service.runBoundedReconciliationTick();
    expect(outcome.result).toBe('SKIPPED_FLAG_OFF');
    expect(prisma.hvChargeSession.findMany).not.toHaveBeenCalled();
  });

  it('missing allowlist — fail closed', async () => {
    cohortRuntimeMock.mockReturnValue({ state: 'MISSING', config: null, configFingerprintSha256: null });
    const outcome = await service.runBoundedReconciliationTick();
    expect(outcome.result).toBe('SKIPPED_COHORT_NOT_CONFIGURED');
    expect(writer.persistFromHvChargeSession).not.toHaveBeenCalled();
  });

  it('fleet scan scoped to cohort OR clause only', async () => {
    await service.runBoundedReconciliationTick();
    expect(prisma.hvChargeSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ organizationId: ORG, vehicleId: TESLA }] },
      }),
    );
  });

  it('unauthorized vehicle blocked before writer', async () => {
    isMemberMock.mockReturnValue(false);
    (prisma.hvChargeSession.findUnique as jest.Mock).mockResolvedValue({
      ...baseSession,
      vehicleId: OTHER_VEH,
    });
    const result = await service.reconcileLiveSessionRow(SESSION_ID);
    expect(result.classification).toBe('BLOCKED_COHORT_UNAUTHORIZED');
    expect(writer.persistFromHvChargeSession).not.toHaveBeenCalled();
  });

  it('ongoing session skipped without writer', async () => {
    (prisma.hvChargeSession.findUnique as jest.Mock).mockResolvedValue({
      ...baseSession,
      isOngoing: true,
    });
    const result = await service.reconcileLiveSessionRow(SESSION_ID);
    expect(result.classification).toBe('SKIPPED_SESSION_ONGOING');
    expect(writer.persistFromHvChargeSession).not.toHaveBeenCalled();
  });

  it('completed authorized session can materialize once', async () => {
    const sessionRow = baseSession as unknown as HvChargeSession;
    const sourceRevisionFingerprint = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(
      buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(
        sessionRow,
        M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
      ),
    );
    (prisma.hvChargeSession.findUnique as jest.Mock).mockResolvedValue(baseSession);
    (writer.persistFromHvChargeSession as jest.Mock).mockResolvedValue({
      persistenceOutcome: 'CREATED',
      revision: { sourceRevisionFingerprint },
      ack: {},
    });
    const result = await service.reconcileLiveSessionRow(SESSION_ID);
    expect(result.classification).toBe('CREATED');
    expect(writer.persistFromHvChargeSession).toHaveBeenCalledTimes(1);
  });

  it('redis unavailable — no fleet scan', async () => {
    (cursorStore.load as jest.Mock).mockResolvedValue({ status: 'UNAVAILABLE' });
    const outcome = await service.runBoundedReconciliationTick();
    expect(outcome.result).toBe('CURSOR_UNAVAILABLE');
    expect(prisma.hvChargeSession.findMany).not.toHaveBeenCalled();
  });

  it('cursor continuity saved after inspection', async () => {
    (prisma.hvChargeSession.findMany as jest.Mock).mockResolvedValue([
      { id: SESSION_ID, organizationId: ORG, vehicleId: TESLA },
    ]);
    jest.spyOn(service, 'reconcileLiveSessionRow').mockResolvedValue({
      classification: 'ALREADY_DURABLE',
      persistenceEffect: 'NONE',
    });
    await service.runBoundedReconciliationTick();
    expect(cursorStore.save).toHaveBeenCalledWith({
      organizationId: ORG,
      vehicleId: TESLA,
      id: SESSION_ID,
    });
  });
});
