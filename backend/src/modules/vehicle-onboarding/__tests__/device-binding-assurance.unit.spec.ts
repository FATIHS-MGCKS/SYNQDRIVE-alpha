import { assertDimoHardwareDeviceBindingForActivation } from '../connection-identity/device-binding-assurance';
import type { DeviceBindingEvidence } from '../connection-identity/connection-modality-verification';

const evidence: DeviceBindingEvidence = {
  source: 'DIMO_TELEMETRY_SOURCE_FAMILY',
  telemetrySourceFamily: 'RUPTELA_R1',
  deviceSerial: 'R1-UNIT-1',
};

describe('device binding assurance', () => {
  it('requires mirror id and external identity alignment', async () => {
    const tx = {
      vehicleDataSourceLink: { findFirst: async () => null },
    };
    await expect(
      assertDimoHardwareDeviceBindingForActivation(tx as any, {
        evidence,
        ref: { id: 'ref-1', sourceMirrorId: 'mirror-a', externalVehicleIdentity: 'ext-wrong' },
        organizationId: 'org-1',
        dimo: { id: 'mirror-a', externalId: 'ext-1', tokenId: null },
      }),
    ).rejects.toMatchObject({ code: 'ACTIVATION_PRECONDITION_FAILED' });
  });

  it('returns PROVIDER_SERIAL_MIRROR_ALIGNED without tokenId', async () => {
    const tx = {
      vehicleDataSourceLink: { findFirst: async () => null },
    };
    const level = await assertDimoHardwareDeviceBindingForActivation(tx as any, {
      evidence,
      ref: { id: 'ref-1', sourceMirrorId: 'mirror-a', externalVehicleIdentity: 'ext-1' },
      organizationId: 'org-1',
      dimo: { id: 'mirror-a', externalId: 'ext-1', tokenId: null },
    });
    expect(level).toBe('PROVIDER_SERIAL_MIRROR_ALIGNED');
  });
});
