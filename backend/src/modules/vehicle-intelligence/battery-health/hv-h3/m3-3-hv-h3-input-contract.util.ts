import { BatteryMeasurementScope } from '../battery-v2-domain';
import {
  M3_3_HV_H2_M2_SUPPORTED_MODEL_VERSION,
  M3_3_HV_H2_M3_SUPPORTED_MODEL_VERSION,
} from '../hv-h2/m3-3-hv-h2-eligibility.constants';
import type {
  M3_3HvH2LongitudinalInputCandidateV1,
  M3_3HvH2LongitudinalInputReportV1,
} from '../hv-h2/m3-3-hv-h2.types';
import { M3_3_HV_H3_INPUT_ANOMALY_CODES } from './m3-3-hv-h3.constants';

const M2_METHOD = 'M2_CURRENT_ENERGY_SOC';
const M3_METHOD = 'M3_ADDED_ENERGY_DELTA_SOC';
const PROVIDER_METHOD = 'PROVIDER_HV_SOH';

export function validateM3_3HvH3CandidateInputContract(
  c: M3_3HvH2LongitudinalInputCandidateV1,
  h2: M3_3HvH2LongitudinalInputReportV1,
): { ok: true } | { ok: false; code: string; detail: string } {
  if (c.organizationId !== h2.organizationId || c.vehicleId !== h2.vehicleId) {
    return {
      ok: false,
      code: M3_3_HV_H3_INPUT_ANOMALY_CODES.H3_TENANT_SCOPE_MISMATCH,
      detail: 'candidate org/vehicle does not match H2 report envelope',
    };
  }
  if (c.batteryScope !== BatteryMeasurementScope.HV) {
    return {
      ok: false,
      code: M3_3_HV_H3_INPUT_ANOMALY_CODES.MALFORMED_H2_METHOD_CONTRACT,
      detail: 'batteryScope must be HV',
    };
  }

  if (c.method === M2_METHOD) {
    if (
      c.methodRole !== 'METHOD_SHADOW_EVIDENCE' ||
      c.valueSemantic !== 'ESTIMATED_USABLE_CAPACITY_KWH' ||
      c.unit !== 'kWh' ||
      c.provider != null ||
      c.modelVersion !== M3_3_HV_H2_M2_SUPPORTED_MODEL_VERSION
    ) {
      return {
        ok: false,
        code: M3_3_HV_H3_INPUT_ANOMALY_CODES.MALFORMED_H2_METHOD_CONTRACT,
        detail: 'M2 method contract mismatch',
      };
    }
    return { ok: true };
  }

  if (c.method === M3_METHOD) {
    if (
      c.methodRole !== 'VALIDATION_ONLY' ||
      c.valueSemantic !== 'ESTIMATED_USABLE_CAPACITY_KWH' ||
      c.unit !== 'kWh' ||
      c.provider != null ||
      c.modelVersion !== M3_3_HV_H2_M3_SUPPORTED_MODEL_VERSION
    ) {
      return {
        ok: false,
        code: M3_3_HV_H3_INPUT_ANOMALY_CODES.MALFORMED_H2_METHOD_CONTRACT,
        detail: 'M3 method contract mismatch',
      };
    }
    return { ok: true };
  }

  if (c.method === PROVIDER_METHOD) {
    if (
      c.methodRole !== 'PROVIDER_EVIDENCE' ||
      c.valueSemantic !== 'PROVIDER_SOH_PERCENT' ||
      c.unit !== 'percent' ||
      !c.provider ||
      c.modelVersion != null
    ) {
      return {
        ok: false,
        code: M3_3_HV_H3_INPUT_ANOMALY_CODES.MALFORMED_H2_METHOD_CONTRACT,
        detail: 'provider SOH method contract mismatch',
      };
    }
    return { ok: true };
  }

  return {
    ok: false,
    code: M3_3_HV_H3_INPUT_ANOMALY_CODES.MALFORMED_H2_METHOD_CONTRACT,
    detail: `unsupported method ${c.method}`,
  };
}
