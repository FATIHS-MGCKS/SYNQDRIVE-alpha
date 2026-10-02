/**
 * Telemetry source family — classification of the *actual* telemetry integration
 * behind a DIMO vehicle, derived from stored DIMO device identity
 * (`DimoVehicle.rawJson`), NOT from `Vehicle.hardwareType`.
 *
 * `hardwareType` is a manually assigned routing enum (`LTE_R1 | SMART5 | UNKNOWN`)
 * with no value for API-synthetic integrations; production vehicles backed by a
 * Tesla synthetic device are currently registered as `LTE_R1`. It therefore must
 * not be used to decide telemetry *semantics*.
 *
 * Scope (EXP-021 C0.3): used only for R1 temporal-safety containment. It does not
 * change hardware routing, capability resolution, or any persisted field.
 */

export type TelemetrySourceFamily = 'RUPTELA_R1' | 'API_SYNTHETIC' | 'UNKNOWN';

/** Ruptela R1 LTE aftermarket device serials observed in DIMO identity data. */
export const RUPTELA_R1_SERIAL_PREFIX = 'R1-';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Resolve the telemetry source family from `DimoVehicle.rawJson`.
 *
 * - RUPTELA_R1    : `aftermarketDevice.serial` is a string starting with `R1-`
 *                   and no `syntheticDevice` is present.
 * - API_SYNTHETIC : `syntheticDevice` is an object and `aftermarketDevice` is
 *                   absent/null.
 * - UNKNOWN       : anything else (missing, malformed, conflicting, other device
 *                   serial families). Fails closed — never guesses a family.
 */
export function resolveTelemetrySourceFamily(rawJson: unknown): TelemetrySourceFamily {
  if (!isPlainObject(rawJson)) return 'UNKNOWN';

  const aftermarket = rawJson.aftermarketDevice;
  const synthetic = rawJson.syntheticDevice;
  const hasAftermarket = aftermarket != null;
  const hasSynthetic = synthetic != null;

  if (hasAftermarket && hasSynthetic) return 'UNKNOWN';

  if (hasAftermarket) {
    if (!isPlainObject(aftermarket)) return 'UNKNOWN';
    const serial = aftermarket.serial;
    if (typeof serial === 'string' && serial.trim().startsWith(RUPTELA_R1_SERIAL_PREFIX)) {
      return 'RUPTELA_R1';
    }
    return 'UNKNOWN';
  }

  if (hasSynthetic) {
    return isPlainObject(synthetic) ? 'API_SYNTHETIC' : 'UNKNOWN';
  }

  return 'UNKNOWN';
}

/**
 * True only for integrations whose historical OBD-family record time is proven
 * unreliable (EXP-021 C0/C0.1/C0.2: Ruptela R1). UNKNOWN is deliberately NOT
 * treated as R1.
 */
export function hasUncertainHistoricalObdRecordTime(family: TelemetrySourceFamily): boolean {
  return family === 'RUPTELA_R1';
}
