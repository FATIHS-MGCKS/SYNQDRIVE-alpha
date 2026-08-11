import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { EvaluationsEntityReferenceWriteService } from './evaluations-entity-reference-write.service';

/**
 * Real-database write-gate integration. Gated behind EVALUATIONS_E2_DB_INTEGRATION
 * (needs a disposable PostgreSQL with the schema pushed) so standard CI — where a
 * greenfield migrate chain is blocked by the pre-existing P3018 baseline — skips
 * it. Run locally with:
 *   EVALUATIONS_E2_DB_INTEGRATION=1 DATABASE_URL=... jest <this file>
 */
const RUN_DB_INTEGRATION = process.env.EVALUATIONS_E2_DB_INTEGRATION === '1';
const describeDb = RUN_DB_INTEGRATION ? describe : describe.skip;

describeDb('Evaluations entity reference write gate — real DB integration', () => {
  const prisma = new PrismaClient();
  const service = new EvaluationsEntityReferenceWriteService(
    prisma as unknown as PrismaService,
  );

  let orgA = '';
  let orgB = '';
  let insightA = '';
  let vehicleA = '';
  let vehicleB = '';

  beforeAll(async () => {
    const a = await prisma.organization.create({
      data: { companyName: 'E2 DB Org A', businessType: 'RENTAL' },
      select: { id: true },
    });
    const b = await prisma.organization.create({
      data: { companyName: 'E2 DB Org B', businessType: 'RENTAL' },
      select: { id: true },
    });
    orgA = a.id;
    orgB = b.id;

    const run = await prisma.dashboardInsightRun.create({
      data: { organizationId: orgA, trigger: 'test', startedAt: new Date() },
      select: { id: true },
    });
    const insight = await prisma.dashboardInsight.create({
      data: {
        organizationId: orgA,
        runId: run.id,
        type: 'TIGHT_HANDOVER',
        severity: 'INFO',
        title: 't',
        message: 'm',
        entityScope: 'VEHICLE',
        dedupeKey: `dk-${run.id}`,
      },
      select: { id: true },
    });
    insightA = insight.id;

    const vA = await prisma.vehicle.create({
      data: {
        organizationId: orgA,
        vin: `VINA${Date.now()}`,
        make: 'X',
        model: 'Y',
        year: 2026,
        fuelType: 'ELECTRIC',
      },
      select: { id: true },
    });
    const vB = await prisma.vehicle.create({
      data: {
        organizationId: orgB,
        vin: `VINB${Date.now()}`,
        make: 'X',
        model: 'Y',
        year: 2026,
        fuelType: 'ELECTRIC',
      },
      select: { id: true },
    });
    vehicleA = vA.id;
    vehicleB = vB.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists a fully same-tenant reference (A owner + A target)', async () => {
    const result = await service.createReference({
      organizationId: orgA,
      stationId: null,
      ownerType: 'INSIGHT',
      ownerId: insightA,
      entityType: 'VEHICLE',
      entityId: vehicleA,
      relationType: 'PRIMARY_SUBJECT',
    });
    expect(result.id).toBeTruthy();
    const persisted = await prisma.evaluationsEntityReference.findFirst({
      where: { organizationId: orgA, entityId: vehicleA },
      select: { id: true, organizationId: true },
    });
    expect(persisted?.organizationId).toBe(orgA);
  });

  it('rejects a cross-tenant target (A owner + B vehicle) and persists nothing', async () => {
    await expect(
      service.createReference({
        organizationId: orgA,
        stationId: null,
        ownerType: 'INSIGHT',
        ownerId: insightA,
        entityType: 'VEHICLE',
        entityId: vehicleB,
        relationType: 'PRIMARY_SUBJECT',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const leaked = await prisma.evaluationsEntityReference.count({
      where: { organizationId: orgA, entityId: vehicleB },
    });
    expect(leaked).toBe(0);
  });

  it('has zero cross-tenant persisted rows overall', async () => {
    // No reference in org-a may point at an org-b-owned vehicle.
    const orgBVehicleIds = (
      await prisma.vehicle.findMany({ where: { organizationId: orgB }, select: { id: true } })
    ).map((v) => v.id);
    const crossTenant = await prisma.evaluationsEntityReference.count({
      where: { organizationId: orgA, entityType: 'VEHICLE', entityId: { in: orgBVehicleIds } },
    });
    expect(crossTenant).toBe(0);
  });

  it('is idempotent for a duplicate same-tenant relation retry', async () => {
    const input = {
      organizationId: orgA,
      stationId: null,
      ownerType: 'INSIGHT' as const,
      ownerId: insightA,
      entityType: 'VEHICLE' as const,
      entityId: vehicleA,
      relationType: 'CONTRIBUTOR' as const,
    };
    const first = await service.createReference(input);
    const second = await service.createReference(input);
    expect(second.id).toBe(first.id);
  });
});
