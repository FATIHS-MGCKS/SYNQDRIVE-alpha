import { Prisma } from '@prisma/client';

/** Keys that must never be stored in session metadata (no PII / raw provider blobs). */
const BLOCKED_METADATA_KEYS = new Set([
  'drivername',
  'driver_name',
  'email',
  'phone',
  'phonenumber',
  'phone_number',
  'vin',
  'licenseplate',
  'license_plate',
  'firstname',
  'first_name',
  'lastname',
  'last_name',
  'fullname',
  'full_name',
  'address',
  'street',
  'postalcode',
  'postal_code',
  'rawpayload',
  'raw_payload',
  'providerpayload',
  'provider_payload',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns metadata safe for `battery_measurement_sessions.metadata`.
 * Drops blocked keys recursively; non-JSON-serializable values are omitted.
 */
export function sanitizeBatteryMeasurementSessionMetadata(
  input: Prisma.InputJsonValue | Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (input == null) return undefined;
  if (!isPlainObject(input)) return undefined;

  const result: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (BLOCKED_METADATA_KEYS.has(key.trim().toLowerCase())) continue;
    if (value == null) continue;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      result[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      const items = value
        .map((item) => {
          if (
            typeof item === 'string' ||
            typeof item === 'number' ||
            typeof item === 'boolean' ||
            item === null
          ) {
            return item;
          }
          if (isPlainObject(item)) {
            const nested = sanitizeBatteryMeasurementSessionMetadata(item);
            return nested ?? null;
          }
          return null;
        })
        .filter((item) => item !== null);
      result[key] = items as Prisma.InputJsonValue;
      continue;
    }
    if (isPlainObject(value)) {
      const nested = sanitizeBatteryMeasurementSessionMetadata(value);
      if (nested != null) result[key] = nested;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
