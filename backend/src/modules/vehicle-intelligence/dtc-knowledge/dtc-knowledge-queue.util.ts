import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';

const GENERIC_NAMESPACE = 'dtc-generic';
const VEHICLE_NAMESPACE = 'dtc-vehicle';

export function buildDtcGenericEnrichmentJobId(
  normalizedCode: string,
  language: string,
): string {
  return sanitizeBullMqJobId({
    namespace: GENERIC_NAMESPACE,
    key: `${normalizedCode}:${language}`,
  });
}

export function buildDtcVehicleEnrichmentJobId(input: {
  normalizedCode: string;
  make: string;
  model: string;
  year: string | number;
  fuelType: string;
  language: string;
}): string {
  return sanitizeBullMqJobId({
    namespace: VEHICLE_NAMESPACE,
    key: [
      input.normalizedCode,
      input.make,
      input.model,
      String(input.year),
      input.fuelType,
      input.language,
    ].join(':'),
  });
}
