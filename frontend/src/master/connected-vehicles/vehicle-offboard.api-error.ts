export {
  VehicleOffboardRequestError,
  classifyOffboardHttpFailure,
  isTransportUncertainError,
  isStepUpRequiredOffboardError,
  isEnrollmentRequiredOffboardError,
  type OffboardErrorKind,
} from '../../lib/vehicle-offboard-api-error';

import type { VehicleOffboardPreflightBlockCode } from './vehicle-offboard.types';
import { VehicleOffboardRequestError } from '../../lib/vehicle-offboard-api-error';

export function blockingReasonsFromError(err: unknown): VehicleOffboardPreflightBlockCode[] {
  if (!(err instanceof VehicleOffboardRequestError)) return [];
  const details = err.details as { blockingReasons?: VehicleOffboardPreflightBlockCode[] } | undefined;
  return Array.isArray(details?.blockingReasons) ? details.blockingReasons : [];
}
