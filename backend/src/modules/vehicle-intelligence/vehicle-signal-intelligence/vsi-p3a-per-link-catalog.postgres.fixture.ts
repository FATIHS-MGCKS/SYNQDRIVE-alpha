import type { PrismaClient } from '@prisma/client';
import { VehicleConnectionModality } from '../../vehicle-onboarding/connection-identity/vehicle-connection-identity.contract';
import {
  B1_RUPTELA_RAW,
  createLegacyDimoLinkFixture,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { buildP3aVerifiedConnectionIdentityMetadata } from './vsi-p3a-per-link-catalog-link-resolution';

export async function createP3aVerifiedRuptelaFixture(
  prisma: PrismaClient,
  organizationId: string,
  externalId: string,
) {
  const serial = `R1-P3A${externalId.replace(/[^a-f0-9]/gi, '').slice(-10)}`;
  const rawJson = B1_RUPTELA_RAW(serial);
  const tokenId = Math.floor(Math.random() * 1_000_000) + 4_000_000;
  const fixture = await createLegacyDimoLinkFixture(prisma, {
    organizationId,
    externalId,
    rawJson,
    tokenId,
  });

  const dimo = await prisma.dimoVehicle.findUniqueOrThrow({
    where: { id: fixture.dimoId },
    select: { id: true, externalId: true, tokenId: true, rawJson: true },
  });

  const metadata = buildP3aVerifiedConnectionIdentityMetadata({
    linkId: fixture.linkId,
    organizationId,
    vehicleId: fixture.vehicleId,
    dimo: {
      id: dimo.id,
      externalId: dimo.externalId!,
      tokenId: dimo.tokenId,
      rawJson: dimo.rawJson,
    },
    verifiedModality: VehicleConnectionModality.HARDWARE_DEVICE,
    verificationEvidence: ['RUPTELA_R1', `serial:${serial}`],
    verifiedAt: new Date(),
  });

  await prisma.vehicleDataSourceLink.update({
    where: { id: fixture.linkId },
    data: { metadata },
  });

  return { ...fixture, tokenId: dimo.tokenId ?? tokenId };
}
