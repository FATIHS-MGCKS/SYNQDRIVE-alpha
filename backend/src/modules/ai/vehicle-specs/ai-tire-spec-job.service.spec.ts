import { ForbiddenException } from '@nestjs/common';
import { TireEvidenceSource, TireSetupStatus } from '@prisma/client';
import { AiTireSpecJobService } from './ai-tire-spec-job.service';
import { TireSpecAiService } from './tire-spec-ai.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('AiTireSpecJobService.applyResult', () => {
  const orgId = 'org-1';
  const vehicleId = 'vehicle-a';
  const otherVehicleId = 'vehicle-b';
  const setupId = 'setup-1';
  const jobId = 'job-1';

  const normalizedResult = {
    matchedBrand: 'Michelin',
    matchedModel: 'Pilot',
    matchedVariant: null,
    widthMm: 225,
    aspectRatio: 45,
    rimDiameterInch: 17,
    loadIndex: '94',
    speedIndex: 'Y',
    seasonType: 'summer',
    newTreadDepthMm: 8.5,
    confidenceScore: 95,
  };

  function buildService(prisma: object) {
    return new AiTireSpecJobService(prisma as PrismaService, {} as TireSpecAiService);
  }

  it('rejects unbound legacy jobs', async () => {
    const prisma = {
      aiTireSpecJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: jobId,
          status: 'succeeded',
          vehicleId: null,
          normalizedResult,
        }),
      },
    };
    const service = buildService(prisma);
    const result = await service.applyResult(jobId, vehicleId, { organizationId: orgId });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not bound/i);
  });

  it('rejects wrong vehicle binding', async () => {
    const prisma = {
      aiTireSpecJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: jobId,
          status: 'succeeded',
          vehicleId: otherVehicleId,
          normalizedResult,
        }),
      },
    };
    const service = buildService(prisma);
    const result = await service.applyResult(jobId, vehicleId, { organizationId: orgId });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/does not match/i);
  });

  it('rejects cross-tenant vehicle', async () => {
    const prisma = {
      aiTireSpecJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: jobId,
          status: 'succeeded',
          vehicleId,
          tireSetupId: null,
          normalizedResult,
          appliedAt: null,
        }),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = buildService(prisma);
    await expect(
      service.applyResult(jobId, vehicleId, { organizationId: orgId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects stale bound setup that is not active', async () => {
    const prisma = {
      aiTireSpecJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: jobId,
          status: 'succeeded',
          vehicleId,
          tireSetupId: 'setup-stale',
          tireSize: '225/45R17',
          loadIndex: '94',
          speedIndex: 'Y',
          normalizedResult,
          appliedAt: null,
        }),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: vehicleId }) },
      vehicleTireSetup: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'setup-stale',
          vehicleId,
          status: 'STORED',
          removedAt: new Date(),
          frontDimension: '225/45R17',
          rearDimension: null,
          loadIndexFront: '94',
          speedIndexFront: 'Y',
          loadIndexRear: null,
          speedIndexRear: null,
          initialTreadEvidenceSource: null,
          initialTreadDepthMm: null,
          initialTreadFrontMm: null,
          initialTreadRearMm: null,
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: setupId,
            vehicleId,
            status: 'ACTIVE',
            removedAt: null,
            frontDimension: '225/45R17',
            rearDimension: null,
            loadIndexFront: '94',
            speedIndexFront: 'Y',
            loadIndexRear: null,
            speedIndexRear: null,
          },
        ]),
      },
    };
    const service = buildService(prisma);
    const result = await service.applyResult(jobId, vehicleId, { organizationId: orgId });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no longer active/i);
  });

  const activeSetupRow = {
    id: setupId,
    vehicleId,
    status: 'ACTIVE',
    removedAt: null,
    frontDimension: '225/45R17',
    rearDimension: null,
    loadIndexFront: '94',
    speedIndexFront: 'Y',
    loadIndexRear: null,
    speedIndexRear: null,
    initialTreadEvidenceSource: null,
    initialTreadDepthMm: null,
    initialTreadFrontMm: null,
    initialTreadRearMm: null,
  };

  it('applies with AI_ESTIMATED baseline and does not force USER_CONFIRMED', async () => {
    const update = jest.fn();
    const prisma = {
      aiTireSpecJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: jobId,
          status: 'succeeded',
          vehicleId,
          tireSetupId: setupId,
          tireSize: '225/45R17',
          loadIndex: '94',
          speedIndex: 'Y',
          normalizedResult,
          confidenceScore: 0.95,
          completedAt: new Date(),
          appliedAt: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: vehicleId }) },
      vehicleTireSetup: {
        findFirst: jest.fn().mockResolvedValue(activeSetupRow),
        findMany: jest.fn().mockResolvedValue([activeSetupRow]),
        update,
      },
      $transaction: jest.fn(async (fn: (tx: object) => Promise<unknown>) =>
        fn({
          aiTireSpecJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          vehicleTireSetup: { update },
        }),
      ),
    };
    const service = buildService(prisma);
    const result = await service.applyResult(jobId, vehicleId, {
      organizationId: orgId,
      userConfirmedSpec: false,
    });
    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalled();
    const data = update.mock.calls[0][0].data;
    expect(data.aiTireSpec.userConfirmedSpec).toBe(false);
    expect(data.initialTreadEvidenceSource).toBe(TireEvidenceSource.AI_ESTIMATED);
  });

  it('supports idempotent replay to the same setup', async () => {
    const prisma = {
      aiTireSpecJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: jobId,
          status: 'succeeded',
          vehicleId,
          tireSetupId: setupId,
          tireSize: '225/45R17',
          loadIndex: '94',
          speedIndex: 'Y',
          normalizedResult,
          appliedAt: new Date(),
          appliedToSetupId: setupId,
        }),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: vehicleId }) },
      vehicleTireSetup: {
        findFirst: jest.fn().mockResolvedValue(activeSetupRow),
        findMany: jest.fn().mockResolvedValue([activeSetupRow]),
      },
    };
    const service = buildService(prisma);
    const result = await service.applyResult(jobId, vehicleId, { organizationId: orgId });
    expect(result.success).toBe(true);
    expect(result.idempotentReplay).toBe(true);
  });

  it('allows explicit owner spec confirmation on persisted blob only', async () => {
    const update = jest.fn();
    const protectedSetup = {
      ...activeSetupRow,
      initialTreadEvidenceSource: TireEvidenceSource.USER_CONFIRMED,
      initialTreadDepthMm: 6,
    };
    const prisma = {
      aiTireSpecJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: jobId,
          status: 'succeeded',
          vehicleId,
          tireSetupId: setupId,
          tireSize: '225/45R17',
          loadIndex: '94',
          speedIndex: 'Y',
          normalizedResult,
          confidenceScore: 95,
          completedAt: new Date(),
          appliedAt: null,
        }),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: vehicleId }) },
      vehicleTireSetup: {
        findFirst: jest.fn().mockResolvedValue(protectedSetup),
        findMany: jest.fn().mockResolvedValue([protectedSetup]),
        update,
      },
      $transaction: jest.fn(async (fn: (tx: object) => Promise<unknown>) =>
        fn({
          aiTireSpecJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          vehicleTireSetup: { update },
        }),
      ),
    };
    const service = buildService(prisma);
    await service.applyResult(jobId, vehicleId, {
      organizationId: orgId,
      userConfirmedSpec: true,
    });
    const data = update.mock.calls[0][0].data;
    expect(data.aiTireSpec.userConfirmedSpec).toBe(true);
    expect(data.initialTreadEvidenceSource).toBeUndefined();
  });
});
