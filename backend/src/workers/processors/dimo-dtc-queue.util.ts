import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';

const NAMESPACE = 'dtc-poll';

/** Per-vehicle DTC poll dedup within a scheduler bucket (3h aligned). */
export function buildDtcPollVehicleJobId(vehicleId: string, pollBucket: number): string {
  return sanitizeBullMqJobId({
    namespace: NAMESPACE,
    key: `${vehicleId}:${pollBucket}`,
  });
}
