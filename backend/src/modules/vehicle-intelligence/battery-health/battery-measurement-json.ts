import { Prisma } from '@prisma/client';

const BLOCKED_JSON_KEYS = new Set([
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
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'apikey',
  'api_key',
  'secret',
  'password',
  'authorization',
  'bearer',
  'privatekey',
  'private_key',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeJsonValue(
  input: Record<string, unknown>,
): Prisma.InputJsonValue | undefined {
  const result: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (BLOCKED_JSON_KEYS.has(key.trim().toLowerCase())) continue;
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
            typeof item === 'boolean'
          ) {
            return item;
          }
          if (isPlainObject(item)) {
            const nested = sanitizeJsonValue(item);
            return nested ?? null;
          }
          return null;
        })
        .filter((item) => item !== null);
      if (items.length > 0) result[key] = items as Prisma.InputJsonValue;
      continue;
    }
    if (isPlainObject(value)) {
      const nested = sanitizeJsonValue(value);
      if (nested != null) result[key] = nested;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Safe subset for `battery_measurements.context` / `provenance` JSON columns. */
export function sanitizeBatteryMeasurementJson(
  input: Prisma.InputJsonValue | Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (input == null) return undefined;
  if (!isPlainObject(input)) return undefined;
  return sanitizeJsonValue(input);
}
