import {
  buildHomeFleetVehicleIdempotencyKey,
  evaluateAddVehicleToHomeStation,
  evaluateMoveVehicleToHomeStation,
  evaluateRemoveVehicleFromHomeStation,
} from './vehicle-home-fleet-delta.util';
import {
  VehicleHomeFleetDeltaItemOutcome,
  VehicleHomeFleetDeltaIssueCode,
} from './vehicle-home-fleet-delta.types';

describe('vehicle-home-fleet-delta.util', () => {
  const ORG = 'org-1';
  const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const VEHICLE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  it('builds stable idempotency keys with and without batch key', () => {
    const withoutBatch = buildHomeFleetVehicleIdempotencyKey({
      operation: 'add',
      organizationId: ORG,
      stationId: STATION_A,
      vehicleId: VEHICLE,
    });
    const withBatch = buildHomeFleetVehicleIdempotencyKey({
      operation: 'add',
      organizationId: ORG,
      stationId: STATION_A,
      vehicleId: VEHICLE,
      batchIdempotencyKey: 'batch-123',
    });

    expect(withoutBatch).toBe(`home-fleet:add:${ORG}:${STATION_A}:${VEHICLE}`);
    expect(withBatch).toBe(`batch-123:${VEHICLE}`);
  });

  it('treats add as idempotent when vehicle already at target station', () => {
    const result = evaluateAddVehicleToHomeStation({
      vehicleId: VEHICLE,
      homeStationId: STATION_A,
      targetStationId: STATION_A,
      vehicleStatus: 'AVAILABLE',
    });

    expect(result.outcome).toBe(VehicleHomeFleetDeltaItemOutcome.IDEMPOTENT);
  });

  it('fails remove when vehicle is not at source station', () => {
    const result = evaluateRemoveVehicleFromHomeStation({
      sourceStationId: STATION_A,
      homeStationId: STATION_B,
      vehicleStatus: 'AVAILABLE',
    });

    expect(result.outcome).toBe(VehicleHomeFleetDeltaItemOutcome.FAILED);
    expect(result.error?.code).toBe(VehicleHomeFleetDeltaIssueCode.NOT_AT_SOURCE_STATION);
  });

  it('fails move when source and target are identical', () => {
    const result = evaluateMoveVehicleToHomeStation({
      sourceStationId: STATION_A,
      targetStationId: STATION_A,
      homeStationId: STATION_A,
      vehicleStatus: 'AVAILABLE',
    });

    expect(result.outcome).toBe(VehicleHomeFleetDeltaItemOutcome.FAILED);
    expect(result.error?.code).toBe(VehicleHomeFleetDeltaIssueCode.TARGET_SAME_AS_SOURCE);
  });
});
