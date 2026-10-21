import { describe, expect, it } from 'vitest';
import { dimoWebhookHealthDe } from '../../i18n/translations/dimo-webhook-health.de';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  dimoR9HintMessages,
  dimoR9OverallLabel,
  dimoR9OverallTone,
  type DimoR9Translate,
} from './dimo-webhook-health.presentation';
import type { DimoR9WebhookHealthDto } from './dimo-webhook-health.types';

const tDe: DimoR9Translate = (key: TranslationKey) =>
  dimoWebhookHealthDe[key as keyof typeof dimoWebhookHealthDe] ?? key;

const basePayload = (): DimoR9WebhookHealthDto => ({
  generatedAt: new Date().toISOString(),
  checkedAt: new Date().toISOString(),
  cacheExpiresAt: null,
  isStale: false,
  staleReason: null,
  overall: 'HEALTHY',
  providerAccessState: 'OK',
  lastSuccessfulProviderCheckAt: null,
  lastProviderError: null,
  refreshCadenceMs: 60_000,
  minManualRefreshIntervalMs: 60_000,
  rateLimitRetryAfterMs: null,
  servedFromCache: false,
  wakePipelineEvidence: 'NOT_EVALUATED',
  cohort: { expectedTokenIds: [], excludedTokenIds: [], excludedSubscribedTokenIds: [] },
  speed: {
    webhookId: 'speed',
    kind: 'speed',
    state: 'HEALTHY',
    healthy: true,
    definition: null,
    subscriberTokenIds: [],
    expectedSubscriberTokenIds: [],
    subscriberCount: 0,
    alerts: [],
  },
  ignition: {
    webhookId: 'ign',
    kind: 'ignition',
    state: 'HEALTHY',
    healthy: true,
    definition: null,
    subscriberTokenIds: [],
    expectedSubscriberTokenIds: [],
    subscriberCount: 0,
    alerts: [],
  },
  diagnostics: [],
});

describe('dimo webhook health presentation', () => {
  it('maps overall tones', () => {
    expect(dimoR9OverallTone('HEALTHY')).toBe('success');
    expect(dimoR9OverallTone('CRITICAL')).toBe('critical');
    expect(dimoR9OverallTone('STALE')).toBe('warning');
    expect(dimoR9OverallTone('UNKNOWN')).toBe('neutral');
  });

  it('provides localized overall labels', () => {
    expect(dimoR9OverallLabel(tDe, 'HEALTHY')).toBe('Betriebsbereit');
    expect(dimoR9OverallLabel(tDe, 'NOT_CONFIGURED')).not.toBe('NOT_CONFIGURED');
  });

  it('builds localized hints for known alert codes', () => {
    const data = basePayload();
    data.speed.alerts = [{ code: 'FAILURE_COUNT_NONZERO', severity: 'HIGH' }];
    data.providerAccessState = 'AUTH_ERROR';
    const hints = dimoR9HintMessages(tDe, data);
    expect(hints.some((h) => h.includes('Zustellungen'))).toBe(true);
    expect(hints.some((h) => h.includes('DIMO konnte nicht'))).toBe(true);
  });

  it('maps STALE overall to warning tone', () => {
    expect(dimoR9OverallTone('STALE')).toBe('warning');
    expect(dimoR9OverallLabel(tDe, 'STALE')).toBe('Veraltet');
  });
});
