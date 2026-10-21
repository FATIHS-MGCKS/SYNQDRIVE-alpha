import {
  buildExp021CanaryCohortAuthority,
  EXP021_FIRST_LIVE_FORENSIC_VEHICLE_TRIP_ID,
  EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE,
  isForensicExcludedVehicleTrip,
  parseExp021CanaryCohortJson,
  resolveCohortMemberForTripIdentity,
} from './reference-capture-exp021-canary-live-window-cohort.lib';

describe('reference-capture-exp021-canary-live-window-cohort.lib', () => {
  it('parses valid cohort JSON', () => {
    const json = JSON.stringify(EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE);
    const members = parseExp021CanaryCohortJson(json);
    expect(members).toHaveLength(3);
    const authority = buildExp021CanaryCohortAuthority(members!);
    expect(authority?.tokenIds).toEqual([187336, 187361, 192922]);
  });

  it('rejects duplicate token or vehicle', () => {
    const members = parseExp021CanaryCohortJson(
      JSON.stringify([
        EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[0],
        EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[0],
      ]),
    );
    expect(buildExp021CanaryCohortAuthority(members!)).toBeNull();
  });

  it('resolveCohortMemberForTripIdentity requires vehicle-token pair', () => {
    const authority = buildExp021CanaryCohortAuthority([
      ...EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE,
    ])!;
    const mx = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[0];
    expect(
      resolveCohortMemberForTripIdentity({
        organizationId: mx.organizationId,
        vehicleId: mx.vehicleId,
        tokenId: mx.tokenId,
        cohort: authority,
      }),
    ).not.toBeNull();
    expect(
      resolveCohortMemberForTripIdentity({
        organizationId: mx.organizationId,
        vehicleId: mx.vehicleId,
        tokenId: 999999,
        cohort: authority,
      }),
    ).toBeNull();
  });

  it('forensic first live trip id is excluded at coordinator layer', () => {
    expect(isForensicExcludedVehicleTrip(EXP021_FIRST_LIVE_FORENSIC_VEHICLE_TRIP_ID)).toBe(true);
  });
});
