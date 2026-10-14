import { ProviderLinkState } from './connectivity/domain/connectivity-domain.types';
import type { VehicleOperationalRowDto } from './vehicles-operational.types';
import { VehiclesOperationalService } from './vehicles-operational.service';

describe('VehiclesOperationalService DIMO access read model (VO5C D1)', () => {
  const svc = Object.create(VehiclesOperationalService.prototype) as VehiclesOperationalService;

  type ComposeRegisteredRow = (
    vehicle: {
      id: string;
      registryLifecycle: 'ACTIVE' | 'OFFBOARDED' | 'ARCHIVED';
      vin: string;
      make: string;
      model: string;
      year: number;
      licensePlate: string;
      vehicleName: null;
      organizationId: string;
      dimoVehicleId: string;
      organization: { companyName: string };
      dimoVehicle: {
        id: string;
        connectionStatus: 'CONNECTED';
        lastSignal: null;
        externalId: string;
        tokenId: number;
        syncedAt: null;
      };
      latestState: null;
    },
    now: number,
    platformCtx: { degraded: boolean },
    pollLog: null,
    providerLinkState?: string | null,
  ) => VehicleOperationalRowDto;

  const composeRegisteredRow = (
    svc as unknown as { composeRegisteredRow: ComposeRegisteredRow }
  ).composeRegisteredRow.bind(svc);

  const compose = (
    registryLifecycle: 'ACTIVE' | 'OFFBOARDED' | 'ARCHIVED',
    platformDegraded: boolean,
    providerLinkState?: string | null,
  ) =>
    composeRegisteredRow(
      {
        id: 'veh-1',
        registryLifecycle,
        vin: 'VIN1',
        make: 'Make',
        model: 'Model',
        year: 2024,
        licensePlate: 'PLATE',
        vehicleName: null,
        organizationId: 'org-1',
        dimoVehicleId: 'dv-1',
        organization: { companyName: 'Org' },
        dimoVehicle: {
          id: 'dv-1',
          connectionStatus: 'CONNECTED',
          lastSignal: null,
          externalId: 'ext',
          tokenId: 187336,
          syncedAt: null,
        },
        latestState: null,
      },
      Date.now(),
      { degraded: platformDegraded },
      null,
      providerLinkState ?? null,
    );

  it('list path: lifecycle only — OFFBOARDED stays disconnected under platform degradation', () => {
    const row = compose('OFFBOARDED', true);
    expect(row.integrationConnectivity).toBe('disconnected');
  });

  it('list path: does not infer REVOKED consent without provider link state', () => {
    const row = compose('ACTIVE', false);
    expect(row.integrationConnectivity).toBe('connected');
  });

  it('detail path: REVOKED provider link on ACTIVE registry yields error effective state', () => {
    const row = compose('ACTIVE', false, ProviderLinkState.REVOKED);
    expect(row.integrationConnectivity).toBe('error');
  });

  it('detail path: OFFBOARDED lifecycle wins over REVOKED provider link (no error chip)', () => {
    const row = compose('OFFBOARDED', false, ProviderLinkState.REVOKED);
    expect(row.integrationConnectivity).toBe('disconnected');
  });
});
