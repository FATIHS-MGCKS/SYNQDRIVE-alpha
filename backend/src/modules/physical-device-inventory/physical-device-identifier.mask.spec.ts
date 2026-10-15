import { maskDeviceImei, maskDeviceSerial } from './physical-device-identifier.mask';

describe('physical device identifier masking', () => {
  it('masks serial numbers for list display', () => {
    expect(maskDeviceSerial('R1-12345-20068')).toBe('R1-1***0068');
    expect(maskDeviceSerial('ab')).toBe('***');
    expect(maskDeviceSerial(null)).toBeNull();
  });

  it('masks IMEI digits', () => {
    expect(maskDeviceImei('359123456789012')).toMatch(/^3591\*+012$/);
    expect(maskDeviceImei('12')).toBe('***');
  });
});
