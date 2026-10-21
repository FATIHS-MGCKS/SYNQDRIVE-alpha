import {
  BATTERY_HV_H4_A3_RECONCILIATION_COHORT_JSON_ENV,
  M3_3_HV_H4_A3_RECONCILIATION_COHORT_V1,
  computeHvH4A3ReconciliationCohortFingerprintSha256V1,
  evaluateBatteryHvH4A3ReconciliationCohortRuntimeV1,
  isHvH4A3ReconciliationCohortMemberV1,
} from './m3-3-hv-h4-a3-reconciliation-cohort.config';
import { BATTERY_HV_H4_A3_RECONCILIATION_ENABLED_ENV } from './m3-3-hv-h4-a3-reconciliation.config';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const TESLA = '68868291-5478-42cd-b0c4-cc77b2a78e21';

function envWithCohort(members: Array<{ organizationId: string; vehicleId: string }>) {
  return {
    [BATTERY_HV_H4_A3_RECONCILIATION_ENABLED_ENV]: 'true',
    [BATTERY_HV_H4_A3_RECONCILIATION_COHORT_JSON_ENV]: JSON.stringify({
      version: M3_3_HV_H4_A3_RECONCILIATION_COHORT_V1,
      members,
    }),
  } as NodeJS.ProcessEnv;
}

describe('m3-3-hv-h4-a3-reconciliation-cohort.config', () => {
  it('DISABLED when master reconciliation flag is OFF', () => {
    const runtime = evaluateBatteryHvH4A3ReconciliationCohortRuntimeV1({
      [BATTERY_HV_H4_A3_RECONCILIATION_ENABLED_ENV]: 'false',
      [BATTERY_HV_H4_A3_RECONCILIATION_COHORT_JSON_ENV]: '{}',
    });
    expect(runtime.state).toBe('DISABLED');
  });

  it('MISSING when enabled without cohort JSON', () => {
    const runtime = evaluateBatteryHvH4A3ReconciliationCohortRuntimeV1({
      [BATTERY_HV_H4_A3_RECONCILIATION_ENABLED_ENV]: 'true',
    });
    expect(runtime.state).toBe('MISSING');
  });

  it('INVALID on malformed JSON and duplicate members', () => {
    expect(
      evaluateBatteryHvH4A3ReconciliationCohortRuntimeV1(
        envWithCohort([
          { organizationId: ORG, vehicleId: TESLA },
          { organizationId: ORG, vehicleId: TESLA },
        ]),
      ).state,
    ).toBe('INVALID');

    const bad = { ...envWithCohort([{ organizationId: ORG, vehicleId: TESLA }]) };
    bad[BATTERY_HV_H4_A3_RECONCILIATION_COHORT_JSON_ENV] = '{not-json';
    expect(evaluateBatteryHvH4A3ReconciliationCohortRuntimeV1(bad).state).toBe('INVALID');
  });

  it('READY with stable fingerprint for authorized Tesla cohort', () => {
    const runtime = evaluateBatteryHvH4A3ReconciliationCohortRuntimeV1(
      envWithCohort([{ organizationId: ORG, vehicleId: TESLA }]),
    );
    expect(runtime.state).toBe('READY');
    expect(runtime.config?.members).toHaveLength(1);
    expect(
      isHvH4A3ReconciliationCohortMemberV1(runtime.config!, ORG, TESLA),
    ).toBe(true);
    expect(
      isHvH4A3ReconciliationCohortMemberV1(
        runtime.config!,
        '00000000-0000-4000-8000-000000000099',
        TESLA,
      ),
    ).toBe(false);
    const fp = computeHvH4A3ReconciliationCohortFingerprintSha256V1(runtime.config!);
    expect(runtime.configFingerprintSha256).toBe(fp);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});
