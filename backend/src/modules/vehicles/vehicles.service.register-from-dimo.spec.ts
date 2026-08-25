/**
 * VehiclesService.registerFromDimo() transactional regressions (P0 onboarding).
 */
import { ConflictException } from '@nestjs/common';
import { DimoVehicleDataSourceLinkService } from '@modules/dimo/dimo-vehicle-data-source-link.service';
import {
  DIMO_DATA_SOURCE_PROVIDER,
  DIMO_DATA_SOURCE_SUBTYPE,
  DIMO_DATA_SOURCE_TYPE,
} from '@modules/dimo/dimo-vehicle-data-source-link.contract';
import { VehiclesService } from './vehicles.service';

type VehicleRow = {
  id: string;
  organizationId: string;
  dimoVehicleId: string | null;
  vin: string;
  make: string;
  model: string;
  year: number;
  fuelType: string;
};

type LinkRow = {
  id: string;
  vehicleId: string;
  provider: string;
  sourceType: string;
  sourceSubtype: string | null;
  sourceReferenceId: string | null;
  dimoVehicleId: string | null;
  isActive: boolean;
  consentId: string | null;
  activatedAt: Date;
  deactivatedAt: Date | null;
  linkedByUserId: string | null;
  lastVerifiedAt: Date | null;
  metadata: unknown;
};

function createRegisterFromDimoHarness() {
  let vehicles: VehicleRow[] = [];
  let links: LinkRow[] = [];
  const dimoVehicles = [
    {
      id: 'dimo-veh-1',
      externalId: 'ext-1',
      vin: 'WVWZZZ1JZXW000001',
      make: 'VW',
      model: 'Golf',
      year: 2024,
      fuelType: 'GASOLINE',
      tokenId: 42,
    },
  ];

  const makeClient = (state: { vehicles: VehicleRow[]; links: LinkRow[] }) => ({
    dimoVehicle: {
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = dimoVehicles.find((d) => d.id === where.id);
        if (!row) throw new Error('DimoVehicle not found');
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        dimoVehicles.find((d) => d.id === where.id) ?? null,
      ),
    },
    vehicle: {
      findFirst: jest.fn(async ({ where }: any) =>
        state.vehicles.find(
          (v) =>
            (!where.id || v.id === where.id) &&
            (!where.organizationId || v.organizationId === where.organizationId) &&
            (where.dimoVehicleId ? v.dimoVehicleId === where.dimoVehicleId : true),
        ) ?? null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const row: VehicleRow = {
          id: `veh-${state.vehicles.length + 1}`,
          organizationId: data.organization.connect.id,
          dimoVehicleId: data.dimoVehicle.connect.id,
          vin: data.vin,
          make: data.make,
          model: data.model,
          year: data.year,
          fuelType: data.fuelType,
        };
        state.vehicles.push(row);
        return row;
      }),
    },
    vehicleDataSourceLink: {
      findFirst: jest.fn(async ({ where }: any) => {
        const match = state.links.find((l) => {
          if (where.provider && l.provider !== where.provider) return false;
          if (where.dimoVehicleId && l.dimoVehicleId !== where.dimoVehicleId) return false;
          if (where.isActive != null && l.isActive !== where.isActive) return false;
          if (where.vehicle?.organizationId?.not) {
            const vehicle = state.vehicles.find((v) => v.id === l.vehicleId);
            if (!vehicle || vehicle.organizationId === where.vehicle.organizationId.not) {
              return false;
            }
          }
          return true;
        });
        return match ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        state.links.filter(
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
        const row: LinkRow = {
          id: `link-${state.links.length + 1}`,
          vehicleId: data.vehicleId,
          provider: data.provider,
          sourceType: data.sourceType,
          sourceSubtype: data.sourceSubtype ?? null,
          sourceReferenceId: data.sourceReferenceId ?? null,
          dimoVehicleId: data.dimoVehicleId ?? null,
          isActive: data.isActive ?? true,
          consentId: data.consentId ?? null,
          activatedAt: data.activatedAt ?? new Date(),
          deactivatedAt: null,
          linkedByUserId: data.linkedByUserId ?? null,
          lastVerifiedAt: data.lastVerifiedAt ?? null,
          metadata: data.metadata ?? null,
        };
        state.links.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const idx = state.links.findIndex((l) => l.id === where.id);
        if (idx < 0) throw new Error('link not found');
        state.links[idx] = { ...state.links[idx], ...data };
        return state.links[idx];
      }),
    },
    vehicleProviderConsent: {
      findFirst: jest.fn(async () => null),
    },
    vehicleEnrichmentJob: {
      create: jest.fn(async () => ({ id: 'enrichment-job-1' })),
    },
    $executeRaw: jest.fn(async () => 1),
  });

  const committed = { vehicles, links };
  const prisma = {
    ...makeClient(committed),
    vehicleEnrichmentJob: {
      create: jest.fn(async () => ({ id: 'enrichment-job-1' })),
    },
    $transaction: jest.fn(async (fn: (tx: ReturnType<typeof makeClient>) => Promise<unknown>) => {
      const snapshot = {
        vehicles: [...committed.vehicles],
        links: [...committed.links],
      };
      const tx = makeClient(snapshot);
      try {
        const result = await fn(tx);
        committed.vehicles = snapshot.vehicles;
        committed.links = snapshot.links;
        return result;
      } catch (error) {
        return Promise.reject(error);
      }
    }),
  };

  const stub = (): unknown => ({});
  const dimoLinkService = new DimoVehicleDataSourceLinkService(prisma as never);
  const service = new (VehiclesService as unknown as { new (...args: unknown[]): VehiclesService })(
    prisma,
    stub(),
    stub(),
    stub(),
    { recordDimoConsent: jest.fn() } as never,
    stub(),
    { noBrakePayloadResult: jest.fn().mockReturnValue({}) } as never,
    { ensureDimoTelemetryAuthorization: jest.fn() } as never,
    stub(),
    stub(),
    dimoLinkService,
    stub(),
    stub(),
    { apiUrl: 'https://dimo.test' },
    stub(),
    { invalidate: jest.fn() } as never,
  );

  const getState = () => committed;

  return { service, prisma, getState, dimoVehicles, dimoLinkService };
}

