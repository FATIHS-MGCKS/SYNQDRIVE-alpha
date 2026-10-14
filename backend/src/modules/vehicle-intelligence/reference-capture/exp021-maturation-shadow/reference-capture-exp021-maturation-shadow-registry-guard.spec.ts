import { Exp021MaturationShadowFamilyIdentityError } from './reference-capture-exp021-maturation-shadow.errors';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';

describe('EXP021 maturation shadow registry guard', () => {
  it('resolveAuthoritativeTokenId rejects OFFBOARDED vehicle', async () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          registryLifecycle: 'OFFBOARDED',
          dimoVehicle: { tokenId: 187336 },
        }),
      },
    };
    const repo = new ReferenceCaptureExp021MaturationShadowRepository(prisma as never);
    await expect(
      repo.resolveAuthoritativeTokenId('org-1', 'veh-1', 187336),
    ).rejects.toBeInstanceOf(Exp021MaturationShadowFamilyIdentityError);
  });

  it('resolveAuthoritativeTokenId allows ACTIVE vehicle', async () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          registryLifecycle: 'ACTIVE',
          dimoVehicle: { tokenId: 187361 },
        }),
      },
    };
    const repo = new ReferenceCaptureExp021MaturationShadowRepository(prisma as never);
    await expect(repo.resolveAuthoritativeTokenId('org-1', 'veh-1', 187361)).resolves.toBe(187361);
  });
});
