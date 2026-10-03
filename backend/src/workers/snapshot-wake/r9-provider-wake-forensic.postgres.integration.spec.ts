/**
 * R9 provider wake forensic repository (PostgreSQL).
 * Run: R9_WAKE_FORENSIC_PG=1 npx jest r9-provider-wake-forensic.postgres.integration --runInBand
 */
import { PrismaClient, BusinessType, R9ProviderWakeForensicClassification } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { buildR9ProviderWakeCorrelationContext } from './r9-wake-correlation.util';
import { R9ProviderWakeForensicRepository } from './r9-provider-wake-forensic.repository';
import { R9ProviderWakeForensicTenantConflictError } from './r9-provider-wake-forensic.types';

const run = process.env.R9_WAKE_FORENSIC_PG === '1';

async function createOrg(prisma: PrismaClient): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: {
      id,
      companyName: `R9 forensic ${id.slice(0, 8)}`,
      businessType: BusinessType.RENTAL,
    },
  });
  return id;
}

async function createVehicle(prisma: PrismaClient, organizationId: string): Promise<string> {
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, created_at, updated_at
    ) VALUES (
      ${id},
      ${organizationId},
      ${`VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`},
      'VW',
      'Golf',
      2020,
      'GASOLINE'::"FuelType",
      NOW(),
      NOW()
    )
  `;
  return id;
}

(run ? describe : describe.skip)('R9ProviderWakeForensicRepository (postgres)', () => {
  const prisma = new PrismaClient();
  let repo: R9ProviderWakeForensicRepository;

  beforeAll(() => {
    repo = new R9ProviderWakeForensicRepository(prisma as any);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('concurrent duplicate upsert creates one semantic row', async () => {
    const orgId = await createOrg(prisma);
    const vehicleId = await createVehicle(prisma, orgId);
    const correlation = buildR9ProviderWakeCorrelationContext({
      organizationId: orgId,
      vehicleId,
      dimoTokenId: 187361,
      signalName: 'speed',
      wakeReason: 'SPEED_MOVEMENT',
      providerObservedAt: new Date('2026-10-01T08:00:00.000Z'),
      receivedAt: new Date('2026-10-01T08:00:01.000Z'),
      providerDeliveryId: `pg-${randomUUID()}`,
    });

    await Promise.all(
      Array.from({ length: 8 }, () =>
        repo.recordIntake({
          correlation,
          classification: R9ProviderWakeForensicClassification.ADMITTED,
        }),
      ),
    );

    const rows = await prisma.r9ProviderWakeForensic.findMany({
      where: { wakeCorrelationId: correlation.wakeCorrelationId },
    });
    expect(rows).toHaveLength(1);

    await prisma.r9ProviderWakeForensic.delete({ where: { id: rows[0].id } });
    await prisma.vehicle.delete({ where: { id: vehicleId } });
    await prisma.organization.delete({ where: { id: orgId } });
  });

  it('rejects tenant binding mismatch for an existing wakeCorrelationId', async () => {
    const orgId = await createOrg(prisma);
    const vehicleA = await createVehicle(prisma, orgId);
    const vehicleB = await createVehicle(prisma, orgId);
    const wakeCorrelationId = `manual-${randomUUID().replace(/-/g, '')}`.slice(0, 32);
    const receivedAt = new Date('2026-10-01T09:00:01.000Z');
    await prisma.r9ProviderWakeForensic.create({
      data: {
        wakeCorrelationId,
        organizationId: orgId,
        vehicleId: vehicleA,
        signalName: 'speed',
        wakeReason: 'SPEED_MOVEMENT',
        receivedAt,
        classification: R9ProviderWakeForensicClassification.ADMITTED,
      },
    });

    const mismatchedCorrelation = buildR9ProviderWakeCorrelationContext({
      organizationId: orgId,
      vehicleId: vehicleB,
      dimoTokenId: 1,
      signalName: 'speed',
      wakeReason: 'SPEED_MOVEMENT',
      providerObservedAt: new Date('2026-10-01T09:00:00.000Z'),
      receivedAt,
      providerDeliveryId: `force-different-${randomUUID()}`,
    });
    const correlation = {
      ...mismatchedCorrelation,
      wakeCorrelationId,
    };

    await expect(
      repo.recordIntake({
        correlation,
        classification: R9ProviderWakeForensicClassification.ADMITTED,
      }),
    ).rejects.toBeInstanceOf(R9ProviderWakeForensicTenantConflictError);

    await prisma.r9ProviderWakeForensic.delete({ where: { wakeCorrelationId } });
    await prisma.vehicle.deleteMany({ where: { id: { in: [vehicleA, vehicleB] } } });
    await prisma.organization.delete({ where: { id: orgId } });
  });
});
