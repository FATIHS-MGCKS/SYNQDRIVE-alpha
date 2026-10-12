import type { StatusTone } from '../../components/patterns';
import type { TranslationKey } from '../../i18n/translations/en';
import type { DimoR9WebhookHealthDto, DimoR9WebhookOverallState } from './dimo-webhook-health.types';

export type DimoR9Translate = (key: TranslationKey) => string;

const overallKey = (state: DimoR9WebhookOverallState): TranslationKey =>
  `master.platformOps.dimoWebhooks.overall.${state}` as TranslationKey;

export function dimoR9OverallLabel(t: DimoR9Translate, state: DimoR9WebhookOverallState): string {
  return t(overallKey(state));
}

export function dimoR9OverallTone(state: DimoR9WebhookOverallState): StatusTone {
  switch (state) {
    case 'HEALTHY':
      return 'success';
    case 'DEGRADED':
    case 'STALE':
      return 'warning';
    case 'CRITICAL':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function dimoR9HintMessages(t: DimoR9Translate, data: DimoR9WebhookHealthDto): string[] {
  const hints: string[] = [];
  if (data.isStale) {
    hints.push(t('master.platformOps.dimoWebhooks.hint.stale'));
  }
  if (data.providerAccessState !== 'OK') {
    hints.push(t('master.platformOps.dimoWebhooks.hint.dimoUnavailable'));
  }
  for (const channel of [data.speed, data.ignition]) {
    for (const alert of channel.alerts) {
      if (alert.code === 'STATUS_NOT_ENABLED') {
        hints.push(
          channel.kind === 'speed'
            ? t('master.platformOps.dimoWebhooks.hint.speedDisabled')
            : t('master.platformOps.dimoWebhooks.hint.ignitionDisabled'),
        );
      }
      if (alert.code === 'FAILURE_COUNT_NONZERO') {
        hints.push(t('master.platformOps.dimoWebhooks.hint.deliveryFailures'));
      }
      if (alert.code === 'COHORT_DRIFT' || alert.code === 'EXCLUDED_TOKEN_SUBSCRIBED') {
        hints.push(t('master.platformOps.dimoWebhooks.hint.cohortMismatch'));
      }
    }
  }
  return [...new Set(hints)];
}
