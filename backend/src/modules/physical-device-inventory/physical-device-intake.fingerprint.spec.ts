import { PhysicalDeviceModelCode } from '@prisma/client';
import { buildManualIntakePayloadFingerprint } from './physical-device-intake.fingerprint';

describe('manual intake payload fingerprint', () => {
  it('is stable for case-variant serial input', () => {
    const base = {
      modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
      warehouseLocation: 'WH-01',
      serialNumber: 'R1-ABC-001',
    };
    const a = buildManualIntakePayloadFingerprint(base);
    const b = buildManualIntakePayloadFingerprint({
      ...base,
      serialNumber: 'r1-abc-001',
    });
    expect(a).toBe(b);
  });

  it('changes when warehouse location changes', () => {
    const a = buildManualIntakePayloadFingerprint({
      modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
      warehouseLocation: 'WH-01',
      serialNumber: 'R1-ABC-001',
    });
    const b = buildManualIntakePayloadFingerprint({
      modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
      warehouseLocation: 'WH-02',
      serialNumber: 'R1-ABC-001',
    });
    expect(a).not.toBe(b);
  });
});
