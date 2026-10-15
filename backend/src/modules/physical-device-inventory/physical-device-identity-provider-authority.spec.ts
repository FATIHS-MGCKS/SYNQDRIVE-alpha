import { PhysicalDeviceModelCode, type PrismaClient } from '@prisma/client';
import { assertProviderIdentityAuthorityForVerification } from './physical-device-identity-provider-authority';
import { VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION } from '@modules/vehicle-onboarding/connection-identity/source-link-connection-identity.metadata';
import { VO_CONNECTION_IDENTITY_CONTRACT_VERSION } from '@modules/vehicle-onboarding/connection-identity/vehicle-connection-identity.contract';

describe('assertProviderIdentityAuthorityForVerification', () => {
  const vehicleId = 'vehicle-1';
  const orgId = 'org-1';
  const dimoId = 'dimo-1';
  const linkId = 'link-1';
  const serial = 'R1-TEST-AUTH-001';

  function prismaStub(links: unknown[], peers: unknown[] = []) {
    return {
      vehicleDataSourceLink: {
        findMany: async () => links,
      },
      physicalDevice: {
        findMany: async () => peers,
      },
    };
  }

  it('rejects when device owner org does not match vehicle org', async () => {
    const result = await assertProviderIdentityAuthorityForVerification(
      prismaStub([]) as unknown as PrismaClient,
      {
        deviceId: 'dev-1',
        deviceOwnerOrganizationId: 'org-a',
        vehicle: { id: vehicleId, organizationId: 'org-b', dimoVehicleId: dimoId },
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        inventorySerial: serial,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('DEVICE_VEHICLE_ORG_MISMATCH');
  });

  it('rejects when active DIMO provider link is missing', async () => {
    const result = await assertProviderIdentityAuthorityForVerification(
      prismaStub([]) as unknown as PrismaClient,
      {
        deviceId: 'dev-1',
        deviceOwnerOrganizationId: orgId,
        vehicle: { id: vehicleId, organizationId: orgId, dimoVehicleId: dimoId },
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        inventorySerial: serial,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PROVIDER_DIMO_LINK_MISSING');
  });

  it('accepts aligned active link and connection identity', async () => {
    const result = await assertProviderIdentityAuthorityForVerification(
      prismaStub([
        {
          id: linkId,
          dimoVehicleId: dimoId,
          isActive: true,
          metadata: {
            connectionIdentity: {
              version: VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION,
              contractVersion: VO_CONNECTION_IDENTITY_CONTRACT_VERSION,
              providerSourceLinkId: linkId,
              preActivationProviderSourceRefId: 'ref-1',
              provider: 'DIMO',
              providerVehicleReference: 'ext-1',
              sourceMirrorId: dimoId,
              proposedModality: 'HARDWARE_DEVICE',
              verifiedModality: 'HARDWARE_DEVICE',
              modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE',
              physicalDeviceReference: serial,
              verificationEvidence: [],
              verifiedAt: new Date().toISOString(),
              organizationId: orgId,
              vehicleId,
            },
          },
          deactivatedAt: null,
          supersededByLinkId: null,
        },
      ]) as unknown as PrismaClient,
      {
        deviceId: 'dev-1',
        deviceOwnerOrganizationId: orgId,
        vehicle: { id: vehicleId, organizationId: orgId, dimoVehicleId: dimoId },
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        inventorySerial: serial,
      },
    );
    expect(result.ok).toBe(true);
  });
});
