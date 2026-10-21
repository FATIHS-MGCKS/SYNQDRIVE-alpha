import {
  buildVoiceWebhookJobId,
  buildVoiceWebhookReplayJobId,
} from './voice-webhook-queue.util';
import { isBullMqCompatibleJobId } from '@shared/queue/bullmq-job-id.sanitizer';

describe('voice-webhook-queue.util', () => {
  const eventId = 'evt-12345678-1234-1234-1234-123456789abc';

  it('buildVoiceWebhookJobId is colon-free', () => {
    const jobId = buildVoiceWebhookJobId(eventId);
    expect(jobId).not.toContain(':');
    expect(isBullMqCompatibleJobId(jobId)).toBe(true);
    expect(jobId.startsWith('voice-webhook_')).toBe(true);
  });

  it('buildVoiceWebhookReplayJobId is colon-free and unique per timestamp', () => {
    const replayAt = 1_726_200_000_000;
    const jobId = buildVoiceWebhookReplayJobId(eventId, replayAt);
    expect(jobId).not.toContain(':');
    expect(isBullMqCompatibleJobId(jobId)).toBe(true);
    expect(jobId).not.toBe(buildVoiceWebhookJobId(eventId));
    expect(buildVoiceWebhookReplayJobId(eventId, replayAt + 1)).not.toBe(jobId);
  });
});
