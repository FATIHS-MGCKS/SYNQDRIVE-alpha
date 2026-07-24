import { getErrorMessage } from '../../lib/api';
import type { TelemetryAccessBlockReason } from './vehicle-detail-polling-policy';

/** Classify telemetry/GPS 403 responses for polling pause. */
export function classifyTelemetryAccessError(
  err: unknown,
): TelemetryAccessBlockReason | null {
  const message = getErrorMessage(err);
  if (/Missing permission:\s*fleet\.read/i.test(message)) {
    return 'permission';
  }
  if (
    /DATA_AUTHORIZATION_DENIED/i.test(message) ||
    /data authorization/i.test(message) ||
    /No active data authorization/i.test(message)
  ) {
    return 'data_authorization';
  }
  return null;
}
