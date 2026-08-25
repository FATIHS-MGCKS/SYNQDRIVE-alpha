import { ConflictException, NotFoundException } from '@nestjs/common';
import { DimoVehicleDataSourceLinkService } from './dimo-vehicle-data-source-link.service';
import {
  DIMO_DATA_SOURCE_PROVIDER,
  DIMO_DATA_SOURCE_SUBTYPE,
  DIMO_DATA_SOURCE_TYPE,
} from './dimo-vehicle-data-source-link.contract';

type MockStore = {
  vehicles: Array<{
    id: string;
    organizationId: string;
    dimoVehicleId: string | null;
    licensePlate?: string | null;
    vehicleName?: string | null;
  }>;
  dimoVehicles: Array<{ id: string; externalId: string }>;
  links: Array<{
    id: string;
    vehicleId: string;
    provider: string;
    sourceType: string;
    sourceSubtype: string | null;
    sourceReferenceId: string;
    consentId: string | null;
    isActive: boolean;
    activatedAt: Date;
    deactivatedAt: Date | null;
    linkedByUserId: string | null;
    lastVerifiedAt: Date | null;
    metadata: unknown;
  }>;
  consents: Array<{
    id: string;
    vehicleId: string;
    organizationId: string;
    provider: string;
    status: string;
    grantedAt: Date;
  }>;
};

function createMockPrisma(store: MockStore) {
  const dimoFilter = (link: MockStore['links'][number]) =>
    link.provider === DIMO_DATA_SOURCE_PROVIDER &&
    link.sourceType === DIMO_DATA_SOURCE_TYPE &&
    link.sourceSubtype === DIMO_DATA_SOURCE_SUBTYPE;

  return {
    vehicle: {
      findFirst: jest.fn(async ({ where }: any) =>
        store.vehicles.find(
          (v) =>
            v.id === where.id &&
            (!where.organizationId || v.organizationId === where.organizationId),
        ) ?? null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        store.vehicles.filter(
          (v) =>
            (!where.organizationId || v.organizationId === where.organizationId) &&
            (where.dimoVehicleId?.not == null ? v.dimoVehicleId != null : true),
        ),
      ),
    },
    dimoVehicle: {
      findUnique: jest.fn(async ({ where }: any) =>
        store.dimoVehicles.find((d) => d.id === where.id) ?? null,
      ),
    },
    vehicleDataSourceLink: {
      findFirst: jest.fn(async ({ where }: any) => {
        const matches = store.links.filter((l) => {
          if (where.provider && l.provider !== where.provider) return false;
          if (where.sourceReferenceId && l.sourceReferenceId !== where.sourceReferenceId) {
            return false;
          }
          if (where.isActive != null && l.isActive !== where.isActive) return false;
          if (where.vehicle?.organizationId?.not) {
            const vehicle = store.vehicles.find((v) => v.id === l.vehicleId);
            if (!vehicle || vehicle.organizationId === where.vehicle.organizationId.not) {
              return false;
            }
          }
          return true;
        });
        return matches[0] ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        store.links.filter(
          (l) =>
            l.vehicleId === where.vehicleId &&
            (!where.provider || l.provider === where.provider) &&
            (!where.sourceType || l.sourceType === where.sourceType) &&
            (where.sourceSubtype === DIMO_DATA_SOURCE_SUBTYPE
              ? l.sourceSubtype === DIMO_DATA_SOURCE_SUBTYPE
              : true),
        ),
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `link-${store.links.length + 1}`,
          vehicleId: data.vehicleId,
          provider: data.provider,
          sourceType: data.sourceType,
          sourceSubtype: data.sourceSubtype ?? null,
          sourceReferenceId: data.sourceReferenceId,
          consentId: data.consentId ?? null,
          isActive: data.isActive ?? true,
          activatedAt: data.activatedAt ?? new Date(),
          deactivatedAt: null,
          linkedByUserId: data.linkedByUserId ?? null,
          lastVerifiedAt: data.lastVerifiedAt ?? null,
          metadata: data.metadata ?? null,
        };
        store.links.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const idx = store.links.findIndex((l) => l.id === where.id);
        if (idx < 0) throw new Error('not found');
        store.links[idx] = { ...store.links[idx], ...data };
        return store.links[idx];
      }),
    },
    vehicleProviderConsent: {
      findFirst: jest.fn(async ({ where, orderBy }: any) => {
        const rows = store.consents
          .filter(
            (c) =>
              c.vehicleId === where.vehicleId &&
              c.organizationId === where.organizationId &&
              c.provider === where.provider &&
              (!where.status || c.status === where.status),
          )
          .sort((a, b) =>
            orderBy?.grantedAt === 'desc'
              ? b.grantedAt.getTime() - a.grantedAt.getTime()
              : 0,
          );
        return rows[0] ?? null;
      }),
    },
  };
}

