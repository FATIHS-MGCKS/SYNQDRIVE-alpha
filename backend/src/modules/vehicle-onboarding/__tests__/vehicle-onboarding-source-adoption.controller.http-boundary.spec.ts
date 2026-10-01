import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { VehicleOnboardingSourceAdoptionController } from '../controllers/vehicle-onboarding-source-adoption.controller';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

describe('VehicleOnboardingSourceAdoptionController HTTP boundary', () => {
  const orgId = randomUUID();
  const caseId = randomUUID();
  const req = { user: { id: 'master-1' } } as any;

  const service = {
    adoptProviderSource: jest.fn(),
    attachProviderSource: jest.fn(),
  };

  const controller = new VehicleOnboardingSourceAdoptionController(service as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invalid adopt body → 422', async () => {
    await expect(
      controller.adoptSource(orgId, { provider: 'DIMO', sourceMirrorId: 'bad' }, req),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(service.adoptProviderSource).not.toHaveBeenCalled();
  });

  it('SOURCE_ALREADY_CLAIMED → 409', async () => {
    service.adoptProviderSource.mockRejectedValue(
      new VehicleOnboardingError('SOURCE_ALREADY_CLAIMED', 'claimed'),
    );
    await expect(
      controller.adoptSource(
        orgId,
        {
          provider: 'DIMO',
          sourceMirrorId: randomUUID(),
          idempotencyKey: 'k1',
        },
        req,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('secondary-held adopt conflict → 409', async () => {
    service.adoptProviderSource.mockRejectedValue(
      new VehicleOnboardingError('SOURCE_ALREADY_CLAIMED', 'secondary claim'),
    );
    await expect(
      controller.adoptSource(
        orgId,
        {
          provider: 'HIGH_MOBILITY',
          sourceMirrorId: randomUUID(),
          idempotencyKey: 'k2',
        },
        req,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('valid adopt delegates to service', async () => {
    service.adoptProviderSource.mockResolvedValue({ id: caseId });
    const mirror = randomUUID();
    await controller.adoptSource(
      orgId,
      { provider: 'DIMO', sourceMirrorId: mirror, idempotencyKey: 'idem' },
      req,
    );
    expect(service.adoptProviderSource).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        provider: 'DIMO',
        sourceMirrorId: mirror,
        idempotencyKey: 'idem',
      }),
    );
  });
});
