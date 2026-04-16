import { BatteryHealthService } from './battery-health.service';
import { BatteryEvidenceSourceType } from '@prisma/client';

describe('BatteryHealthService', () => {
  it('persists observedAt timestamp instead of current time', async () => {
    const createMock = jest.fn().mockResolvedValue({ id: 'snap-1' });
    const evidenceRecordMany = jest.fn().mockResolvedValue(undefined);

    const prisma = {
      batteryHealthSnapshot: {
        create: createMock,
      },
    } as any;

    const evidence = {
      recordMany: evidenceRecordMany,
    } as any;

    const svc = new BatteryHealthService(prisma, evidence);
    const observedAt = new Date('2026-04-01T08:30:00.000Z');

    await svc.recordSnapshot({
      vehicleId: 'veh-1',
      voltageV: 12.6,
      restingVoltage: 12.6,
      observedAt,
      sourceType: BatteryEvidenceSourceType.DOCUMENT_CONFIRMED,
      provider: 'document_confirmed',
      documentExtractionId: 'doc-1',
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const createArg = createMock.mock.calls[0][0];
    expect(createArg.data.recordedAt).toEqual(observedAt);
    expect(evidenceRecordMany).toHaveBeenCalled();
  });
});
