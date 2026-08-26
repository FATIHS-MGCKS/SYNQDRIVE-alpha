import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';

export const DTC_POLL_JOB_NAMESPACE = 'dtc-poll';

export function buildDtcPollJobId(vehicleId: string, pollBucket: number): string {
  return sanitizeBullMqJobId({
    namespace: DTC_POLL_JOB_NAMESPACE,
    key: `${vehicleId}:${pollBucket}`,
  });
}
