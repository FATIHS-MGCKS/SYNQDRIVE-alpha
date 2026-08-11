import { EvaluationsAnalyticsScopeService } from './evaluations-analytics-scope.service';
import { EvaluationsAnalyticsService } from './evaluations-analytics.service';
import { EvaluationsEntityReferenceRepository } from './evaluations-entity-reference.repository';

/**
 * End-to-end tenant isolation over an in-memory Prisma fake exercising the real
 * repository + service + scope resolver. Proves an actor authorized for org-a
 * can never read org-b references, and that station scope is enforced beneath
 * the guard layer (defense in depth).
 */

interface Row {
  id: string;
  organizationId: string;
  stationId: string | null;
  ownerType: 'INSIGHT' | 'ANALYTICS_GROUP';
  ownerId: string;
  entityType: string;
  entityId: string;
  relationType: string;
  dedupeKey: string;
  createdAt: Date;
}

const REFERENCE = new Date('2026-08-10T00:00:00.000Z');

function matches(row: Row, where: Record<string, unknown>): boolean {
  if (where.organizationId && row.organizationId !== where.organizationId) return false;
  const createdAt = where.createdAt as { gte: Date; lt: Date } | undefined;
  if (createdAt) {
    if (row.createdAt < createdAt.gte || row.createdAt >= createdAt.lt) return false;
  }
  const stationId = where.stationId as { in: string[] } | undefined;
  if (stationId) {
    if (row.stationId === null || !stationId.in.includes(row.stationId)) return false;
  }
  const entityType = where.entityType as { in: string[] } | undefined;
  if (entityType && !entityType.in.includes(row.entityType)) return false;
  const relationType = where.relationType as { in: string[] } | undefined;
  if (relationType && !relationType.in.includes(row.relationType)) return false;
  const and = where.AND as Array<{ OR: Array<Record<string, unknown>> }> | undefined;
  if (and) {
    for (const clause of and) {
      const ok = clause.OR.some((c) => {
        const et = c.entityType as string;
        const ids = c.entityId as { in: string[] };
        return row.entityType === et && ids.in.includes(row.entityId);
      });
      if (!ok) return false;
    }
  }
  return true;
}

