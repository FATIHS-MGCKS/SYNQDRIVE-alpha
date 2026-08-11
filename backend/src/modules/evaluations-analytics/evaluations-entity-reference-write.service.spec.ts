import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { EvaluationsEntityReference } from '@synq/evaluations-analytics/evaluations-analytics.contract';
import { EvaluationsAnalyticsValidationError } from '@synq/evaluations-analytics/evaluations-analytics.validator';
import { EvaluationsEntityReferenceWriteService } from './evaluations-entity-reference-write.service';

const ORGS = new Set(['org-a', 'org-b']);
const STATIONS = [
  { id: 's-a1', organizationId: 'org-a' },
  { id: 's-b1', organizationId: 'org-b' },
];

function makeService() {
  const store = new Map<string, { id: string }>();
  const upsert = jest.fn(
    async (args: {
      where: { organizationId_dedupeKey: { organizationId: string; dedupeKey: string } };
      create: unknown;
    }) => {
      const key = `${args.where.organizationId_dedupeKey.organizationId}|${args.where.organizationId_dedupeKey.dedupeKey}`;
      if (!store.has(key)) store.set(key, { id: `ref-${store.size + 1}` });
      return store.get(key)!;
    },
  );
  const prisma = {
    organization: {
      findUnique: jest.fn(async (args: { where: { id: string } }) =>
        ORGS.has(args.where.id) ? { id: args.where.id } : null,
      ),
    },
    station: {
      findFirst: jest.fn(async (args: { where: { id: string; organizationId: string } }) => {
        const found = STATIONS.find(
          (s) => s.id === args.where.id && s.organizationId === args.where.organizationId,
        );
        return found ? { id: found.id } : null;
      }),
    },
    evaluationsEntityReference: { upsert },
  } as never;
  return { service: new EvaluationsEntityReferenceWriteService(prisma), upsert };
}

const baseRef: EvaluationsEntityReference = {
  organizationId: 'org-a',
  stationId: 's-a1',
  ownerType: 'INSIGHT',
  ownerId: 'ins-1',
  entityType: 'VEHICLE',
  entityId: 'veh-1',
  relationType: 'PRIMARY_SUBJECT',
};

describe('EvaluationsEntityReferenceWriteService', () => {
  it('creates a valid same-tenant reference (org + station match)', async () => {
    const { service, upsert } = makeService();
    const result = await service.createReference(baseRef);
    expect(result.id).toMatch(/^ref-/);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects a reference whose station belongs to another organization', async () => {
    const { service } = makeService();
    await expect(
      service.createReference({ ...baseRef, stationId: 's-b1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a STATION target that belongs to another organization', async () => {
    const { service } = makeService();
    await expect(
      service.createReference({
        ...baseRef,
        stationId: null,
        entityType: 'STATION',
        entityId: 's-b1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an unknown organization', async () => {
    const { service } = makeService();
    await expect(
      service.createReference({ ...baseRef, organizationId: 'org-x', stationId: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid entity/relation types and embedded PII', async () => {
    const { service } = makeService();
    await expect(
      service.createReference({ ...baseRef, entityType: 'NOPE' as never }),
    ).rejects.toBeInstanceOf(EvaluationsAnalyticsValidationError);
    await expect(
      service.createReference({ ...baseRef, relationType: 'NOPE' as never }),
    ).rejects.toBeInstanceOf(EvaluationsAnalyticsValidationError);
    await expect(
      service.createReference({
        ...baseRef,
        customerName: 'leak',
      } as unknown as EvaluationsEntityReference),
    ).rejects.toBeInstanceOf(EvaluationsAnalyticsValidationError);
  });

  it('is idempotent for a duplicate relation retry', async () => {
    const { service } = makeService();
    const first = await service.createReference({ ...baseRef, stationId: null });
    const second = await service.createReference({ ...baseRef, stationId: null });
    expect(second.id).toBe(first.id);
  });
});
