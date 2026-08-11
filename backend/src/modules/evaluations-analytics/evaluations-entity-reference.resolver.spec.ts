import {
  EVALUATIONS_PERSISTABLE_ENTITY_TYPES,
  EVALUATIONS_PERSISTABLE_OWNER_TYPES,
  isPersistableEvaluationsEntityType,
  isPersistableEvaluationsOwnerType,
  resolveEvaluationsOwnerInOrganization,
  resolveEvaluationsTargetInOrganization,
  type EvaluationsResolverClient,
} from './evaluations-entity-reference.resolver';

/**
 * In-memory tenant-scoped client fake: each delegate returns a row only when the
 * id exists AND belongs to the queried organization — mirroring
 * `WHERE id = ? AND organization_id = ?`.
 */
function makeClient(seed: {
  vehicles?: Array<{ id: string; org: string }>;
  bookings?: Array<{ id: string; org: string }>;
  customers?: Array<{ id: string; org: string }>;
  stations?: Array<{ id: string; org: string }>;
  invoices?: Array<{ id: string; org: string }>;
  tasks?: Array<{ id: string; org: string }>;
  serviceCases?: Array<{ id: string; org: string }>;
  damages?: Array<{ id: string; org: string }>;
  documents?: Array<{ id: string; org: string }>;
  payments?: Array<{ id: string; org: string }>;
  memberships?: Array<{ userId: string; org: string }>;
  insights?: Array<{ id: string; org: string }>;
}): EvaluationsResolverClient {
  const byId =
    (rows: Array<{ id: string; org: string }> = []) =>
    async (args: { where: { id: string; organizationId: string } }) => {
      const found = rows.find(
        (r) => r.id === args.where.id && r.org === args.where.organizationId,
      );
      return found ? { id: found.id } : null;
    };
  return {
    vehicle: { findFirst: byId(seed.vehicles) },
    booking: { findFirst: byId(seed.bookings) },
    customer: { findFirst: byId(seed.customers) },
    station: { findFirst: byId(seed.stations) },
    orgInvoice: { findFirst: byId(seed.invoices) },
    orgTask: { findFirst: byId(seed.tasks) },
    serviceCase: { findFirst: byId(seed.serviceCases) },
    vehicleDamage: { findFirst: byId(seed.damages) },
    generatedDocument: { findFirst: byId(seed.documents) },
    paymentTransaction: { findFirst: byId(seed.payments) },
    dashboardInsight: { findFirst: byId(seed.insights) },
    organizationMembership: {
      findFirst: async (args: { where: { userId: string; organizationId: string } }) => {
        const found = (seed.memberships ?? []).find(
          (m) => m.userId === args.where.userId && m.org === args.where.organizationId,
        );
        return found ? { id: `mem-${found.userId}` } : null;
      },
    },
  } as unknown as EvaluationsResolverClient;
}

describe('Evaluations entity reference target resolver', () => {
  it('accepts same-organization targets for every supported entity type', async () => {
    const client = makeClient({
      vehicles: [{ id: 'v1', org: 'org-a' }],
      bookings: [{ id: 'b1', org: 'org-a' }],
      customers: [{ id: 'c1', org: 'org-a' }],
      stations: [{ id: 'st1', org: 'org-a' }],
      invoices: [{ id: 'i1', org: 'org-a' }],
      tasks: [{ id: 't1', org: 'org-a' }],
      serviceCases: [{ id: 'sc1', org: 'org-a' }],
      damages: [{ id: 'd1', org: 'org-a' }],
      documents: [{ id: 'doc1', org: 'org-a' }],
      payments: [{ id: 'p1', org: 'org-a' }],
      memberships: [{ userId: 'u1', org: 'org-a' }],
    });
    const cases: Array<[Parameters<typeof resolveEvaluationsTargetInOrganization>[2], string]> = [
      ['VEHICLE', 'v1'],
      ['BOOKING', 'b1'],
      ['CUSTOMER', 'c1'],
      ['STATION', 'st1'],
      ['INVOICE', 'i1'],
      ['TASK', 't1'],
      ['SERVICE_CASE', 'sc1'],
      ['DAMAGE', 'd1'],
      ['DOCUMENT', 'doc1'],
      ['PAYMENT', 'p1'],
      ['USER', 'u1'],
    ];
    for (const [type, id] of cases) {
      const res = await resolveEvaluationsTargetInOrganization(client, 'org-a', type, id);
      expect(res).toEqual({ persistable: true, belongsToOrganization: true });
    }
  });

  it('rejects cross-tenant targets for every supported entity type', async () => {
    const client = makeClient({
      vehicles: [{ id: 'v1', org: 'org-b' }],
      bookings: [{ id: 'b1', org: 'org-b' }],
      customers: [{ id: 'c1', org: 'org-b' }],
    });
    for (const [type, id] of [
      ['VEHICLE', 'v1'],
      ['BOOKING', 'b1'],
      ['CUSTOMER', 'c1'],
    ] as const) {
      const res = await resolveEvaluationsTargetInOrganization(client, 'org-a', type, id);
      expect(res).toEqual({ persistable: true, belongsToOrganization: false });
    }
  });

  it('treats a wrong-type id as not belonging (VEHICLE id that is actually a booking)', async () => {
    const client = makeClient({ bookings: [{ id: 'b1', org: 'org-a' }] });
    const res = await resolveEvaluationsTargetInOrganization(client, 'org-a', 'VEHICLE', 'b1');
    expect(res.belongsToOrganization).toBe(false);
  });

  it('marks unsupported target types (DRIVER) as not persistable', async () => {
    const client = makeClient({});
    const res = await resolveEvaluationsTargetInOrganization(client, 'org-a', 'DRIVER', 'x');
    expect(res.persistable).toBe(false);
    expect(isPersistableEvaluationsEntityType('DRIVER')).toBe(false);
    expect(isPersistableEvaluationsEntityType('VEHICLE')).toBe(true);
  });

  it('exposes the supported persistable target types', () => {
    expect(EVALUATIONS_PERSISTABLE_ENTITY_TYPES).toEqual(
      expect.arrayContaining(['VEHICLE', 'BOOKING', 'CUSTOMER', 'STATION', 'USER']),
    );
    expect(EVALUATIONS_PERSISTABLE_ENTITY_TYPES).not.toContain('DRIVER');
  });
});

describe('Evaluations entity reference owner resolver', () => {
  it('accepts a same-organization INSIGHT owner', async () => {
    const client = makeClient({ insights: [{ id: 'ins1', org: 'org-a' }] });
    const res = await resolveEvaluationsOwnerInOrganization(client, 'org-a', 'INSIGHT', 'ins1');
    expect(res).toEqual({ persistable: true, belongsToOrganization: true });
  });

  it('rejects a cross-tenant INSIGHT owner', async () => {
    const client = makeClient({ insights: [{ id: 'ins1', org: 'org-b' }] });
    const res = await resolveEvaluationsOwnerInOrganization(client, 'org-a', 'INSIGHT', 'ins1');
    expect(res.belongsToOrganization).toBe(false);
  });

  it('marks ANALYTICS_GROUP owner as not persistable (no tenant-owned backing store)', async () => {
    const client = makeClient({});
    const res = await resolveEvaluationsOwnerInOrganization(
      client,
      'org-a',
      'ANALYTICS_GROUP',
      'g1',
    );
    expect(res.persistable).toBe(false);
    expect(isPersistableEvaluationsOwnerType('ANALYTICS_GROUP')).toBe(false);
    expect(EVALUATIONS_PERSISTABLE_OWNER_TYPES).toEqual(['INSIGHT']);
  });
});
