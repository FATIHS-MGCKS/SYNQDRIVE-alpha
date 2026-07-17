import { NotFoundException } from '@nestjs/common';
import { assertDocumentEntityInOrganization } from './document-entity.scope';

describe('document-entity.scope', () => {
  it('rejects cross-tenant vehicle ids', async () => {
    const prisma = {
      vehicle: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await expect(
      assertDocumentEntityInOrganization(prisma as any, 'org-1', 'VEHICLE', 'veh-foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects organization entity id mismatch', async () => {
    const prisma = {};

    await expect(
      assertDocumentEntityInOrganization(prisma as any, 'org-1', 'ORGANIZATION', 'org-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts matching organization entity id', async () => {
    await expect(
      assertDocumentEntityInOrganization({} as any, 'org-1', 'ORGANIZATION', 'org-1'),
    ).resolves.toBeUndefined();
  });
});
