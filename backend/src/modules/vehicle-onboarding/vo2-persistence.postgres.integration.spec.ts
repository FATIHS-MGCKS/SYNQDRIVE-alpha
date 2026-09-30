/**
 * VO-2 persistence invariants (PostgreSQL).
 * Run: VO2_PERSISTENCE_PG=1 npx jest vo2-persistence.postgres.integration --runInBand
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const run = process.env.VO2_PERSISTENCE_PG === '1';

(run ? describe : describe.skip)('VO-2 vehicle onboarding persistence', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('has registry lifecycle column on vehicles', async () => {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.columns
      WHERE table_name = 'vehicles' AND column_name = 'registry_lifecycle'
    `;
    expect(rows[0]?.count).toBe(BigInt(1));
  });

  it('enforces one open org assignment per vehicle', async () => {
    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!org) return;
    const vehicle = await prisma.vehicle.findFirst({
      where: { organizationId: org.id },
      select: { id: true },
    });
    if (!vehicle) return;

    await expect(
      prisma.vehicleOrganizationAssignment.create({
        data: {
          id: randomUUID(),
          vehicleId: vehicle.id,
          organizationId: org.id,
          validFrom: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('classifies synthetic DIMO VIN pattern as LEGACY_SYNTHETIC when present', async () => {
    const synthetic = await prisma.vehicle.findFirst({
      where: { vin: { startsWith: 'DIMO-' } },
      select: { vinVerificationState: true, vinProvenance: true },
    });
    if (!synthetic) return;
    expect(synthetic.vinVerificationState).toBe('LEGACY_SYNTHETIC');
    expect(synthetic.vinProvenance).toBe('LEGACY_SYNTHETIC');
  });

  it('supports onboarding case without vehicleId', async () => {
    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!org) return;
    const caseId = randomUUID();
    await prisma.vehicleOnboardingCase.create({
      data: {
        id: caseId,
        organizationId: org.id,
        sourceMode: 'MANUAL',
        status: 'OPEN',
      },
    });
    const row = await prisma.vehicleOnboardingCase.findUnique({ where: { id: caseId } });
    expect(row?.vehicleId).toBeNull();
    await prisma.vehicleOnboardingCase.delete({ where: { id: caseId } });
  });

  it('lifecycle outbox idempotency key is unique', async () => {
    const key = `vo2-test-${randomUUID()}`;
    const id1 = randomUUID();
    await prisma.vehicleRegistryLifecycleOutbox.create({
      data: {
        id: id1,
        eventId: randomUUID(),
        eventType: 'VEHICLE_ACTIVATED',
        payloadVersion: 1,
        payload: { contractVersion: 1 },
        occurredAt: new Date(),
        idempotencyKey: key,
      },
    });
    await expect(
      prisma.vehicleRegistryLifecycleOutbox.create({
        data: {
          id: randomUUID(),
          eventId: randomUUID(),
          eventType: 'VEHICLE_ACTIVATED',
          payloadVersion: 1,
          payload: { contractVersion: 1 },
          occurredAt: new Date(),
          idempotencyKey: key,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await prisma.vehicleRegistryLifecycleOutbox.delete({ where: { id: id1 } });
  });
});
