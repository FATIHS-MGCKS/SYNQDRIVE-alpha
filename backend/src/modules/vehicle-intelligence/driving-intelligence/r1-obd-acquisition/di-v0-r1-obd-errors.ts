import { DiV0PositionRequestError } from '../position-acquisition/di-v0-position-window';
import { DiV0VehicleJwtUnavailableError } from '../position-acquisition/di-v0-position-errors';
import type { DiV0R1ObdAcquisitionFailure } from './di-v0-r1-obd-acquisition.types';

export function buildR1ObdFailure(
  code: DiV0R1ObdAcquisitionFailure['code'],
  message: string,
  retryable = false,
): DiV0R1ObdAcquisitionFailure {
  return { code, message, retryable };
}

export function classifyDiV0R1ObdTransportError(error: unknown): DiV0R1ObdAcquisitionFailure {
  if (error instanceof DiV0PositionRequestError) {
    return buildR1ObdFailure('INVALID_REQUEST', error.message, false);
  }
  if (error instanceof DiV0VehicleJwtUnavailableError) {
    return buildR1ObdFailure('VEHICLE_JWT_UNAVAILABLE', error.message, false);
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('403') || msg.includes('forbidden') || msg.includes('unauthorized')) {
      return buildR1ObdFailure('AUTHORIZATION', error.message, false);
    }
    if (msg.includes('timeout') || msg.includes('etimedout')) {
      return buildR1ObdFailure('TIMEOUT', error.message, true);
    }
    if (msg.includes('econnreset') || msg.includes('network') || msg.includes('fetch failed')) {
      return buildR1ObdFailure('NETWORK', error.message, true);
    }
    return buildR1ObdFailure('MALFORMED_RESPONSE', error.message, false);
  }
  return buildR1ObdFailure('MALFORMED_RESPONSE', 'unknown error', false);
}
