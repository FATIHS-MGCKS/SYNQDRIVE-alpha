import { BadRequestException } from '@nestjs/common';
import { PrismaClient, MotionPhysicsEvidenceTier, MotionPhysicsReferenceSource } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { VehicleMotionPhysicsReferenceRepository } from './motion-physics-reference.repository';
import { VehicleMotionPhysicsReferenceService } from './vehicle-motion-physics-reference.service';
import { MOTION_PHYSICS_REFERENCE_CHANGE_ACTIONS } from './motion-physics-reference.domain';
import { PrismaService } from '@shared/database/prisma.service';

const run = process.env.MOTION_PHYSICS_REFERENCE_PG === '1' || process.env.VO4_READINESS_PG === '1';

(run ? describe : describe.skip)('VehicleMotionPhysicsReference (postgres)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();
  const prismaService = prisma as unknown as PrismaService;
  const repository = new VehicleMotionPhysicsReferenceRepository(prismaService);
  const service = new VehicleMotionPhysicsReferenceService(repository, prismaService);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedVehicle() {
    const orgId = randomUUID();
    const vehicleId = randomUUID();
    await prisma.organization.create({
      data: { id: orgId, companyName: 'Motion PG Org', businessType: 'FLEET' },
    });
    await prisma.vehicle.create({
      data: {
        id: vehicleId,
        organizationId: orgId,
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        make: 'Tesla',
        model: 'Model 3',
        year: 2023,
        mileageKm: 1000,
        fuelType: 'ELECTRIC',
      },
    });
    return { orgId, vehicleId };
  }

  it('keeps a single active reference under concurrent create (one succeeds, one conflicts)', async () => {
    const { orgId, vehicleId } = await seedVehicle();
    const payload = {
      systemMotorPowerKw: 150,
      source: MotionPhysicsReferenceSource.OPERATOR_CONFIRMED,
    };

    const results = await Promise.allSettled([
      service.create(orgId, vehicleId, payload, 'user-1'),
      service.create(orgId, vehicleId, payload, 'user-2'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const active = await prisma.vehicleMotionPhysicsReference.findMany({
      where: { organizationId: orgId, vehicleId, isActive: true, supersededById: null },
    });
    expect(active).toHaveLength(1);
  });

  it('writes supersede + created audit rows atomically with reference create', async () => {
    const { orgId, vehicleId } = await seedVehicle();
    const first = await service.create(
      orgId,
      vehicleId,
      { systemMotorPowerKw: 100, source: MotionPhysicsReferenceSource.MISTRAL_AI },
      'u1',
    );
    await service.create(
      orgId,
      vehicleId,
      { systemMotorPowerKw: 120, source: MotionPhysicsReferenceSource.OPERATOR_CONFIRMED },
      'u2',
    );

    const supersededAudit = await prisma.vehicleMotionPhysicsReferenceChange.findFirst({
      where: { referenceId: first.id, action: MOTION_PHYSICS_REFERENCE_CHANGE_ACTIONS.SUPERSEDED },
    });
    expect(supersededAudit).not.toBeNull();

    const active = await repository.findActiveForVehicle({ organizationId: orgId, vehicleId });
    expect(active?.evidenceTier).toBe(MotionPhysicsEvidenceTier.CONFIRMED);
  });

  it('rejects verify until Phase C evidence pipeline is ready', async () => {
    const { orgId, vehicleId } = await seedVehicle();
    const ref = await service.create(
      orgId,
      vehicleId,
      { curbMassKg: 1800, source: MotionPhysicsReferenceSource.OPERATOR_CONFIRMED },
      'u1',
    );
    const docId = randomUUID();
    await prisma.vehicleDocumentExtraction.create({
      data: {
        id: docId,
        organizationId: orgId,
        vehicleId,
        status: 'APPLIED',
        documentType: 'TUV_REPORT',
        effectiveDocumentType: 'TUV_REPORT',
      },
    });

    try {
      await service.verify(orgId, vehicleId, ref.id, { documentExtractionId: docId }, 'u1');
      throw new Error('expected verify to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        reasonCodes: expect.arrayContaining(['VERIFY_EVIDENCE_PIPELINE_NOT_READY']),
      });
    }
  });
});
