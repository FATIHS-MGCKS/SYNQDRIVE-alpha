import { StationsPermissionErrorCode } from './stations-access.service';
import { StationsManageTransfersPermissionGuard } from './guards/stations-manage-transfers-permission.guard';
import { StationsCorrectVehicleCurrentPermissionGuard } from './guards/stations-correct-vehicle-current-permission.guard';
import { StationsOverrideRulesPermissionGuard } from './guards/stations-override-rules-permission.guard';
import {
  AUTHZ_PERSONAS,
  AUTHZ_STATION_A,
  AUTHZ_VEHICLE,
  type AuthzEndpointCase,
} from './testing/stations-v2-authz.fixtures';
import { StationsV2AuthzHarness } from './testing/stations-v2-authz.harness';

const TRANSFER_ENDPOINTS: AuthzEndpointCase[] = [
  {
    key: 'transfer-plan',
    method: 'POST',
    permission: 'stations.manage_transfers',
    scope: { resource: 'vehicle_location' },
    body: {
      vehicleId: AUTHZ_VEHICLE,
      toStationId: AUTHZ_STATION_A,
      reason: 'Reposition',
    },
  },
];

const EXTENDED_MUTATION_ENDPOINTS: AuthzEndpointCase[] = [
  {
    key: 'correct-current-station',
    method: 'POST',
    permission: 'stations.manage_current_location',
    scope: { resource: 'vehicle_location' },
    body: {
      vehicleId: AUTHZ_VEHICLE,
      currentStationId: AUTHZ_STATION_A,
      source: 'MANUAL',
      reason: 'Count',
      expectedVersion: 0,
    },
  },
  {
    key: 'booking-rules-evaluate',
    method: 'POST',
    permission: 'stations.read',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
    body: { pickupAt: '2026-07-18T10:00:00.000Z', returnAt: '2026-07-19T10:00:00.000Z' },
  },
];

describe('Stations V2 transfers and extended mutation authz', () => {
  const harness = new StationsV2AuthzHarness();
  const manageTransfersGuard = new StationsManageTransfersPermissionGuard(harness.stationsAccess);
  const correctCurrentGuard = new StationsCorrectVehicleCurrentPermissionGuard(harness.stationsAccess);
  const overrideRulesGuard = new StationsOverrideRulesPermissionGuard(harness.stationsAccess);

  beforeEach(() => harness.reset());

  it.each(TRANSFER_ENDPOINTS.map((endpoint) => [endpoint.key, endpoint]))(
    'allows org admin on transfer endpoint %s',
    async (_key, endpoint) => {
      await expect(harness.assertAllowed(endpoint, AUTHZ_PERSONAS.orgAdmin)).resolves.toBeUndefined();
    },
  );

  it.each(TRANSFER_ENDPOINTS.map((endpoint) => [endpoint.key, endpoint]))(
    'denies driver on transfer endpoint %s',
    async (_key, endpoint) => {
      const error = await harness.assertDenied(endpoint, AUTHZ_PERSONAS.driver);
      harness.expectDeniedCode(error, StationsPermissionErrorCode.MISSING_PERMISSION);
    },
  );

  it('enforces manage_transfers permission on transfer guard', async () => {
    const request = harness.buildRequest(AUTHZ_PERSONAS.readOnly, TRANSFER_ENDPOINTS[0]);
    harness.setPersona(AUTHZ_PERSONAS.readOnly);

    await expect(
      manageTransfersGuard.canActivate({
        switchToHttp: () => ({ getRequest: () => request }),
      } as never),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationsPermissionErrorCode.MISSING_PERMISSION,
      }),
    });
  });

  it('allows worker on correct-current-station via specialized guard', async () => {
    const endpoint = EXTENDED_MUTATION_ENDPOINTS[0];
    const request = harness.buildRequest(AUTHZ_PERSONAS.worker, endpoint);
    harness.setPersona(AUTHZ_PERSONAS.worker);

    await expect(correctCurrentGuard.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
    } as never)).resolves.toBe(true);
  });

  it('denies read-only user on booking-rules evaluate override guard', async () => {
    const endpoint = EXTENDED_MUTATION_ENDPOINTS[1];
    const request = harness.buildRequest(AUTHZ_PERSONAS.readOnly, endpoint);
    harness.setPersona(AUTHZ_PERSONAS.readOnly);

    await expect(
      overrideRulesGuard.canActivate({
        switchToHttp: () => ({ getRequest: () => request }),
      } as never),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationsPermissionErrorCode.MISSING_PERMISSION,
      }),
    });
  });
});
