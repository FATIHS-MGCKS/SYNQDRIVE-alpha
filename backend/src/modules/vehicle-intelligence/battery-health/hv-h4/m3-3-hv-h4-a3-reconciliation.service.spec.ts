import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { M3_3HvH4ChargeSessionEvidenceWriterService } from './m3-3-hv-h4-a3-charge-session-evidence-writer.service';
import { M3_3HvH4A3ReconciliationCursorStore } from './m3-3-hv-h4-a3-reconciliation-cursor.store';
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
});
