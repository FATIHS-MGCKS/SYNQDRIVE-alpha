import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { M3_3HvH4ChargeSessionEvidenceWriterService } from './m3-3-hv-h4-a3-charge-session-evidence-writer.service';
import { M3_3HvH4A3ReconciliationCursorStore } from './m3-3-hv-h4-a3-reconciliation-cursor.store';
import { H4EvidenceRevisionStoredFingerprintMismatchError } from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';
import { M3_3HvH4A3ReconciliationService } from './m3-3-hv-h4-a3-reconciliation.service';

jest.mock('./m3-3-hv-h4-a3-reconciliation.config', () => ({
  isBatteryHvH4A3ReconciliationEnabled: jest.fn(),
  getBatteryHvH4A3ReconciliationBatchSize: jest.fn(() => 25),
  getBatteryHvH4A3ReconciliationInspectionLimit: jest.fn(() => 50),
}));

import {
  getBatteryHvH4A3ReconciliationBatchSize,
  getBatteryHvH4A3ReconciliationInspectionLimit,
  isBatteryHvH4A3ReconciliationEnabled,
} from './m3-3-hv-h4-a3-reconciliation.config';

describe('M3_3HvH4A3ReconciliationService', () => {
  const enabledMock = isBatteryHvH4A3ReconciliationEnabled as jest.Mock;

  const prisma = {
    hvChargeSession: { findMany: jest.fn(), findUnique: jest.fn() },
    vehicle: { findUnique: jest.fn() },
    batteryHvChargeSessionEvidenceAck: { count: jest.fn() },
  } as unknown as PrismaService;

  const writer = { persistFromHvChargeSession: jest.fn() } as unknown as M3_3HvH4ChargeSessionEvidenceWriterService;
  const cursorStore = {
    load: jest.fn(),
    save: jest.fn(),
  } as unknown as M3_3HvH4A3ReconciliationCursorStore;

  let service: M3_3HvH4A3ReconciliationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    (getBatteryHvH4A3ReconciliationBatchSize as jest.Mock).mockReturnValue(25);
    (getBatteryHvH4A3ReconciliationInspectionLimit as jest.Mock).mockReturnValue(50);
    enabledMock.mockReturnValue(true);
    (cursorStore.load as jest.Mock).mockResolvedValue({ status: 'ABSENT' });
    (cursorStore.save as jest.Mock).mockResolvedValue(true);

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

  it('A) FLAG OFF — zero work', async () => {
    enabledMock.mockReturnValue(false);
    const outcome = await service.runBoundedReconciliationTick();
    expect(outcome.result).toBe('SKIPPED_FLAG_OFF');
    expect(prisma.hvChargeSession.findMany).not.toHaveBeenCalled();
  });

  it('cursor UNAVAILABLE — no fleet scan', async () => {
    (cursorStore.load as jest.Mock).mockResolvedValue({ status: 'UNAVAILABLE' });
    const outcome = await service.runBoundedReconciliationTick();
    expect(outcome.result).toBe('CURSOR_UNAVAILABLE');
    expect(prisma.hvChargeSession.findMany).not.toHaveBeenCalled();
  });

  it('P) boundedness — repairs stop at batchSize', async () => {
    (getBatteryHvH4A3ReconciliationBatchSize as jest.Mock).mockReturnValue(1);
    (getBatteryHvH4A3ReconciliationInspectionLimit as jest.Mock).mockReturnValue(5);
    const rows = [
      {
        id: '30000000-0000-4000-8000-000000000003',
        organizationId: '10000000-0000-4000-8000-000000000001',
        vehicleId: '20000000-0000-4000-8000-000000000002',
      },
      {
        id: '30000000-0000-4000-8000-000000000004',
        organizationId: '10000000-0000-4000-8000-000000000001',
        vehicleId: '20000000-0000-4000-8000-000000000002',
      },
    ];
    (prisma.hvChargeSession.findMany as jest.Mock).mockResolvedValue(rows);
    jest
      .spyOn(service, 'reconcileLiveSessionRow')
      .mockResolvedValueOnce('CREATED')
      .mockResolvedValue('ALREADY_DURABLE');

    const outcome = await service.runBoundedReconciliationTick();
    expect(outcome.inspectedCount).toBe(1);
    expect(outcome.createdCount).toBe(1);
    expect(service.reconcileLiveSessionRow).toHaveBeenCalledTimes(1);
  });

  it('L) fleet scan uses deterministic orderBy', async () => {
    (prisma.hvChargeSession.findMany as jest.Mock).mockResolvedValue([]);
    await service.runBoundedReconciliationTick();
    expect(prisma.hvChargeSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { organizationId: 'asc' },
          { vehicleId: 'asc' },
          { id: 'asc' },
        ],
      }),
    );
  });

  it('J) cursor wrap — empty tail restarts from beginning', async () => {
    (cursorStore.load as jest.Mock).mockResolvedValue({
      status: 'OK',
      cursor: {
        organizationId: '10000000-0000-4000-8000-000000000099',
        vehicleId: '20000000-0000-4000-8000-000000000099',
        id: '30000000-0000-4000-8000-000000000099',
      },
    });
    let findManyCalls = 0;
    (prisma.hvChargeSession.findMany as jest.Mock).mockImplementation(async () => {
      findManyCalls += 1;
      if (findManyCalls === 1) return [];
      if (findManyCalls === 2) {
        return [
          {
            id: '30000000-0000-4000-8000-000000000001',
            organizationId: '10000000-0000-4000-8000-000000000001',
            vehicleId: '20000000-0000-4000-8000-000000000002',
          },
        ];
      }
      return [];
    });
    jest.spyOn(service, 'reconcileLiveSessionRow').mockResolvedValue('ALREADY_DURABLE');
    await service.runBoundedReconciliationTick();
    expect(findManyCalls).toBeGreaterThanOrEqual(2);
    const secondCall = (prisma.hvChargeSession.findMany as jest.Mock).mock.calls[1][0];
    expect(secondCall.where).toEqual({});
  });
});

