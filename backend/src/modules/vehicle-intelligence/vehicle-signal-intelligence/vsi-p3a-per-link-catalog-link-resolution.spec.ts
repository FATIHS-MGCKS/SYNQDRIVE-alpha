import { VehicleConnectionModality } from '../../vehicle-onboarding/connection-identity/vehicle-connection-identity.contract';
import { B1_RUPTELA_RAW } from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import {
  buildP3aVerifiedConnectionIdentityMetadata,
  resolveVerifiedDimoProviderSourceLinkForPreflight,
} from './vsi-p3a-per-link-catalog-link-resolution';

function makePrisma() {
  return {
    vehicle: { findFirst: jest.fn() },
    vehicleDataSourceLink: { findMany: jest.fn() },
  } as any;
}

describe('resolveVerifiedDimoProviderSourceLinkForPreflight', () => {
  it('fails closed without connection identity metadata', async () => {
    const prisma = makePrisma();
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'v1',
      organizationId: 'org-1',
      dimoVehicleId: 'd1',
      dimoVehicle: { id: 'd1', tokenId: 100, externalId: '0xabc' },
    });
    prisma.vehicleDataSourceLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        provider: 'DIMO',
        vehicleId: 'v1',
        dimoVehicleId: 'd1',
        metadata: { provenance: 'backfill' },
        dimoVehicle: { id: 'd1', externalId: '0xabc', tokenId: 100, rawJson: {} },
      },
    ]);

    const result = await resolveVerifiedDimoProviderSourceLinkForPreflight(prisma, {
      organizationId: 'org-1',
      vehicleId: 'v1',
      dimoTokenId: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('CONNECTION_IDENTITY_MISSING');
    }
  });

  it('rejects preflight token mismatch before provider evidence', async () => {
    const prisma = makePrisma();
    const meta = buildP3aVerifiedConnectionIdentityMetadata({
      linkId: 'link-1',
      organizationId: 'org-1',
      vehicleId: 'v1',
      dimo: { id: 'd1', externalId: '0xabc', tokenId: 100, rawJson: B1_RUPTELA_RAW('SER-1') },
      verifiedModality: VehicleConnectionModality.HARDWARE_DEVICE,
      verificationEvidence: ['RUPTELA_R1'],
      verifiedAt: new Date(),
    });
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'v1',
      organizationId: 'org-1',
      dimoVehicleId: 'd1',
      dimoVehicle: { id: 'd1', tokenId: 100, externalId: '0xabc' },
    });
    prisma.vehicleDataSourceLink.findMany.mockResolvedValue([
      {
        id: 'link-1',
        provider: 'DIMO',
        vehicleId: 'v1',
        dimoVehicleId: 'd1',
        metadata: meta,
        dimoVehicle: {
          id: 'd1',
          externalId: '0xabc',
          tokenId: 100,
          rawJson: B1_RUPTELA_RAW('SER-1'),
        },
      },
    ]);

    const result = await resolveVerifiedDimoProviderSourceLinkForPreflight(prisma, {
      organizationId: 'org-1',
      vehicleId: 'v1',
      dimoTokenId: 999,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('PROVIDER_TOKEN_BINDING_MISMATCH');
    }
  });
});
