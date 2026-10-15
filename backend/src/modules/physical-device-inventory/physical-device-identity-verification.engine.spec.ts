import { PhysicalDeviceModelCode } from '@prisma/client';
import { PhysicalDeviceIdentityAttestationKind } from './dto/verify-physical-device-identity.dto';
import { evaluateIdentityVerification } from './physical-device-identity-verification.engine';

describe('evaluateIdentityVerification', () => {
  it('fails closed for SMART5 without provider identity', () => {
    const result = evaluateIdentityVerification({
      modelCode: PhysicalDeviceModelCode.SMART5,
      identityStatus: 'NEEDS_CLARIFICATION',
      serialNumber: 'SMART5-ABC-1234',
      serialClarificationReason: null,
      attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
      providerReconciliation: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('SMART5_PROVIDER_IDENTITY_UNKNOWN');
    }
  });

  it('accepts R1 with aligned provider reconciliation', () => {
    const result = evaluateIdentityVerification({
      modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
      identityStatus: 'NEEDS_CLARIFICATION',
      serialNumber: 'R1-TEST-001',
      serialClarificationReason: null,
      attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
      providerReconciliation: {
        ok: true,
        evidence: ['serial:R1-TEST-001'],
        providerSerial: 'R1-TEST-001',
        telemetrySourceFamily: 'RUPTELA_R1',
      },
    });
    expect(result.ok).toBe(true);
  });
});
