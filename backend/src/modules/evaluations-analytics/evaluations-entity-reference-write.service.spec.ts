import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { EvaluationsEntityReference } from '@synq/evaluations-analytics/evaluations-analytics.contract';
import { EvaluationsAnalyticsValidationError } from '@synq/evaluations-analytics/evaluations-analytics.validator';
import { EvaluationsEntityReferenceWriteService } from './evaluations-entity-reference-write.service';

const ORGS = new Set(['org-a', 'org-b']);
const rows = {
  vehicles: [
    { id: 'veh-a', org: 'org-a' },
    { id: 'veh-b', org: 'org-b' },
  ],
  stations: [
    { id: 's-a', org: 'org-a' },
    { id: 's-b', org: 'org-b' },
  ],
  insights: [
    { id: 'ins-a', org: 'org-a' },
    { id: 'ins-b', org: 'org-b' },
  ],
};

function scoped(seed: Array<{ id: string; org: string }>) {
  return async (args: { where: { id: string; organizationId: string } }) => {
    const found = seed.find(
      (r) => r.id === args.where.id && r.org === args.where.organizationId,
    );
    return found ? { id: found.id } : null;
  };
}

function makeService() {
  const store = new Map<string, { id: string }>();
  const upsert = jest.fn(
    async (args: {
      where: { organizationId_dedupeKey: { organizationId: string; dedupeKey: string } };
    }) => {
      const key = `${args.where.organizationId_dedupeKey.organizationId}|${args.where.organizationId_dedupeKey.dedupeKey}`;
      if (!store.has(key)) store.set(key, { id: `ref-${store.size + 1}` });
      return store.get(key)!;
    },
  );
  const tx = {
    organization: {
      findUnique: async (args: { where: { id: string } }) =>
        ORGS.has(args.where.id) ? { id: args.where.id } : null,
    },
    vehicle: { findFirst: scoped(rows.vehicles) },
    station: { findFirst: scoped(rows.stations) },
    dashboardInsight: { findFirst: scoped(rows.insights) },
    // Remaining target delegates return null (not seeded) unless needed.
    booking: { findFirst: async () => null },
    customer: { findFirst: async () => null },
    orgInvoice: { findFirst: async () => null },
    orgTask: { findFirst: async () => null },
    serviceCase: { findFirst: async () => null },
    vehicleDamage: { findFirst: async () => null },
    generatedDocument: { findFirst: async () => null },
    paymentTransaction: { findFirst: async () => null },
    organizationMembership: { findFirst: async () => null },
    evaluationsEntityReference: { upsert },
  };
  const prisma = {
    $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
  } as never;
  return { service: new EvaluationsEntityReferenceWriteService(prisma), upsert };
}

const baseRef: EvaluationsEntityReference = {
  organizationId: 'org-a',
  stationId: 's-a',
  ownerType: 'INSIGHT',
  ownerId: 'ins-a',
  entityType: 'VEHICLE',
  entityId: 'veh-a',
  relationType: 'PRIMARY_SUBJECT',
};

describe('EvaluationsEntityReferenceWriteService', () => {
  it('creates a fully same-tenant reference (org + owner + target + station)', async () => {
    const { service, upsert } = makeService();
    const result = await service.createReference(baseRef);
    expect(result.id).toMatch(/^ref-/);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects a cross-tenant target entity', async () => {
    const { service } = makeService();
    await expect(
      service.createReference({ ...baseRef, entityId: 'veh-b' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a cross-tenant owner', async () => {
    const { service } = makeService();
    await expect(
      service.createReference({ ...baseRef, ownerId: 'ins-b' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a cross-tenant station', async () => {
    const { service } = makeService();
    await expect(
      service.createReference({ ...baseRef, stationId: 's-b' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an unsupported target type (DRIVER) fail-closed', async () => {
    const { service } = makeService();
    await expect(
      service.createReference({ ...baseRef, entityType: 'DRIVER', entityId: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unsupported owner type (ANALYTICS_GROUP) fail-closed', async () => {
    const { service } = makeService();
    await expect(
      service.createReference({ ...baseRef, ownerType: 'ANALYTICS_GROUP', ownerId: 'g1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown organization', async () => {
    const { service } = makeService();
    await expect(
      service.createReference({ ...baseRef, organizationId: 'org-x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid enums and embedded PII before any lookup', async () => {
    const { service } = makeService();
    await expect(
      service.createReference({ ...baseRef, entityType: 'NOPE' as never }),
    ).rejects.toBeInstanceOf(EvaluationsAnalyticsValidationError);
    await expect(
      service.createReference({
        ...baseRef,
        customerName: 'leak',
      } as unknown as EvaluationsEntityReference),
    ).rejects.toBeInstanceOf(EvaluationsAnalyticsValidationError);
  });

  it('is idempotent for a duplicate same-tenant relation retry', async () => {
    const { service } = makeService();
    const first = await service.createReference(baseRef);
    const second = await service.createReference(baseRef);
    expect(second.id).toBe(first.id);
  });
});
