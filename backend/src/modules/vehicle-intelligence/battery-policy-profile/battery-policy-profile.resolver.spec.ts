import {
  BatteryChemistry,
  BatteryDriveProfile,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
} from '../battery-health/battery-v2-domain';
import { getPolicyDefinition } from './battery-policy-profile.catalog';
import {
  guardMeasurementQualityForPolicy,
  isMeasurementAllowedForPolicy,
  isStartProxyAllowedForPolicy,
  resolveBatteryPolicy,
} from './battery-policy-profile.resolver';
import { BatteryPolicyProfile } from './battery-policy-profile.types';

describe('resolveBatteryPolicy', () => {
  const cases: Array<{
    name: string;
    input: Parameters<typeof resolveBatteryPolicy>[0];
    expectedProfile: BatteryPolicyProfile;
  }> = [
    {
      name: 'ICE + LEAD_ACID → ICE_LEAD_ACID',
      input: {
        driveProfile: BatteryDriveProfile.ICE,
        chemistry: BatteryChemistry.LEAD_ACID,
      },
      expectedProfile: BatteryPolicyProfile.ICE_LEAD_ACID,
    },
    {
      name: 'ICE + AGM → ICE_AGM',
      input: {
        driveProfile: BatteryDriveProfile.ICE,
        chemistry: BatteryChemistry.AGM,
      },
      expectedProfile: BatteryPolicyProfile.ICE_AGM,
    },
    {
      name: 'ICE + EFB → ICE_EFB',
      input: {
        driveProfile: BatteryDriveProfile.ICE,
        chemistry: BatteryChemistry.EFB,
      },
      expectedProfile: BatteryPolicyProfile.ICE_EFB,
    },
    {
      name: 'HEV + AGM → ICE_AGM with HV pipeline',
      input: {
        driveProfile: BatteryDriveProfile.HEV,
        chemistry: BatteryChemistry.AGM,
      },
      expectedProfile: BatteryPolicyProfile.ICE_AGM,
    },
    {
      name: 'PHEV + EFB → PHEV_AUX',
      input: {
        driveProfile: BatteryDriveProfile.PHEV,
        chemistry: BatteryChemistry.EFB,
      },
      expectedProfile: BatteryPolicyProfile.PHEV_AUX,
    },
    {
      name: 'BEV without LV → UNSUPPORTED_PROFILE',
      input: {
        driveProfile: BatteryDriveProfile.BEV,
        chemistry: BatteryChemistry.UNKNOWN,
        lvSignalPresent: false,
      },
      expectedProfile: BatteryPolicyProfile.UNSUPPORTED_PROFILE,
    },
    {
      name: 'BEV with LV + LEAD_ACID → EV_AUX_LEAD_ACID',
      input: {
        driveProfile: BatteryDriveProfile.BEV,
        chemistry: BatteryChemistry.LEAD_ACID,
        lvSignalPresent: true,
      },
      expectedProfile: BatteryPolicyProfile.EV_AUX_LEAD_ACID,
    },
    {
      name: 'BEV with LV + LITHIUM → EV_AUX_LITHIUM',
      input: {
        driveProfile: BatteryDriveProfile.BEV,
        chemistry: BatteryChemistry.LITHIUM,
        lvSignalPresent: true,
      },
      expectedProfile: BatteryPolicyProfile.EV_AUX_LITHIUM,
    },
    {
      name: 'ICE + UNKNOWN chemistry → UNKNOWN_PROFILE',
      input: {
        driveProfile: BatteryDriveProfile.ICE,
        chemistry: BatteryChemistry.UNKNOWN,
      },
      expectedProfile: BatteryPolicyProfile.UNKNOWN_PROFILE,
    },
    {
      name: 'UNKNOWN drive → UNKNOWN_PROFILE',
      input: {
        driveProfile: BatteryDriveProfile.UNKNOWN,
        chemistry: BatteryChemistry.AGM,
      },
      expectedProfile: BatteryPolicyProfile.UNKNOWN_PROFILE,
    },
  ];

  it.each(cases)('$name', ({ input, expectedProfile }) => {
    const policy = resolveBatteryPolicy(input);
    expect(policy.profile).toBe(expectedProfile);
    expect(policy.driveProfile).toBe(input.driveProfile);
    expect(policy.chemistry).toBe(input.chemistry);
  });
});

