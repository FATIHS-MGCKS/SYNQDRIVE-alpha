import { BatteryEvidenceScope } from '@prisma/client';

/** D3/F5 primary longitudinal pipeline represents LV rest-session evidence (not HV). */
export const F5_LONGITUDINAL_SCOPE_AUTHORITY =
  'LV_REST_SESSION_LONGITUDINAL_PIPELINE_V1' as const;

export const F5_GROUND_TRUTH_CORRELATION_BATTERY_SCOPE: BatteryEvidenceScope =
  BatteryEvidenceScope.LV;

export const F5_MAX_GROUND_TRUTH_ROWS_PER_REPORT = 5_000;