function baseStore(): MockStore {
  return {
    vehicles: [
      {
        id: 'veh-1',
        organizationId: 'org-1',
        dimoVehicleId: 'dimo-1',
        licensePlate: 'HMÜ C 215',
      },
    ],
    dimoVehicles: [{ id: 'dimo-1', externalId: 'ext-1' }],
    links: [],
    consents: [
      {
        id: 'consent-active',
        vehicleId: 'veh-1',
        organizationId: 'org-1',
        provider: 'DIMO',
        status: 'ACTIVE',
        grantedAt: new Date('2026-01-01'),
      },
    ],
  };
}

describe('DimoVehicleDataSourceLinkService', () => {
  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    dimoVehicleId: 'dimo-1',
    provenance: 'registration' as const,
  };

  it('L1 — missing DIMO link + valid relation → CREATE', async () => {
    const store = baseStore();
    const service = new DimoVehicleDataSourceLinkService(createMockPrisma(store) as any);
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('CREATE');
    expect(store.links).toHaveLength(1);
    expect(store.links[0].sourceReferenceId).toBe('dimo-1');
    expect(store.links[0].provider).toBe('DIMO');
  });

  it('L2 — existing correct active link → NOOP', async () => {
    const store = baseStore();
    store.links.push({
      id: 'link-existing',
      vehicleId: 'veh-1',
      provider: DIMO_DATA_SOURCE_PROVIDER,
      sourceType: DIMO_DATA_SOURCE_TYPE,
      sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
      sourceReferenceId: 'dimo-1',
      consentId: 'consent-active',
      isActive: true,
      activatedAt: new Date('2026-01-01'),
      deactivatedAt: null,
      linkedByUserId: null,
      lastVerifiedAt: null,
      metadata: null,
    });
    const service = new DimoVehicleDataSourceLinkService(createMockPrisma(store) as any);
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('NOOP');
    expect(store.links).toHaveLength(1);
  });

  it('L3 — retry same registration → no duplicate', async () => {
    const store = baseStore();
    const service = new DimoVehicleDataSourceLinkService(createMockPrisma(store) as any);
    const first = await service.ensureDimoVehicleDataSourceLink(baseInput);
    const second = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(first.action).toBe('CREATE');
    expect(second.action).toBe('NOOP');
    expect(store.links.filter((l) => l.isActive)).toHaveLength(1);
  });

  it('L4 — cross-tenant DimoVehicle binding mismatch → reject', async () => {
    const store = baseStore();
    store.vehicles[0].dimoVehicleId = 'dimo-other';
    const service = new DimoVehicleDataSourceLinkService(createMockPrisma(store) as any);
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('CONFLICT');
    expect(result.reason).toBe('vehicle_dimo_binding_mismatch');
  });

  it('L5 — conflicting active mapping → fail/flag', async () => {
    const store = baseStore();
    store.links.push({
      id: 'link-conflict',
      vehicleId: 'veh-1',
      provider: DIMO_DATA_SOURCE_PROVIDER,
      sourceType: DIMO_DATA_SOURCE_TYPE,
      sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
      sourceReferenceId: 'dimo-other',
      consentId: null,
      isActive: true,
      activatedAt: new Date(),
      deactivatedAt: null,
      linkedByUserId: null,
      lastVerifiedAt: null,
      metadata: null,
    });
    const service = new DimoVehicleDataSourceLinkService(createMockPrisma(store) as any);
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('CONFLICT');
    expect(result.reason).toBe('conflicting_active_source_reference');
  });

  it('L6 — inactive consent does not fabricate ACTIVE provider state', async () => {
    const store = baseStore();
    store.consents = [
      {
        id: 'consent-inactive',
        vehicleId: 'veh-1',
        organizationId: 'org-1',
        provider: 'DIMO',
        status: 'REVOKED',
        grantedAt: new Date('2026-01-01'),
      },
    ];
    const service = new DimoVehicleDataSourceLinkService(createMockPrisma(store) as any);
    const provenance = await service.resolveConsentProvenance('veh-1', 'org-1');
    expect(provenance.selection).toBe('latest_inactive');
    expect(provenance.consentStatus).toBe('REVOKED');
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('CREATE');
    expect(result.consentId).toBe('consent-inactive');
  });

  it('L7 — registration transaction behavior on link failure', async () => {
    const store = baseStore();
    store.links.push({
      id: 'link-conflict',
      vehicleId: 'veh-1',
      provider: DIMO_DATA_SOURCE_PROVIDER,
      sourceType: DIMO_DATA_SOURCE_TYPE,
      sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
      sourceReferenceId: 'dimo-other',
      consentId: null,
      isActive: true,
      activatedAt: new Date(),
      deactivatedAt: null,
      linkedByUserId: null,
      lastVerifiedAt: null,
      metadata: null,
    });
    const service = new DimoVehicleDataSourceLinkService(createMockPrisma(store) as any);
    await expect(
      service.ensureDimoVehicleDataSourceLinkOrThrow(baseInput, createMockPrisma(store) as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('L8 — High Mobility path unaffected (no DIMO rows touched)', async () => {
    const store = baseStore();
    store.links.push({
      id: 'hm-link',
      vehicleId: 'veh-1',
      provider: 'HIGH_MOBILITY',
      sourceType: 'HIGH_MOBILITY',
      sourceSubtype: 'HM_HEALTH',
      sourceReferenceId: 'hm-1',
      consentId: null,
      isActive: true,
      activatedAt: new Date(),
      deactivatedAt: null,
      linkedByUserId: null,
      lastVerifiedAt: null,
      metadata: null,
    });
    const service = new DimoVehicleDataSourceLinkService(createMockPrisma(store) as any);
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('CREATE');
    expect(store.links.filter((l) => l.provider === 'HIGH_MOBILITY')).toHaveLength(1);
    expect(store.links.filter((l) => l.provider === 'DIMO')).toHaveLength(1);
  });
});

describe('DimoVehicleDataSourceLinkService backfill planning', () => {
  it('B1/B2 — dry-run plan CREATE for missing link', async () => {
    const store = baseStore();
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async ({ where }: any) =>
      store.vehicles
        .filter((v) => v.organizationId === where.organizationId && v.dimoVehicleId)
        .map((v) => ({
          ...v,
          dimoVehicle: { id: v.dimoVehicleId! },
          dataSourceLinks: store.links.filter(
            (l) => l.vehicleId === v.id && dimoFilter(l),
          ),
        })),
    );
    const service = new DimoVehicleDataSourceLinkService(prisma as any);
    const summary = await service.runBackfill({ organizationId: 'org-1', apply: false });
    expect(summary.mode).toBe('dry-run');
    expect(summary.plannedCreate).toBe(1);
    expect(summary.applied).toBe(0);
    expect(store.links).toHaveLength(0);
  });

  it('B3 — existing link → NOOP plan', async () => {
    const store = baseStore();
    store.links.push({
      id: 'link-1',
      vehicleId: 'veh-1',
      provider: DIMO_DATA_SOURCE_PROVIDER,
      sourceType: DIMO_DATA_SOURCE_TYPE,
      sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
      sourceReferenceId: 'dimo-1',
      consentId: 'consent-active',
      isActive: true,
      activatedAt: new Date(),
      deactivatedAt: null,
      linkedByUserId: null,
      lastVerifiedAt: null,
      metadata: null,
    });
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => [
      {
        id: 'veh-1',
        organizationId: 'org-1',
        licensePlate: 'HMÜ C 215',
        vehicleName: null,
        dimoVehicleId: 'dimo-1',
        dimoVehicle: { id: 'dimo-1' },
        dataSourceLinks: store.links,
      },
    ]);
    const service = new DimoVehicleDataSourceLinkService(prisma as any);
    const summary = await service.runBackfill({ organizationId: 'org-1', apply: false });
    expect(summary.plannedNoop).toBe(1);
  });

  it('B5 — second apply → NOOP', async () => {
    const store = baseStore();
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => [
      {
        id: 'veh-1',
        organizationId: 'org-1',
        licensePlate: 'HMÜ C 215',
        vehicleName: null,
        dimoVehicleId: 'dimo-1',
        dimoVehicle: { id: 'dimo-1' },
        dataSourceLinks: store.links.filter((l) => l.vehicleId === 'veh-1'),
      },
    ]);
    const service = new DimoVehicleDataSourceLinkService(prisma as any);
    const first = await service.runBackfill({ organizationId: 'org-1', apply: true });
    const second = await service.runBackfill({ organizationId: 'org-1', apply: true });
    expect(first.applied).toBe(1);
    expect(second.plannedNoop).toBe(1);
    expect(second.applied).toBe(0);
  });
});

