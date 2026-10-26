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

  it('rejects tire setup mismatch', async () => {
    const prisma = {
      aiTireSpecJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: jobId,
          status: 'succeeded',
          vehicleId,
          tireSetupId: 'other-setup',
          normalizedResult,
          appliedAt: null,
        }),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: vehicleId }) },
      vehicleTireSetup: {
        findFirst: jest.fn().mockResolvedValue({
          id: setupId,
          initialTreadEvidenceSource: null,
          initialTreadDepthMm: null,
          initialTreadFrontMm: null,
          initialTreadRearMm: null,
        }),
      },
    };
    const service = buildService(prisma);
    const result = await service.applyResult(jobId, vehicleId, { organizationId: orgId });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/tire setup/i);
  });

  it('applies with AI_ESTIMATED baseline and does not force USER_CONFIRMED', async () => {
    const update = jest.fn();
    const jobUpdate = jest.fn();
    const prisma = {
      aiTireSpecJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: jobId,
          status: 'succeeded',
          vehicleId,
          tireSetupId: setupId,
          normalizedResult,
          confidenceScore: 0.95,
          completedAt: new Date(),
          appliedAt: null,
        }),
        update: jobUpdate,
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: vehicleId }) },
      vehicleTireSetup: {
        findFirst: jest.fn().mockResolvedValue({
          id: setupId,
          initialTreadEvidenceSource: null,
          initialTreadDepthMm: null,
          initialTreadFrontMm: null,
          initialTreadRearMm: null,
        }),
        update,
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
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
          normalizedResult,
          appliedAt: new Date(),
          appliedToSetupId: setupId,
        }),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: vehicleId }) },
      vehicleTireSetup: {
        findFirst: jest.fn().mockResolvedValue({ id: setupId }),
      },
    };
    const service = buildService(prisma);
    const result = await service.applyResult(jobId, vehicleId, { organizationId: orgId });
    expect(result.success).toBe(true);
    expect(result.idempotentReplay).toBe(true);
  });

  it('allows explicit owner spec confirmation on persisted blob only', async () => {
    const update = jest.fn();
    const prisma = {
      aiTireSpecJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: jobId,
          status: 'succeeded',
          vehicleId,
          tireSetupId: null,
          normalizedResult,
          confidenceScore: 95,
          completedAt: new Date(),
          appliedAt: null,
        }),
        update: jest.fn(),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: vehicleId }) },
      vehicleTireSetup: {
        findFirst: jest.fn().mockResolvedValue({
          id: setupId,
          initialTreadEvidenceSource: TireEvidenceSource.USER_CONFIRMED,
          initialTreadDepthMm: 6,
          initialTreadFrontMm: null,
          initialTreadRearMm: null,
        }),
        update,
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
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
