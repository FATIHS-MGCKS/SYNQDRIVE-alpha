import type { LongitudinalProfileMaterializationRuntimeService } from './longitudinal-profile-materialization.runtime.service';
import {
  getBatteryV2LongitudinalMaterializationSessionLimit,
  resolveLongitudinalMaterializationSessionLimitOverride,
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

  const limitResolution = resolveLongitudinalMaterializationSessionLimitOverride(
    input.sessionLimitOverride,
  );
  if (limitResolution.status === 'INVALID_OVERRIDE') {
    return {
      status: 'INVALID_ARGS',
      message: limitResolution.message,
    };
  }

  return runtime.materialize({
    organizationId,
    vehicleId,
    sessionLimit: limitResolution.sessionLimit,
    profileGeneratedAt: new Date().toISOString(),
  });
}

export function describeLongitudinalMaterializationSessionLimitForOps(
  sessionLimitOverride: number | undefined,
): { sessionLimit: number; configuredDefault: number } | { status: 'INVALID_ARGS'; message: string } {
  const resolved = resolveLongitudinalMaterializationSessionLimitOverride(sessionLimitOverride);
  if (resolved.status === 'INVALID_OVERRIDE') {
    return { status: 'INVALID_ARGS', message: resolved.message };
  }
  return {
    sessionLimit: resolved.sessionLimit,
    configuredDefault: getBatteryV2LongitudinalMaterializationSessionLimit(),
  };
}
