import type { LongitudinalProfileMaterializationRuntimeService } from './longitudinal-profile-materialization.runtime.service';
import {
  getBatteryV2LongitudinalMaterializationSessionLimit,
  normalizeLongitudinalMaterializationSessionLimitOverride,
} from './longitudinal-profile-materialization.runtime-config';

export type LongitudinalProfileMaterializeOpsInput = {
  organizationId: string;
  vehicleId: string;
  sessionLimitOverride?: number;
};

export type LongitudinalProfileMaterializeOpsResult =
  | { status: 'INVALID_ARGS'; message: string }
  | Awaited<ReturnType<LongitudinalProfileMaterializationRuntimeService['materialize']>>;

export async function runLongitudinalProfileMaterializeOps(
  runtime: Pick<LongitudinalProfileMaterializationRuntimeService, 'materialize'>,
  input: LongitudinalProfileMaterializeOpsInput,
): Promise<LongitudinalProfileMaterializeOpsResult> {
  const organizationId = input.organizationId?.trim();
  const vehicleId = input.vehicleId?.trim();

  if (!organizationId || !vehicleId) {
    return {
      status: 'INVALID_ARGS',
      message: 'organizationId and vehicleId are required',
    };
  }

  const sessionLimit = normalizeLongitudinalMaterializationSessionLimitOverride(
    input.sessionLimitOverride,
  );

  return runtime.materialize({
    organizationId,
    vehicleId,
    sessionLimit,
    profileGeneratedAt: new Date().toISOString(),
  });
}

export function describeLongitudinalMaterializationSessionLimitForOps(
  sessionLimitOverride: number | undefined,
): { sessionLimit: number; configuredDefault: number } {
  return {
    sessionLimit: normalizeLongitudinalMaterializationSessionLimitOverride(sessionLimitOverride),
    configuredDefault: getBatteryV2LongitudinalMaterializationSessionLimit(),
  };
}
