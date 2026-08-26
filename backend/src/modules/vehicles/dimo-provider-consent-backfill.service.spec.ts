import { ConflictException } from '@nestjs/common';
import { DimoProviderConsentBackfillService } from './dimo-provider-consent-backfill.service';

describe('DimoProviderConsentBackfillService', () => {
  const orgId = 'org-1';
  const otherOrgId = 'org-2';

  const ksFh = {
    id: 'veh-ks-fh',
    organizationId: orgId,
    licensePlate: 'KS FH 660E',
    vin: 'LRW3E7FS5PC677180',
    createdAt: new Date('2026-04-04T20:25:46.868Z'),
    dimoVehicleId: 'dimo-1',
    dimoVehicle: { tokenId: 186946, externalId: '186946', connectionStatus: 'CONNECTED' },
    providerConsents: [] as Array<{ id: string; status: string }>,
    dataSourceLinks: [
      {
        id: 'link-1',
        provider: 'DIMO',
        isActive: true,
        dimoVehicleId: 'dimo-1',
        consentId: null as string | null,
      },
    ],
  };

  const ksMs = {
    ...ksFh,
    id: 'veh-ks-ms',
    licensePlate: 'KS MS 661',
    dimoVehicleId: 'dimo-2',
    dimoVehicle: { tokenId: 187361, externalId: '187361', connectionStatus: 'CONNECTED' },
    dataSourceLinks: [
      {
        id: 'link-2',
        provider: 'DIMO',
        isActive: true,
        dimoVehicleId: 'dimo-2',
        consentId: null,
      },
    ],
  };

  const ksMx = {
    ...ksFh,
    id: 'veh-ks-mx',
    licensePlate: 'KS MX 2024',
    dimoVehicleId: 'dimo-3',
    dimoVehicle: { tokenId: 187336, externalId: '187336', connectionStatus: 'CONNECTED' },
    dataSourceLinks: [
      {
        id: 'link-3',
        provider: 'DIMO',
        isActive: true,
        dimoVehicleId: 'dimo-3',
        consentId: null,
      },
    ],
  };

  function fleetFromVehicles(vehicles: typeof ksFh[]) {
    return vehicles.map((v) => ({
      id: v.id,
      dimoVehicleId: v.dimoVehicleId,
      dimoVehicle: v.dimoVehicle ? { tokenId: v.dimoVehicle.tokenId } : null,
    }));
  }

  function cloneVehicle(vehicle: typeof ksFh): typeof ksFh {
    return {
      ...vehicle,
      dimoVehicle: vehicle.dimoVehicle ? { ...vehicle.dimoVehicle } : vehicle.dimoVehicle,
      providerConsents: vehicle.providerConsents.map((c) => ({ ...c })),
      dataSourceLinks: vehicle.dataSourceLinks.map((l) => ({ ...l })),
    };
  }

  function buildSnapshot(vehicle: typeof ksFh) {
    const activeLinks = vehicle.dataSourceLinks.filter(
      (l) => l.provider === 'DIMO' && l.isActive && l.dimoVehicleId,
    );
    const activeConsents = vehicle.providerConsents.filter((c) => c.status === 'ACTIVE');
    return {
      id: vehicle.id,
      organizationId: vehicle.organizationId,
      dimoVehicleId: vehicle.dimoVehicleId,
      dimoVehicle: vehicle.dimoVehicle,
      dataSourceLinks: activeLinks,
      providerConsents: activeConsents.map((c) => ({ id: c.id })),
    };
  }

  function makeService(config: {
    vehicles?: typeof ksFh[];
    fleet?: ReturnType<typeof fleetFromVehicles>;
    txApplySnapshots?: Record<string, any>;
  } = {}) {
    const vehicles = (config.vehicles ?? [ksFh]).map(cloneVehicle);
    const fleet = config.fleet ?? fleetFromVehicles(vehicles);
    const txApplySnapshots = config.txApplySnapshots ?? {};
    const createdConsents: any[] = [];
    const linkUpdates: any[] = [];
    let inTransaction = false;

    const resolveVehicleSnapshot = (vehicleId: string) => {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      if (!vehicle) return null;
      if (inTransaction && txApplySnapshots[vehicleId]) {
        return txApplySnapshots[vehicleId];
      }
      return buildSnapshot(vehicle);
    };

    const prisma = {
      vehicle: {
        findMany: jest.fn(async (args: any) => {
          if (args?.where?.id?.in) {
            return vehicles.filter((v) => args.where.id.in.includes(v.id));
          }
          if (args?.where?.organizationId && args?.where?.dimoVehicleId) {
            return fleet;
          }
          return [];
        }),
        findFirst: jest.fn(async (args: any) => {
          const vehicleId = args?.where?.id;
          if (!vehicleId) return null;
          if (args?.where?.organizationId) {
            const vehicle = vehicles.find(
              (v) => v.id === vehicleId && v.organizationId === args.where.organizationId,
            );
            if (!vehicle) return null;
          }
          return resolveVehicleSnapshot(vehicleId);
        }),
      },
      vehicleProviderConsent: {
        create: jest.fn(async ({ data }: any) => {
          const row = {
            id: `consent-${createdConsents.length + 1}`,
            ...data,
            metadataJson: data.metadataJson,
          };
          createdConsents.push(row);
          return row;
        }),
        findFirst: jest.fn(async ({ where }: any) => {
          const rows = [...createdConsents, ...collectVehicleConsents(vehicles)].filter(
            (c) =>
              (!where.id || c.id === where.id) &&
              (!where.vehicleId || c.vehicleId === where.vehicleId) &&
              (!where.organizationId || c.organizationId === where.organizationId) &&
              (!where.provider || c.provider === where.provider) &&
              (!where.status || c.status === where.status),
          );
          return rows[0] ?? null;
        }),
        findMany: jest.fn(async ({ where }: any) => {
          return [...createdConsents, ...collectVehicleConsents(vehicles)].filter(
            (c) =>
              (!where.vehicleId || c.vehicleId === where.vehicleId) &&
              (!where.organizationId || c.organizationId === where.organizationId) &&
              (!where.provider || c.provider === where.provider) &&
              (!where.status || c.status === where.status),
          );
        }),
      },
      vehicleDataSourceLink: {
        update: jest.fn(async ({ where, data }: any) => {
          linkUpdates.push({ where, data });
          const vehicle = vehicles.find((v) =>
            v.dataSourceLinks.some((l) => l.id === where.id),
          );
          const link = vehicle?.dataSourceLinks.find((l) => l.id === where.id);
          if (link) link.consentId = data.consentId;
          return link;
        }),
        findFirst: jest.fn(async ({ where }: any) => {
          for (const vehicle of vehicles) {
            const link = vehicle.dataSourceLinks.find(
              (l) =>
                l.id === where.id &&
                (!where.provider || l.provider === where.provider) &&
                (!where.isActive || l.isActive === where.isActive) &&
                (!where.dimoVehicleId || l.dimoVehicleId === where.dimoVehicleId) &&
                (!where.vehicleId || vehicle.id === where.vehicleId),
            );
            if (link) return { ...link, vehicleId: vehicle.id };
          }
          const update = linkUpdates.find((u) => u.where.id === where.id);
          if (!update) return null;
          return {
            id: where.id,
            vehicleId: where.vehicleId,
            provider: where.provider,
            isActive: true,
            dimoVehicleId: where.dimoVehicleId,
            consentId: update.data.consentId,
          };
        }),
        findMany: jest.fn(async ({ where }: any) => {
          const links: any[] = [];
          for (const vehicle of vehicles) {
            if (where.vehicleId && vehicle.id !== where.vehicleId) continue;
            for (const link of vehicle.dataSourceLinks) {
              if (where.provider && link.provider !== where.provider) continue;
              if (where.isActive != null && link.isActive !== where.isActive) continue;
              if (where.dimoVehicleId?.not === null && link.dimoVehicleId == null) continue;
              links.push({ ...link, vehicleId: vehicle.id });
            }
          }
          return links;
        }),
      },
      $transaction: jest.fn(async (fn: any) => {
        inTransaction = true;
        try {
          return await fn(prisma);
        } finally {
          inTransaction = false;
        }
      }),
    } as any;

    return { service: new DimoProviderConsentBackfillService(prisma), prisma, createdConsents, linkUpdates };
  }

  function collectVehicleConsents(vehicles: typeof ksFh[]) {
    return vehicles.flatMap((v) =>
      v.providerConsents
        .filter((c) => c.status === 'ACTIVE')
        .map((c) => ({
          id: c.id,
          vehicleId: v.id,
          organizationId: v.organizationId,
          provider: 'DIMO',
          status: 'ACTIVE',
          providerVehicleRef: v.dimoVehicle?.externalId ?? String(v.dimoVehicle?.tokenId),
          expiresAt: null,
          revokedAt: null,
          metadataJson: {},
        })),
    );
  }

  it('plans CREATE + WIRE for missing consent with valid DIMO mapping', async () => {
    const { service } = makeService();
    const plans = await service.plan({ organizationId: orgId, vehicleIds: [ksFh.id] }, 'test-run');
    expect(plans[0].plannedAction).toBe('CREATE');
    expect(plans[0].plannedLinkAction).toBe('WIRE_CONSENT_ID');
    expect(plans[0].identityChecks.vehicleInOrg).toBe(true);
  });

  it('CONFLICT when vehicle organization does not match requested org scope', async () => {
    const mismatched = { ...ksFh, organizationId: otherOrgId };
    const { service, prisma } = makeService();
    prisma.vehicle.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.id?.in) return [mismatched];
      return fleetFromVehicles([mismatched]);
    });
    const plans = await service.plan({ organizationId: orgId, vehicleIds: [mismatched.id] });
    expect(plans[0].identityChecks.vehicleInOrg).toBe(false);
    expect(plans[0].plannedAction).toBe('CONFLICT');
    expect(plans[0].reason).toBe('vehicle_organization_mismatch');
  });

  it('CONFLICT on tokenId collision across fleet', async () => {
    const { service } = makeService({
      fleet: [
        { id: 'veh-ks-fh', dimoVehicleId: 'dimo-1', dimoVehicle: { tokenId: 186946 } },
        { id: 'veh-other', dimoVehicleId: 'dimo-9', dimoVehicle: { tokenId: 186946 } },
      ],
    });
    const plans = await service.plan({ organizationId: orgId, vehicleIds: [ksFh.id] });
    expect(plans[0].plannedAction).toBe('CONFLICT');
    expect(plans[0].reason).toBe('identity_collision_or_token_mismatch');
  });

  it('CONFLICT on duplicate dimoVehicleId across fleet', async () => {
    const { service } = makeService({
      fleet: [
        { id: 'veh-ks-fh', dimoVehicleId: 'dimo-1', dimoVehicle: { tokenId: 186946 } },
        { id: 'veh-other', dimoVehicleId: 'dimo-1', dimoVehicle: { tokenId: 999999 } },
      ],
    });
    const plans = await service.plan({ organizationId: orgId, vehicleIds: [ksFh.id] });
    expect(plans[0].plannedAction).toBe('CONFLICT');
  });

  it('CONFLICT when zero active DIMO links', async () => {
    const noLink = {
      ...ksFh,
      dataSourceLinks: [{ ...ksFh.dataSourceLinks[0], isActive: false }],
    };
    const { service } = makeService({ vehicles: [noLink] });
    const plans = await service.plan({ organizationId: orgId, vehicleIds: [noLink.id] });
    expect(plans[0].plannedAction).toBe('CONFLICT');
    expect(plans[0].reason).toBe('no_active_dimo_link');
  });

  it('CONFLICT when multiple active DIMO links', async () => {
    const multi = {
      ...ksFh,
      dataSourceLinks: [
        ...ksFh.dataSourceLinks,
        {
          id: 'link-dup',
          provider: 'DIMO',
          isActive: true,
          dimoVehicleId: 'dimo-1',
          consentId: null,
        },
      ],
    };
    const { service } = makeService({ vehicles: [multi] });
    const plans = await service.plan({ organizationId: orgId, vehicleIds: [multi.id] });
    expect(plans[0].plannedAction).toBe('CONFLICT');
    expect(plans[0].reason).toBe('multiple_active_dimo_links');
  });

  it('CONFLICT when multiple ACTIVE consents exist', async () => {
    const multiConsent = {
      ...ksFh,
      providerConsents: [
        { id: 'c1', status: 'ACTIVE' },
        { id: 'c2', status: 'ACTIVE' },
      ],
    };
    const { service } = makeService({ vehicles: [multiConsent] });
    const plans = await service.plan({ organizationId: orgId, vehicleIds: [multiConsent.id] });
    expect(plans[0].plannedAction).toBe('CONFLICT');
    expect(plans[0].reason).toBe('multiple_active_dimo_consents');
  });

  it('CONFLICT when unexpected link.consentId without active consent', async () => {
    const unexpected = {
      ...ksFh,
      dataSourceLinks: [{ ...ksFh.dataSourceLinks[0], consentId: 'foreign-consent' }],
    };
    const { service } = makeService({ vehicles: [unexpected] });
    const plans = await service.plan({ organizationId: orgId, vehicleIds: [unexpected.id] });
    expect(plans[0].plannedAction).toBe('CONFLICT');
    expect(plans[0].reason).toBe('unexpected_link_consent_id_without_active_consent');
  });

  it('second plan is NOOP when ACTIVE consent already exists and link wired', async () => {
    const wired = {
      ...ksFh,
      providerConsents: [{ id: 'consent-1', status: 'ACTIVE' }],
      dataSourceLinks: [{ ...ksFh.dataSourceLinks[0], consentId: 'consent-1' }],
    };
    const { service } = makeService({ vehicles: [wired] });
    const plans = await service.plan({ organizationId: orgId, vehicleIds: [wired.id] });
    expect(plans[0].plannedAction).toBe('NOOP');
  });

  it('apply aborts with zero writes when ACTIVE consent appears at tx-local re-read', async () => {
    const { service, createdConsents } = makeService({
      txApplySnapshots: {
        [ksFh.id]: {
          ...buildSnapshot(ksFh),
          providerConsents: [{ id: 'new-active' }],
        },
      },
    });

    await expect(
      service.run({ organizationId: orgId, vehicleIds: [ksFh.id], apply: true, runId: 'run-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(createdConsents).toHaveLength(0);
  });

  it('apply aborts with zero writes when link.consentId changes at tx-local re-read', async () => {
    const { service, createdConsents } = makeService({
      txApplySnapshots: {
        [ksFh.id]: {
          ...buildSnapshot(ksFh),
          dataSourceLinks: [{ ...ksFh.dataSourceLinks[0], consentId: 'foreign-consent' }],
        },
      },
    });

    await expect(
      service.run({ organizationId: orgId, vehicleIds: [ksFh.id], apply: true, runId: 'run-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(createdConsents).toHaveLength(0);
  });

  it('apply aborts with zero writes when tokenId changes at tx-local re-read', async () => {
    const { service, createdConsents } = makeService({
      txApplySnapshots: {
        [ksFh.id]: {
          ...buildSnapshot(ksFh),
          dimoVehicle: { tokenId: 999999, externalId: '999999' },
        },
      },
    });

    await expect(
      service.run({ organizationId: orgId, vehicleIds: [ksFh.id], apply: true, runId: 'run-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(createdConsents).toHaveLength(0);
  });

  it('apply aborts with zero writes when second active DIMO link appears at tx-local re-read', async () => {
    const { service, createdConsents } = makeService({
      txApplySnapshots: {
        [ksFh.id]: {
          ...buildSnapshot(ksFh),
          dataSourceLinks: [
            ...ksFh.dataSourceLinks,
            {
              id: 'link-dup',
              provider: 'DIMO',
              isActive: true,
              dimoVehicleId: 'dimo-1',
              consentId: null,
            },
          ],
        },
      },
    });

    await expect(
      service.run({ organizationId: orgId, vehicleIds: [ksFh.id], apply: true, runId: 'run-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(createdConsents).toHaveLength(0);
  });

  it('apply aborts all targets when one target is CONFLICT', async () => {
    const bad = {
      ...ksMs,
      id: 'veh-bad',
      dataSourceLinks: [{ ...ksMs.dataSourceLinks[0], consentId: 'foreign' }],
    };
    const { service, createdConsents } = makeService({
      vehicles: [ksFh, bad],
      fleet: fleetFromVehicles([ksFh, bad]),
    });

    await expect(
      service.run({
        organizationId: orgId,
        vehicleIds: [ksFh.id, bad.id],
        apply: true,
        runId: 'run-atomic-blocked',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(createdConsents).toHaveLength(0);
  });

  it('target 1 and 2 tx-local PASS but target 3 FAIL => zero CREATE and zero WIRE', async () => {
    const targets = [ksFh, ksMs, ksMx];
    const { service, prisma, createdConsents, linkUpdates } = makeService({
      vehicles: targets,
      fleet: fleetFromVehicles(targets),
      txApplySnapshots: {
        [ksMx.id]: {
          ...buildSnapshot(ksMx),
          providerConsents: [{ id: 'appeared-active' }],
        },
      },
    });

    await expect(
      service.run({
        organizationId: orgId,
        vehicleIds: targets.map((v) => v.id),
        apply: true,
        runId: 'run-partial-fail',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(createdConsents).toHaveLength(0);
    expect(linkUpdates).toHaveLength(0);
    expect(prisma.vehicleProviderConsent.create).not.toHaveBeenCalled();
    expect(prisma.vehicleDataSourceLink.update).not.toHaveBeenCalled();
  });

  it('NOOP + WIRE_CONSENT_ID wires existing consent without creating a new row', async () => {
    const unwired = {
      ...ksFh,
      providerConsents: [{ id: 'existing-consent', status: 'ACTIVE' }],
      dataSourceLinks: [{ ...ksFh.dataSourceLinks[0], consentId: null }],
    };
    const { service, createdConsents, linkUpdates } = makeService({ vehicles: [unwired] });

    const summary = await service.run({
      organizationId: orgId,
      vehicleIds: [unwired.id],
      apply: true,
      runId: 'run-wire-only',
    });

    expect(summary.createdConsents).toBe(0);
    expect(summary.wiredConsentIds).toBe(1);
    expect(summary.mutatedVehicles).toBe(1);
    expect(createdConsents).toHaveLength(0);
    expect(linkUpdates).toHaveLength(1);
    expect(linkUpdates[0].data.consentId).toBe('existing-consent');
  });

  it('successful exact 3-target apply creates 3 consents and wires 3 links atomically', async () => {
    const targets = [ksFh, ksMs, ksMx];
    const { service, createdConsents, linkUpdates } = makeService({
      vehicles: targets,
      fleet: fleetFromVehicles(targets),
    });

    const summary = await service.run({
      organizationId: orgId,
      vehicleIds: targets.map((v) => v.id),
      apply: true,
      runId: 'run-atomic-3',
    });

    expect(summary.createdConsents).toBe(3);
    expect(summary.wiredConsentIds).toBe(3);
    expect(summary.mutatedVehicles).toBe(3);
    expect(summary.applied).toBe(3);
    expect(createdConsents).toHaveLength(3);
    expect(linkUpdates).toHaveLength(3);
    expect(summary.atomicApply).toBe(true);
    expect(summary.partialWritePossible).toBe(false);
  });

  it('second apply execution becomes NOOP', async () => {
    const { service, prisma, createdConsents } = makeService();
    const first = await service.run({
      organizationId: orgId,
      vehicleIds: [ksFh.id],
      apply: true,
      runId: 'run-1',
    });
    expect(first.mutatedVehicles).toBe(1);
    expect(first.createdConsents).toBe(1);
    expect(createdConsents).toHaveLength(1);

    const wired = {
      ...cloneVehicle(ksFh),
      providerConsents: [{ id: createdConsents[0].id, status: 'ACTIVE' }],
      dataSourceLinks: [{ ...ksFh.dataSourceLinks[0], consentId: createdConsents[0].id }],
    };

    prisma.vehicle.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.id?.in) return [wired];
      return fleetFromVehicles([wired]);
    });
    prisma.vehicle.findFirst.mockImplementation(async (args: any) => {
      if (args?.where?.id === wired.id) return buildSnapshot(wired);
      return null;
    });

    const second = await service.run({
      organizationId: orgId,
      vehicleIds: [ksFh.id],
      apply: true,
      runId: 'run-2',
    });
    expect(second.create).toBe(0);
    expect(second.noop).toBe(1);
    expect(second.mutatedVehicles).toBe(0);
    expect(second.createdConsents).toBe(0);
    expect(createdConsents).toHaveLength(1);
  });
});