describe('VehiclesService.registerFromDimo transactional regression', () => {
  it('registers vehicle and DIMO link with dimoVehicleId only (success path)', async () => {
    const { service, getState } = createRegisterFromDimoHarness();

    const result = await service.registerFromDimo(
      'org-1',
      null,
      'dimo-veh-1',
      undefined,
      undefined,
      'user-1',
    );

    const { vehicles, links } = getState();
    expect(result.vehicle.id).toBeDefined();
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].dimoVehicleId).toBe('dimo-veh-1');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      provider: DIMO_DATA_SOURCE_PROVIDER,
      sourceType: DIMO_DATA_SOURCE_TYPE,
      sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
      dimoVehicleId: 'dimo-veh-1',
      sourceReferenceId: null,
      isActive: true,
    });

    await expect(service.registerFromDimo('org-1', null, 'dimo-veh-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(getState().vehicles).toHaveLength(1);
    expect(getState().links).toHaveLength(1);
  });

  it('rolls back vehicle when provider-link ensure throws inside transaction', async () => {
    const harness = createRegisterFromDimoHarness();
    jest
      .spyOn(harness.dimoLinkService, 'ensureDimoVehicleDataSourceLinkOrThrow')
      .mockRejectedValueOnce(
        new ConflictException({
          code: 'DIMO_PROVIDER_LINK_CONFLICT',
          message: 'Failed to materialize canonical DIMO provider link',
        }),
      );

    await expect(
      harness.service.registerFromDimo('org-1', null, 'dimo-veh-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(harness.getState().vehicles).toHaveLength(0);
    expect(harness.getState().links).toHaveLength(0);
  });
});