describe('policy catalog capabilities', () => {
  it('ICE_LEAD_ACID allows REST and start proxy with LA resting bands', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.LEAD_ACID,
    });
    expect(policy.lvAssessmentAllowed).toBe(true);
    expect(policy.startProxyAllowed).toBe(true);
    expect(policy.hvPipelineAllowed).toBe(false);
    expect(policy.chemicalSocEstimationAllowed).toBe(true);
    expect(policy.restingBands?.goodMinV).toBe(12.5);
    expect(
      isMeasurementAllowedForPolicy(policy, BatteryMeasurementType.REST_60M),
    ).toBe(true);
    expect(
      isMeasurementAllowedForPolicy(policy, BatteryMeasurementType.START_DIP_PROXY),
    ).toBe(true);
  });

  it('ICE_AGM uses higher AGM resting bands', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.AGM,
    });
    expect(policy.profile).toBe(BatteryPolicyProfile.ICE_AGM);
    expect(policy.restingBands?.goodMinV).toBe(12.6);
  });

  it('ICE_EFB keeps distinct profile with AGM-like resting bands', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.EFB,
    });
    expect(policy.profile).toBe(BatteryPolicyProfile.ICE_EFB);
    expect(policy.restingBands?.chemistry).toBe(BatteryChemistry.EFB);
    expect(policy.restingBands?.goodMinV).toBe(12.6);
  });

  it('PHEV_AUX enables HV pipeline and gates start proxy on confirmed ICE start', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.PHEV,
      chemistry: BatteryChemistry.AGM,
    });
    expect(policy.hvPipelineAllowed).toBe(true);
    expect(policy.startProxyRequiresConfirmedIceStart).toBe(true);
    expect(
      isStartProxyAllowedForPolicy(policy, { confirmedIceStart: false }),
    ).toBe(false);
    expect(
      isStartProxyAllowedForPolicy(policy, { confirmedIceStart: true }),
    ).toBe(true);
    expect(
      isMeasurementAllowedForPolicy(
        policy,
        BatteryMeasurementType.START_DIP_PROXY,
        { confirmedIceStart: false },
      ),
    ).toBe(false);
    expect(
      isMeasurementAllowedForPolicy(
        policy,
        BatteryMeasurementType.START_DIP_PROXY,
        { confirmedIceStart: true },
      ),
    ).toBe(true);
  });

  it('EV_AUX_LEAD_ACID allows live LV and HV but forbids REST/crank', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.BEV,
      chemistry: BatteryChemistry.LEAD_ACID,
      lvSignalPresent: true,
    });
    expect(policy.lvAssessmentAllowed).toBe(false);
    expect(policy.chemicalSocEstimationAllowed).toBe(false);
    expect(
      isMeasurementAllowedForPolicy(policy, BatteryMeasurementType.LIVE_VOLTAGE),
    ).toBe(true);
    expect(
      isMeasurementAllowedForPolicy(policy, BatteryMeasurementType.REST_60M),
    ).toBe(false);
    expect(
      isMeasurementAllowedForPolicy(policy, BatteryMeasurementType.LIVE_HV_SOC),
    ).toBe(true);
  });

  it('EV_AUX_LITHIUM forbids lead-acid resting bands and SOC estimation', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.BEV,
      chemistry: BatteryChemistry.LITHIUM,
      lvSignalPresent: true,
    });
    expect(policy.restingBands).toBeNull();
    expect(policy.chemicalSocEstimationAllowed).toBe(false);
    expect(
      isMeasurementAllowedForPolicy(policy, BatteryMeasurementType.REST_60M),
    ).toBe(false);
  });

  it('UNKNOWN_PROFILE allows live LV only — no REST, crank, or chemical SOC', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.UNKNOWN,
    });
    expect(policy.chemicalSocEstimationAllowed).toBe(false);
    expect(policy.lvAssessmentAllowed).toBe(false);
    expect(
      isMeasurementAllowedForPolicy(policy, BatteryMeasurementType.LIVE_VOLTAGE),
    ).toBe(true);
    expect(
      isMeasurementAllowedForPolicy(policy, BatteryMeasurementType.REST_60M),
    ).toBe(false);
    expect(
      isMeasurementAllowedForPolicy(policy, BatteryMeasurementType.START_DIP_PROXY),
    ).toBe(false);
  });

  it('UNSUPPORTED_PROFILE is HV-only for BEV without LV signal', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.BEV,
      chemistry: BatteryChemistry.UNKNOWN,
      lvSignalPresent: false,
    });
    expect(policy.profile).toBe(BatteryPolicyProfile.UNSUPPORTED_PROFILE);
    expect(policy.hvPipelineAllowed).toBe(true);
    expect(policy.lvAssessmentAllowed).toBe(false);
    expect(
      isMeasurementAllowedForPolicy(policy, BatteryMeasurementType.LIVE_VOLTAGE),
    ).toBe(false);
    expect(
      isMeasurementAllowedForPolicy(policy, BatteryMeasurementType.LIVE_HV_SOC),
    ).toBe(true);
  });
});

describe('guardMeasurementQualityForPolicy', () => {
  it('downgrades forbidden measurements to UNSUPPORTED_PROFILE', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.BEV,
      chemistry: BatteryChemistry.UNKNOWN,
      lvSignalPresent: false,
    });
    const quality = guardMeasurementQualityForPolicy({
      policy,
      measurementType: BatteryMeasurementType.REST_60M,
      quality: BatteryMeasurementQuality.VALID,
    });
    expect(quality).toBe(BatteryMeasurementQuality.UNSUPPORTED_PROFILE);
  });

  it('passes through MISSED for forbidden measurement types', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.BEV,
      chemistry: BatteryChemistry.UNKNOWN,
      lvSignalPresent: false,
    });
    const quality = guardMeasurementQualityForPolicy({
      policy,
      measurementType: BatteryMeasurementType.REST_60M,
      quality: BatteryMeasurementQuality.MISSED,
    });
    expect(quality).toBe(BatteryMeasurementQuality.MISSED);
  });
});

describe('catalog completeness', () => {
  it.each(Object.values(BatteryPolicyProfile))(
    'defines %s with supported and forbidden measurement sets',
    (profile) => {
      const definition = getPolicyDefinition(profile);
      expect(definition.supportedMeasurementTypes.length).toBeGreaterThan(0);
      expect(definition.minimumContext).toBeDefined();
    },
  );
});
