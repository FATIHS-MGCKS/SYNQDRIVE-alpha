import { JobsOptions } from 'bullmq';
import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';

export const VOICE_WEBHOOK_JOB_NAMESPACE = 'voice-webhook';
export const VOICE_WEBHOOK_REPLAY_JOB_NAMESPACE = 'voice-webhook-replay';

/** Deterministic BullMQ job id for a voice webhook event (dedup per eventId). */
export function buildVoiceWebhookJobId(eventId: string): string {
  return sanitizeBullMqJobId({
    namespace: VOICE_WEBHOOK_JOB_NAMESPACE,
    key: eventId,
  });
}

/** Replay jobs remain distinguishable from normal intake and unique per replay attempt. */
export function buildVoiceWebhookReplayJobId(eventId: string, replayAtMs: number): string {
  return sanitizeBullMqJobId({
    namespace: VOICE_WEBHOOK_REPLAY_JOB_NAMESPACE,
    key: `${eventId}:${replayAtMs}`,
  });
}

export function buildVoiceWebhookJobOptions(
  eventId: string,
  replay = false,
  replayAtMs = Date.now(),
): Pick<JobsOptions, 'jobId'> {
  return {
    jobId: replay
      ? buildVoiceWebhookReplayJobId(eventId, replayAtMs)
      : buildVoiceWebhookJobId(eventId),
  };
}
