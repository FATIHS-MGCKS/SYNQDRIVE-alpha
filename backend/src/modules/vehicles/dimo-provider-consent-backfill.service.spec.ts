import { DimoProviderConsentBackfillService } from './dimo-provider-consent-backfill.service';

describe('DimoProviderConsentBackfillService', () => {
  const orgId = 'org-1';
  const ksFh: {
    id: string;
    organizationId: string;
    licensePlate: string;
    vin: string;
    createdAt: Date;
    dimoVehicleId: string;
    dimoVehicle: { tokenId: number; externalId: string; connectionStatus: string };
    dataSourceLinks: Array<{
      id: string;
      provider: string;
      isActive: boolean;
      dimoVehicleId: string;
      consentId: string | null;
    }>;
    providerConsents: Array<{ id: string; status: string }>;
  } = {
    id: 'veh-ks-fh',
    organizationId: orgId,
    licensePlate: 'KS FH 660E',
    vin: 'LRW3E7FS5PC677180',
    createdAt: new Date('2026-04-04T20:25:46.868Z'),
    dimoVehicleId: 'dimo-1',
    dimoVehicle: { tokenId: 186946, externalId: '186946', connectionStatus: 'CONNECTED' },
    dataSourceLinks: [
      {
        id: 'link-1',
        provider: 'DIMO',
        isActive: true,
        dimoVehicleId: 'dimo-1',
        consentId: null,
      },
    ],
    providerConsents: [],
  };

  function makeService(overrides: {
    vehicles?: typeof ksFh[];
    fleet?: Array<{ id: string; dimoVehicleId: string | null; dimoVehicle: { tokenId: number | null } | null }>;
  } = {}) {
    const vehicles = overrides.vehicles ?? [ksFh];
    const fleet = overrides.fleet ?? vehicles.map((v) => ({
      id: v.id,
      dimoVehicleId: v.dimoVehicleId,
      dimoVehicle: v.dimoVehicle ? { tokenId: v.dimoVehicle.tokenId } : null,
    }));

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
        findFirst: jest.fn(),
      },
      vehicleProviderConsent: { create: jest.fn() },
      vehicleDataSourceLink: { update: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    } as any;

    return { service: new DimoProviderConsentBackfillService(prisma), prisma };
  }

  it('plans CREATE + WIRE for missing consent with valid DIMO mapping', async () => {
    const { service } = makeService();
    const plans = await service.plan(
      { organizationId: orgId, vehicleIds: [ksFh.id] },
      'test-run',
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].plannedAction).toBe('CREATE');
    expect(plans[0].plannedLinkAction).toBe('WIRE_CONSENT_ID');
    expect(plans[0].proposedConsent?.scopes).toEqual([
      'telemetry',
      'location',
      'dtc',
      'snapshot',
    ]);
    expect(plans[0].proposedConsent?.providerVehicleRef).toBe('186946');
    expect(plans[0].proposedConsent?.grantedAt).toBe('2026-04-04T20:25:46.868Z');
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
    expect(plans[0].plannedLinkAction).toBe('NOOP');
  });

  it('CONFLICT when link consentId mismatches active consent', async () => {
    const mismatch = {
      ...ksFh,
      providerConsents: [{ id: 'consent-1', status: 'ACTIVE' }],
      dataSourceLinks: [{ ...ksFh.dataSourceLinks[0], consentId: 'other-consent' }],
    };
    const { service } = makeService({ vehicles: [mismatch] });
    const plans = await service.plan({ organizationId: orgId, vehicleIds: [mismatch.id] });
    expect(plans[0].plannedAction).toBe('CONFLICT');
  });

  it('CONFLICT on tokenId collision across fleet', async () => {
    const { service } = makeService({
      fleet: [
        { id: 'veh-ks-fh', dimoVehicleId: 'dimo-1', dimoVehicle: { tokenId: 186946 } },
        { id: 'veh-other', dimoVehicleId: 'dimo-2', dimoVehicle: { tokenId: 186946 } },
      ],
    });
    const plans = await service.plan({ organizationId: orgId, vehicleIds: [ksFh.id] });
    expect(plans[0].plannedAction).toBe('CONFLICT');
    expect(plans[0].reason).toBe('identity_collision_or_token_mismatch');
  });
});
