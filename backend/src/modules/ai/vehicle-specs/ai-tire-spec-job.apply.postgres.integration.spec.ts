import { PrismaClient, TireEvidenceSource, TireSetupStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AiTireSpecJobService } from './ai-tire-spec-job.service';
import { TireSpecAiService } from './tire-spec-ai.service';
import { PrismaService } from '@shared/database/prisma.service';

const run = process.env.AI_TIRE_SPEC_APPLY_PG === '1';

(run ? describe : describe.skip)('AiTireSpecJobService.applyResult (postgres)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();
  const service = new AiTireSpecJobService(prisma as PrismaService, {} as TireSpecAiService);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const normalizedResult = {
    matchedBrand: 'Michelin',
    matchedModel: 'Pilot Sport 4',
    widthMm: 225,
    aspectRatio: 45,
    rimDiameterInch: 17,
    loadIndex: '94',
    speedIndex: 'Y',
    seasonType: 'summer',
    newTreadDepthMm: 8,
    confidenceScore: 95,
  };

  async function seedVehicleWithSetups() {
    const orgId = randomUUID();
    const vehicleId = randomUUID();
    await prisma.organization.create({
      data: { id: orgId, companyName: 'Tire Apply PG', businessType: 'FLEET' },
    });
    await prisma.vehicle.create({
      data: {
        id: vehicleId,
        organizationId: orgId,
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        make: 'VW',
        model: 'Golf',
        year: 2020,
        mileageKm: 1000,
        fuelType: 'GASOLINE',
      },
    });

    const setupA = randomUUID();
    const setupB = randomUUID();
    await prisma.vehicleTireSetup.create({
      data: {
        id: setupA,
        vehicleId,
        organizationId: orgId,
        frontDimension: '225/45R17',
        loadIndexFront: '94',
        speedIndexFront: 'Y',
        status: TireSetupStatus.STORED,
        removedAt: new Date(),
      },
    });
    await prisma.vehicleTireSetup.create({
      data: {
        id: setupB,
        vehicleId,
        organizationId: orgId,
        frontDimension: '225/45R17',
        loadIndexFront: '94',
        speedIndexFront: 'Y',
        status: TireSetupStatus.ACTIVE,
        initialTreadEvidenceSource: TireEvidenceSource.USER_CONFIRMED,
        initialTreadFrontMm: 6.5,
      },
    });

    return { orgId, vehicleId, setupA, setupB };
  }

  async function createSucceededJob(args: {
    vehicleId: string;
    tireSetupId: string;
  }) {
    return prisma.aiTireSpecJob.create({
      data: {
        vehicleId: args.vehicleId,
        tireSetupId: args.tireSetupId,
        brand: 'Michelin',
        model: 'Pilot Sport 4',
        year: 2020,
        tireSize: '225/45R17',
        loadIndex: '94',
        speedIndex: 'Y',
        status: 'succeeded',
        normalizedResult,
        confidenceScore: 95,
        completedAt: new Date(),
      },
    });
  }

  it('rejects apply when bound setup is no longer active (stale setup A, active setup B)', async () => {
    const { orgId, vehicleId, setupA } = await seedVehicleWithSetups();
    const job = await createSucceededJob({ vehicleId, tireSetupId: setupA });

    const result = await service.applyResult(job.id, vehicleId, { organizationId: orgId });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no longer active/i);
  });

  it('allows exactly one concurrent apply; second call is idempotent replay', async () => {
    const orgId = randomUUID();
    const vehicleId = randomUUID();
    await prisma.organization.create({
      data: { id: orgId, companyName: 'Tire Concurrent PG', businessType: 'FLEET' },
    });
    await prisma.vehicle.create({
      data: {
        id: vehicleId,
        organizationId: orgId,
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        make: 'Audi',
        model: 'A4',
        year: 2018,
        mileageKm: 2000,
        fuelType: 'DIESEL',
      },
    });
    const setupId = randomUUID();
    await prisma.vehicleTireSetup.create({
      data: {
        id: setupId,
        vehicleId,
        organizationId: orgId,
        frontDimension: '225/45R17',
        loadIndexFront: '94',
        speedIndexFront: 'Y',
        status: TireSetupStatus.ACTIVE,
      },
    });

    const job = await createSucceededJob({ vehicleId, tireSetupId: setupId });

    const [first, second] = await Promise.all([
      service.applyResult(job.id, vehicleId, { organizationId: orgId }),
      service.applyResult(job.id, vehicleId, { organizationId: orgId }),
    ]);

    const successes = [first, second].filter((r) => r.success);
    expect(successes).toHaveLength(2);
    expect(successes.filter((r) => r.idempotentReplay).length).toBeGreaterThanOrEqual(1);

    const row = await prisma.aiTireSpecJob.findUnique({ where: { id: job.id } });
    expect(row?.appliedToSetupId).toBe(setupId);

    const setup = await prisma.vehicleTireSetup.findUnique({ where: { id: setupId } });
    expect(setup?.aiTireSpec).not.toBeNull();
    expect(setup?.initialTreadEvidenceSource).toBe(TireEvidenceSource.AI_ESTIMATED);
  });
});
