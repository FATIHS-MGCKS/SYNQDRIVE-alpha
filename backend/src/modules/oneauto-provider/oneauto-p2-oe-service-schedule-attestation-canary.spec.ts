import { OneAutoExecutionAuthorizationMode } from '@prisma/client';
import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from './catalog/oneauto-verified-contracts';
import { buildOneAutoContractGateReport } from './catalog/oneauto-verified-contracts';
import { isOneAutoPathAllowlisted } from './client/oneauto-allowlist';
import { buildAttestationScopedOeServiceScheduleHttpContract } from './service-schedule/oneauto-oe-service-schedule-attestation-contract.util';
import {
  ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_ACCOUNT_PRICING_VERIFIED_ENV,
  ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_ENABLED_ENV,
  ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_OWNER_AUTHORIZED_ENV,
  ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_ORG_ID_ENV,
  ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_VEHICLE_ID_ENV,
  ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_VIN_ENV,
} from './service-schedule/oneauto-oe-service-schedule-attestation-canary.constants';
import { loadOneAutoOeServiceScheduleAttestationCanaryFromEnv } from './service-schedule/oneauto-oe-service-schedule-attestation-canary.config';
import {
  assertAttestationRequestScope,
  resolveAttestationPricingSourceVersion,
} from './service-schedule/oneauto-oe-service-schedule-attestation-guards.util';
import { resolveOneAutoExecutionContractForJob } from './service-schedule/oneauto-oe-service-schedule-execution-contract-resolver.util';
import { ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU } from './service-schedule/oneauto-service-schedule-eu.types';
import { evaluateOneAutoFullDataCallbackPayload } from './oneauto-callback-full-data.util';
import { getDocumentedOneAutoContract } from './catalog/oneauto-documented-contracts';
import { buildOeServiceScheduleSuccessEnvelope, ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN } from './service-schedule/oneauto-oe-service-schedule.fixtures';
import { isOneAutoSkuRuntimeExecutionEnabled } from './oneauto-sku-runtime-activation.util';

describe('OneAuto P2 OE Service Schedule attestation canary (offline)', () => {
  const targetOrg = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
  const targetVehicle = '8c850ff1-4201-432b-af2e-2711dbc7ca48';
  const targetVin = 'WVWZZZ3HZLE010725';

  const envKeys = [
    ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_ENABLED_ENV,
    ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_ORG_ID_ENV,
    ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_VEHICLE_ID_ENV,
    ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_VIN_ENV,
    ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_ACCOUNT_PRICING_VERIFIED_ENV,
    ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_OWNER_AUTHORIZED_ENV,
  ] as const;

  afterEach(() => {
    for (const key of envKeys) delete process.env[key];
  });

  function armEnv() {
    process.env[ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_ENABLED_ENV] = '1';
    process.env[ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_ORG_ID_ENV] = targetOrg;
    process.env[ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_VEHICLE_ID_ENV] = targetVehicle;
    process.env[ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_VIN_ENV] = targetVin;
    process.env[ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_ACCOUNT_PRICING_VERIFIED_ENV] = '1';
    process.env[ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_OWNER_AUTHORIZED_ENV] = '1';
  }

  it('keeps global execution-verified registry unchanged (no OE_SERVICE_SCHEDULE seed)', () => {
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.has('OE_SERVICE_SCHEDULE')).toBe(false);
    expect(buildOneAutoContractGateReport('OE_SERVICE_SCHEDULE').executable).toBe(false);
  });

  it('defaults attestation canary OFF', () => {
    const cfg = loadOneAutoOeServiceScheduleAttestationCanaryFromEnv();
    expect(cfg.enabled).toBe(false);
    expect(cfg.ownerAuthorized).toBe(false);
  });

  it('rejects scope when canary disabled', () => {
    expect(() =>
      assertAttestationRequestScope({
        cfg: loadOneAutoOeServiceScheduleAttestationCanaryFromEnv(),
        organizationId: targetOrg,
        vehicleId: targetVehicle,
        vehicleVin: targetVin,
        serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
      }),
    ).toThrow(expect.objectContaining({ code: 'ATTESTATION_CANARY_DISABLED' }));
  });

  it('rejects wrong organization, vehicle, and VIN', () => {
    armEnv();
    const cfg = loadOneAutoOeServiceScheduleAttestationCanaryFromEnv();
    expect(() =>
      assertAttestationRequestScope({
        cfg,
        organizationId: 'other-org',
        vehicleId: targetVehicle,
        vehicleVin: targetVin,
        serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
      }),
    ).toThrow(expect.objectContaining({ code: 'ATTESTATION_TARGET_ORG_MISMATCH' }));
    expect(() =>
      assertAttestationRequestScope({
        cfg,
        organizationId: targetOrg,
        vehicleId: 'other-vehicle',
        vehicleVin: targetVin,
        serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
      }),
    ).toThrow(expect.objectContaining({ code: 'ATTESTATION_TARGET_VEHICLE_MISMATCH' }));
    expect(() =>
      assertAttestationRequestScope({
        cfg,
        organizationId: targetOrg,
        vehicleId: targetVehicle,
        vehicleVin: 'WBA12345678901234',
        serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
      }),
    ).toThrow(expect.objectContaining({ code: 'ATTESTATION_TARGET_VIN_MISMATCH' }));
  });

  it('rejects missing owner and account-pricing latches', () => {
    process.env[ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_ENABLED_ENV] = '1';
    process.env[ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_ORG_ID_ENV] = targetOrg;
    process.env[ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_VEHICLE_ID_ENV] = targetVehicle;
    process.env[ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_VIN_ENV] = targetVin;
    const cfg = loadOneAutoOeServiceScheduleAttestationCanaryFromEnv();
    expect(() =>
      assertAttestationRequestScope({
        cfg,
        organizationId: targetOrg,
        vehicleId: targetVehicle,
        vehicleVin: targetVin,
        serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
      }),
    ).toThrow(expect.objectContaining({ code: 'ATTESTATION_ACCOUNT_PRICING_NOT_VERIFIED' }));
  });

  it('resolves attestation-scoped HTTP contract without global registry membership', () => {
    const contract = resolveOneAutoExecutionContractForJob({
      serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
      executionAuthorizationMode: OneAutoExecutionAuthorizationMode.ATTESTATION_CANARY,
    });
    expect(contract).toBeDefined();
    expect(contract!.asyncCompletionMode).toBe('CALLBACK_FULL_DATA');
    const attestation = buildAttestationScopedOeServiceScheduleHttpContract();
    expect(isOneAutoPathAllowlisted(attestation.httpMethod, attestation.providerPathTemplate)).toBe(
      false,
    );
  });

  it('processes schedule full-data callback envelope offline (E4 reuse)', () => {
    const documented = getDocumentedOneAutoContract(ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU)!;
    const body = {
      status: 200,
      result: buildOeServiceScheduleSuccessEnvelope(ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN),
    };
    const evaluation = evaluateOneAutoFullDataCallbackPayload({
      body,
      contract: documented,
      jobVinSnapshot: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
      vehicleVin: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
    });
    expect(evaluation.ok).toBe(true);
  });

  it('does not enable general SKU runtime by attestation flags alone', () => {
    armEnv();
    expect(isOneAutoSkuRuntimeExecutionEnabled(ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU)).toBe(false);
  });

  it('uses dedicated attestation pricing source version', () => {
    expect(resolveAttestationPricingSourceVersion()).toBe(
      'synqdrive-p2-oe-service-schedule-attestation-canary-v1',
    );
  });
});
