import { JobsOptions } from 'bullmq';
import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';

const NAMESPACE = 'voice-webhook';
const REPLAY_NAMESPACE = 'voice-webhook-replay';

/** Deterministic BullMQ job id for first-time voice webhook processing. */
export function buildVoiceWebhookJobId(eventId: string): string {
  return sanitizeBullMqJobId({ namespace: NAMESPACE, key: eventId });
}

/** Unique replay job id — timestamp in logical key keeps replays separate from normal dedup. */
export function buildVoiceWebhookReplayJobId(eventId: string, replayAtMs: number): string {
  return sanitizeBullMqJobId({
    namespace: REPLAY_NAMESPACE,
    key: `${eventId}:${replayAtMs}`,
  });
}

export function buildVoiceWebhookJobOptions(
  eventId: string,
  replay = false,
  replayAtMs = Date.now(),
): Pick<JobsOptions, 'jobId' | 'attempts' | 'backoff' | 'removeOnComplete' | 'removeOnFail'> {
  return {
    jobId: replay
      ? buildVoiceWebhookReplayJobId(eventId, replayAtMs)
      : buildVoiceWebhookJobId(eventId),
    attempts: 5,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 2000, age: 24 * 3600 },
    removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
  };
}
