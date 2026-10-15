import { PhysicalDeviceModelCode } from '@prisma/client';
import {
  normalizeImeiDigits,
  normalizePhysicalDeviceIdentifiers,
  normalizePhysicalDeviceSerial,
} from './physical-device-identifier.normalize';

describe('physical device identifier normalization', () => {
  it('uppercases Ruptela serials and rejects prefix mismatch', () => {
    const result = normalizePhysicalDeviceSerial('r1-12345-20068', PhysicalDeviceModelCode.RUPTELA_R1);
    expect(result.canonical).toBe('R1-12345-20068');
    expect(result.clarificationReason).toBeNull();
  });

  it('treats case variants as the same canonical serial', () => {
    const a = normalizePhysicalDeviceSerial('R1-ABC-001', PhysicalDeviceModelCode.RUPTELA_R1);
    const b = normalizePhysicalDeviceSerial('r1-abc-001', PhysicalDeviceModelCode.RUPTELA_R1);
    expect(a.canonical).toBe(b.canonical);
  });

  it('validates IMEI checksum and digit length', () => {
    expect(normalizeImeiDigits('490154203237518')).toBe('490154203237518');
    expect(normalizeImeiDigits('490154203237519')).toBeNull();
    expect(normalizeImeiDigits('12')).toBeNull();
  });

  it('marks missing identifiers for clarification metadata', () => {
    const normalized = normalizePhysicalDeviceIdentifiers({
      modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
    });
    expect(normalized.serialNumber).toBeNull();
    expect(normalized.imei).toBeNull();
  });
});