function dimoFilter(link: MockStore['links'][number]) {
  return (
    link.provider === DIMO_DATA_SOURCE_PROVIDER &&
    link.sourceType === DIMO_DATA_SOURCE_TYPE &&
    link.sourceSubtype === DIMO_DATA_SOURCE_SUBTYPE
  );
}

describe('DimoVehicleDataSourceLinkService reconciliation', () => {
  it('R1 — missing deterministic DIMO link detected', async () => {
    const store = baseStore();
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => [
      {
        id: 'veh-1',
        organizationId: 'org-1',
        licensePlate: 'HMÜ C 215',
        vehicleName: null,
        dimoVehicleId: 'dimo-1',
        dimoVehicle: { id: 'dimo-1' },
        dataSourceLinks: [],
      },
    ]);
    const service = new DimoVehicleDataSourceLinkService(prisma as any);
    const drift = await service.auditProviderLinkDrift({ organizationId: 'org-1' });
    expect(drift.missingLink).toBe(1);
  });

  it('R2 — healthy link not flagged as missing', async () => {
    const store = baseStore();
    store.links.push({
      id: 'link-1',
      vehicleId: 'veh-1',
      provider: DIMO_DATA_SOURCE_PROVIDER,
      sourceType: DIMO_DATA_SOURCE_TYPE,
      sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
      sourceReferenceId: 'dimo-1',
      consentId: null,
      isActive: true,
      activatedAt: new Date(),
      deactivatedAt: null,
      linkedByUserId: null,
      lastVerifiedAt: null,
      metadata: null,
    });
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => [
      {
        id: 'veh-1',
        organizationId: 'org-1',
        licensePlate: 'HMÜ C 215',
        vehicleName: null,
        dimoVehicleId: 'dimo-1',
        dimoVehicle: { id: 'dimo-1' },
        dataSourceLinks: store.links,
      },
    ]);
    const service = new DimoVehicleDataSourceLinkService(prisma as any);
    const drift = await service.auditProviderLinkDrift({ organizationId: 'org-1' });
    expect(drift.healthy).toBe(1);
    expect(drift.missingLink).toBe(0);
  });

  it('R3 — ambiguous relation not auto-healed on reconcile', async () => {
    const store = baseStore();
    store.links.push(
      {
        id: 'link-a',
        vehicleId: 'veh-1',
        provider: DIMO_DATA_SOURCE_PROVIDER,
        sourceType: DIMO_DATA_SOURCE_TYPE,
        sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
        sourceReferenceId: 'dimo-1',
        consentId: null,
        isActive: true,
        activatedAt: new Date(),
        deactivatedAt: null,
        linkedByUserId: null,
        lastVerifiedAt: null,
        metadata: null,
      },
      {
        id: 'link-b',
        vehicleId: 'veh-1',
        provider: DIMO_DATA_SOURCE_PROVIDER,
        sourceType: DIMO_DATA_SOURCE_TYPE,
        sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
        sourceReferenceId: 'dimo-1',
        consentId: null,
        isActive: true,
        activatedAt: new Date(),
        deactivatedAt: null,
        linkedByUserId: null,
        lastVerifiedAt: null,
        metadata: null,
      },
    );
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => [
      {
        id: 'veh-1',
        organizationId: 'org-1',
        licensePlate: 'HMÜ C 215',
        vehicleName: null,
        dimoVehicleId: 'dimo-1',
        dimoVehicle: { id: 'dimo-1' },
        dataSourceLinks: store.links,
      },
    ]);
    const service = new DimoVehicleDataSourceLinkService(prisma as any);
    const drift = await service.auditProviderLinkDrift({ organizationId: 'org-1' });
    expect(drift.ambiguous).toBe(1);
    const result = await service.reconcileSafeDrift({
      organizationId: 'org-1',
      apply: true,
    });
    expect(result.applied).toBe(0);
  });
});

describe('DimoVehicleDataSourceLinkService validation', () => {
  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    dimoVehicleId: 'dimo-1',
    provenance: 'registration' as const,
  };

  it('throws when vehicle is missing', async () => {
    const store = baseStore();
    store.vehicles = [];
    const service = new DimoVehicleDataSourceLinkService(createMockPrisma(store) as any);
    await expect(service.ensureDimoVehicleDataSourceLink(baseInput)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
