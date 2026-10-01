import { UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { VehicleOnboardingProviderCandidateController } from '../controllers/vehicle-onboarding-provider-candidate.controller';

describe('VehicleOnboardingProviderCandidateController HTTP boundary', () => {
  const orgId = randomUUID();
  const service = { listProviderCandidates: jest.fn() };
  const controller = new VehicleOnboardingProviderCandidateController(service as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid provider', async () => {
    await expect(controller.listCandidates(orgId, 'BROKEN')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(service.listProviderCandidates).not.toHaveBeenCalled();
  });

  it('rejects malformed limit', async () => {
    await expect(controller.listCandidates(orgId, undefined, '10abc')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('delegates valid query', async () => {
    service.listProviderCandidates.mockResolvedValue({ items: [], nextCursor: null });
    await controller.listCandidates(orgId, 'DIMO', '25');
    expect(service.listProviderCandidates).toHaveBeenCalledWith(
      orgId,
      expect.objectContaining({ provider: 'DIMO', limit: 25 }),
    );
  });
});
