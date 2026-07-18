import {
  evaluateSetStationVehiclesPolicy,
  findImplicitHomeDetachIds,
  StationSetVehiclesListCompleteness,
  StationSetVehiclesPolicyIssueCode,
} from './station-set-vehicles.policy';

describe('station-set-vehicles.policy', () => {
  const stationHomeIds = Array.from({ length: 150 }, (_, index) => `home-${index + 1}`);

  it('detects vehicles that would be implicitly detached by legacy SET semantics', () => {
    const requested = stationHomeIds.slice(0, 120);
    const missing = findImplicitHomeDetachIds(stationHomeIds, requested);
    expect(missing).toHaveLength(30);
    expect(missing[0]).toBe('home-121');
  });

  it('rejects the 600-fleet / 500-loaded partial-list scenario', () => {
    const evaluation = evaluateSetStationVehiclesPolicy({
      disabledByFlag: false,
      stationHomeVehicleIds: stationHomeIds,
      requestedVehicleIds: stationHomeIds.slice(0, 120),
      listCompleteness: undefined,
    });

    expect(evaluation.allowed).toBe(false);
    expect(evaluation.wouldImplicitlyDetachIds).toHaveLength(30);
    expect(evaluation.blockingReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationSetVehiclesPolicyIssueCode.INCOMPLETE_STATION_HOME_LIST,
          missingCount: 30,
        }),
      ]),
    );
  });

  it('rejects explicitly declared partial lists', () => {
    const evaluation = evaluateSetStationVehiclesPolicy({
      disabledByFlag: false,
      stationHomeVehicleIds: ['veh-1'],
      requestedVehicleIds: ['veh-1'],
      listCompleteness: StationSetVehiclesListCompleteness.PARTIAL,
    });

    expect(evaluation.allowed).toBe(false);
    expect(evaluation.blockingReasons[0]?.code).toBe(
      StationSetVehiclesPolicyIssueCode.PARTIAL_LIST_DECLARED,
    );
  });

  it('allows attach-only payloads that include every current home vehicle', () => {
    const evaluation = evaluateSetStationVehiclesPolicy({
      disabledByFlag: false,
      stationHomeVehicleIds: ['veh-1', 'veh-2'],
      requestedVehicleIds: ['veh-1', 'veh-2', 'veh-3'],
    });

    expect(evaluation.allowed).toBe(true);
    expect(evaluation.wouldImplicitlyDetachIds).toEqual([]);
  });

  it('blocks when feature flag disables the endpoint', () => {
    const evaluation = evaluateSetStationVehiclesPolicy({
      disabledByFlag: true,
      stationHomeVehicleIds: [],
      requestedVehicleIds: [],
    });

    expect(evaluation.allowed).toBe(false);
    expect(evaluation.blockingReasons[0]?.code).toBe(
      StationSetVehiclesPolicyIssueCode.ENDPOINT_DISABLED,
    );
  });
});
