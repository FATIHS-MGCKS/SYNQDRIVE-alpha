import {
  isVoiceWebhookIngestionEnabled,
  resolveElevenLabsWebhookSecret,
} from './voice-webhook-ingestion.config';

describe('voice-webhook-ingestion.config', () => {
  it('defaults webhook ingestion on in non-production', () => {
    expect(isVoiceWebhookIngestionEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isVoiceWebhookIngestionEnabled({ NODE_ENV: 'test' })).toBe(true);
  });

  it('defaults webhook ingestion off in production unless explicitly enabled', () => {
    expect(isVoiceWebhookIngestionEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(
      isVoiceWebhookIngestionEnabled({
        NODE_ENV: 'production',
        VOICE_WEBHOOK_INGESTION_ENABLED: 'true',
      }),
    ).toBe(true);
    expect(
      isVoiceWebhookIngestionEnabled({
        NODE_ENV: 'production',
        VOICE_WEBHOOK_INGESTION_ENABLED: 'false',
      }),
    ).toBe(false);
  });

  it('resolves ElevenLabs webhook secret from primary or legacy env key', () => {
    expect(
      resolveElevenLabsWebhookSecret({
        ELEVENLABS_WEBHOOK_SECRET: 'primary',
      }),
    ).toBe('primary');
    expect(
      resolveElevenLabsWebhookSecret({
        ELEVENLABS_CONVAI_WEBHOOK_SECRET: 'legacy',
      }),
    ).toBe('legacy');
  });
});