describe('M3_3HvH4A3ReconciliationService.reconcileLiveSessionRow', () => {
  const session = {
    id: '30000000-0000-4000-8000-000000000003',
    organizationId: '10000000-0000-4000-8000-000000000001',
    vehicleId: '20000000-0000-4000-8000-000000000002',
    segmentFingerprint: 'fp-1',
    energyAddedKwh: 10,
    dimoSegmentId: 'dimo-1',
    source: 'DIMO_RECHARGE',
    startAt: new Date(),
    endAt: new Date(),
    isOngoing: false,
    idempotencyKey: 'idem',
    createdAt: new Date(),
    receivedAt: new Date(),
    updatedAt: new Date(),
    providerObservedAt: new Date(),
    metadata: {
      providerSegmentId: 'prov-1',
      addedEnergyProvenance: 'SEGMENT_EXTREMA',
      qualityStatus: 'QUALIFIED',
    },
    supersededBySegmentFingerprint: null,
    startedBeforeRange: false,
  };

  const prisma = {
    hvChargeSession: { findUnique: jest.fn() },
    vehicle: { findUnique: jest.fn() },
    batteryHvChargeSessionEvidenceAck: { count: jest.fn() },
  } as unknown as PrismaService;

  const writer = { persistFromHvChargeSession: jest.fn() } as unknown as M3_3HvH4ChargeSessionEvidenceWriterService;

  let service: M3_3HvH4A3ReconciliationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        M3_3HvH4A3ReconciliationService,
        { provide: PrismaService, useValue: prisma },
        { provide: M3_3HvH4ChargeSessionEvidenceWriterService, useValue: writer },
        {
          provide: M3_3HvH4A3ReconciliationCursorStore,
          useValue: { load: jest.fn(), save: jest.fn() },
        },
      ],
    }).compile();
    service = moduleRef.get(M3_3HvH4A3ReconciliationService);
    (prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({
      organizationId: session.organizationId,
    });
    (prisma.batteryHvChargeSessionEvidenceAck.count as jest.Mock).mockResolvedValue(1);
  });

  it('G) corruption — fail closed BLOCKED_INTEGRITY', async () => {
    (prisma.hvChargeSession.findUnique as jest.Mock).mockResolvedValue(session);
    (writer.persistFromHvChargeSession as jest.Mock).mockRejectedValue(
      new H4EvidenceRevisionStoredFingerprintMismatchError('bad'),
    );
    expect(await service.reconcileLiveSessionRow(session.id)).toBe('BLOCKED_INTEGRITY');
  });

  it('H) source mutation race — SOURCE_CHANGED_DURING_RECONCILIATION', async () => {
    (prisma.hvChargeSession.findUnique as jest.Mock)
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce({ ...session, energyAddedKwh: 99 });
    (writer.persistFromHvChargeSession as jest.Mock).mockResolvedValue({
      persistenceOutcome: 'CREATED',
      revision: { sourceRevisionFingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      ack: {},
    });
    expect(await service.reconcileLiveSessionRow(session.id)).toBe(
      'SOURCE_CHANGED_DURING_RECONCILIATION',
    );
  });

  it('N) tenant mismatch — BLOCKED_TENANT_INVARIANT', async () => {
    (prisma.hvChargeSession.findUnique as jest.Mock).mockResolvedValue(session);
    (prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({
      organizationId: '99999999-9999-4999-8999-999999999999',
    });
    expect(await service.reconcileLiveSessionRow(session.id)).toBe('BLOCKED_TENANT_INVARIANT');
    expect(writer.persistFromHvChargeSession).not.toHaveBeenCalled();
  });
});