function makeFakePrisma(rows: Row[], stations: Array<{ id: string; organizationId: string }>) {
  return {
    organization: {
      findUnique: async () => ({ timezone: 'Europe/Berlin' }),
    },
    station: {
      findMany: async (args: {
        where: { organizationId: string; id: { in: string[] } };
        select: unknown;
      }) =>
        stations
          .filter(
            (s) =>
              s.organizationId === args.where.organizationId &&
              args.where.id.in.includes(s.id),
          )
          .map((s) => ({ id: s.id })),
      findFirst: async (args: { where: { id: string; organizationId: string } }) => {
        const found = stations.find(
          (s) => s.id === args.where.id && s.organizationId === args.where.organizationId,
        );
        return found ? { timezone: 'Europe/Berlin' } : null;
      },
    },
    evaluationsEntityReference: {
      count: async (args: { where: Record<string, unknown> }) =>
        rows.filter((r) => matches(r, args.where)).length,
      findMany: async (args: {
        where: Record<string, unknown>;
        skip: number;
        take: number;
      }) => rows.filter((r) => matches(r, args.where)).slice(args.skip, args.skip + args.take),
      groupBy: async (args: { by: string[]; where: Record<string, unknown> }) => {
        const col = args.by[0];
        const counts = new Map<string, number>();
        for (const r of rows.filter((row) => matches(row, args.where))) {
          const key = String((r as unknown as Record<string, unknown>)[col]);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return [...counts.entries()].map(([k, n]) => ({
          [col]: k,
          _count: { _all: n },
        }));
      },
    },
  } as never;
}

function row(partial: Partial<Row> & Pick<Row, 'id' | 'organizationId'>): Row {
  return {
    stationId: null,
    ownerType: 'INSIGHT',
    ownerId: 'ins-1',
    entityType: 'VEHICLE',
    entityId: 'veh-1',
    relationType: 'PRIMARY_SUBJECT',
    dedupeKey: partial.id,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...partial,
  };
}

describe('Evaluations analytics tenant isolation (org-a vs org-b)', () => {
  const rows: Row[] = [
    row({ id: 'a1', organizationId: 'org-a', stationId: 's-a1', entityType: 'VEHICLE', entityId: 'veh-1' }),
    row({ id: 'a2', organizationId: 'org-a', stationId: 's-a2', entityType: 'CUSTOMER', entityId: 'cus-1' }),
    row({ id: 'b1', organizationId: 'org-b', stationId: 's-b1', entityType: 'VEHICLE', entityId: 'veh-1' }),
    row({ id: 'b2', organizationId: 'org-b', stationId: 's-b2', entityType: 'CUSTOMER', entityId: 'cus-1' }),
    row({ id: 'b3', organizationId: 'org-b', stationId: 's-b3', entityType: 'INVOICE', entityId: 'inv-9' }),
  ];
  const stations = [
    { id: 's-a1', organizationId: 'org-a' },
    { id: 's-a2', organizationId: 'org-a' },
    { id: 's-b1', organizationId: 'org-b' },
    { id: 's-b2', organizationId: 'org-b' },
    { id: 's-b3', organizationId: 'org-b' },
  ];

  function build(access: {
    bypassScope: boolean;
    allowedStationIds: string[] | null;
  }) {
    const prisma = makeFakePrisma(rows, stations);
    const stationAccess = { resolve: async () => ({ ...access, membershipRole: 'X' }) } as never;
    const scopeService = new EvaluationsAnalyticsScopeService(prisma, stationAccess);
    const repo = new EvaluationsEntityReferenceRepository(prisma);
    const service = new EvaluationsAnalyticsService(repo);
    return { scopeService, service };
  }

  it('an org-a admin never sees org-b references in summary or detail', async () => {
    const { scopeService, service } = build({ bypassScope: true, allowedStationIds: null });
    const scope = await scopeService.resolveAuthorizedScope({
      actor: { id: 'u-a', organizationId: 'org-a' },
      orgId: 'org-a',
      requestedStationIds: null,
      periodType: 'YEAR',
      reference: REFERENCE,
    });
    const summary = await service.getSummary({ scope, filters: {}, groupBy: 'ENTITY_TYPE' });
    expect(summary.aggregateTotal).toBe(2); // only a1, a2

    const detail = await service.getDetail({ scope, filters: {} });
    expect(detail.totalCount).toBe(2);
    for (const item of detail.items) {
      expect(item.reference.organizationId).toBe('org-a');
    }
  });

  it('a shared natural entity id (veh-1) does not leak the other tenant row', async () => {
    const { scopeService, service } = build({ bypassScope: true, allowedStationIds: null });
    const scope = await scopeService.resolveAuthorizedScope({
      actor: { id: 'u-a', organizationId: 'org-a' },
      orgId: 'org-a',
      requestedStationIds: null,
      periodType: 'YEAR',
      reference: REFERENCE,
    });
    const detail = await service.getDetail({
      scope,
      filters: { vehicleIds: ['veh-1'] },
    });
    expect(detail.totalCount).toBe(1);
    expect(detail.items[0].reference.organizationId).toBe('org-a');
  });

  it('a station-scoped org-a actor only sees allowed-station references', async () => {
    const { scopeService, service } = build({
      bypassScope: false,
      allowedStationIds: ['s-a1'],
    });
    const scope = await scopeService.resolveAuthorizedScope({
      actor: { id: 'u-a', organizationId: 'org-a' },
      orgId: 'org-a',
      requestedStationIds: null,
      periodType: 'YEAR',
      reference: REFERENCE,
    });
    const detail = await service.getDetail({ scope, filters: {} });
    expect(detail.totalCount).toBe(1);
    expect(detail.items[0].reference.stationId).toBe('s-a1');
  });
});
