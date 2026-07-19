import type { NormalizedDimoTriggerWebhook } from './device-connection-webhook-configuration.types';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMetric(metricName: unknown): string {
  const raw = asString(metricName).toLowerCase();
  if (!raw) return '';
  return raw.includes('.') ? raw.split('.').pop()! : raw;
}

export function classifyDimoTriggerWebhook(
  webhook: Record<string, unknown>,
  expectedCallbackUrl: string | null,
): NormalizedDimoTriggerWebhook {
  const metricName = asString(webhook.metricName ?? webhook.signalName ?? webhook.name);
  const displayName = asString(webhook.displayName ?? webhook.name ?? webhook.webhookName);
  const condition = asString(webhook.condition);
  const targetUrl = asString(webhook.targetURL ?? webhook.url ?? webhook.callbackUrl);
  const status = asString(webhook.status).toLowerCase() || 'unknown';
  const failureCount =
    typeof webhook.failureCount === 'number' && Number.isFinite(webhook.failureCount)
      ? webhook.failureCount
      : 0;

  const metric = normalizeMetric(metricName);
  const haystack = `${displayName} ${metricName} ${condition}`.toLowerCase();
  const isObdPlugMetric = metric === 'obdispluggedin' || haystack.includes('obdispluggedin');

  let classification: NormalizedDimoTriggerWebhook['classification'] = 'OTHER';
  if (isObdPlugMetric) {
    const unplugHint =
      haystack.includes('unplug') ||
      condition.includes('== 0') ||
      condition.includes('==0') ||
      condition.includes('false');
    const plugHint =
      (haystack.includes('plug') && !haystack.includes('unplug')) ||
      condition.includes('== 1') ||
      condition.includes('==1') ||
      condition.includes('true');
    if (unplugHint && !plugHint) classification = 'OBD_UNPLUG';
    else if (plugHint && !unplugHint) classification = 'OBD_PLUG';
    else if (unplugHint) classification = 'OBD_UNPLUG';
    else classification = 'OBD_PLUG';
  }

  const enabled = status === 'enabled' || status === 'active' || status === 'true';
  const pointsToCallback =
    !expectedCallbackUrl ||
    !targetUrl ||
    normalizeUrl(targetUrl) === normalizeUrl(expectedCallbackUrl);

  return {
    id: asString(webhook.id) || asString(webhook.webhookId),
    displayName,
    metricName,
    condition,
    targetUrl,
    status,
    failureCount,
    classification,
    enabled,
    pointsToCallback,
  };
}

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

export function pickBestTrigger(
  webhooks: NormalizedDimoTriggerWebhook[],
  classification: 'OBD_UNPLUG' | 'OBD_PLUG',
): NormalizedDimoTriggerWebhook | null {
  const matches = webhooks.filter((w) => w.classification === classification);
  if (matches.length === 0) return null;
  const enabled = matches.filter((w) => w.enabled && w.pointsToCallback);
  if (enabled.length > 0) return enabled[0];
  return matches[0];
}

export function vehicleSubscribedToObdSignal(subscriptions: unknown): boolean {
  if (!subscriptions) return false;
  if (Array.isArray(subscriptions)) {
    return subscriptions.some((entry) => subscriptionIncludesObd(entry));
  }
  if (typeof subscriptions === 'object') {
    const record = subscriptions as Record<string, unknown>;
    if (Array.isArray(record.subscriptions)) {
      return record.subscriptions.some((entry) => subscriptionIncludesObd(entry));
    }
    if (Array.isArray(record.signals)) {
      return record.signals.some((s) => String(s).toLowerCase().includes('obdispluggedin'));
    }
    if (record.webhookId != null) return true;
  }
  return false;
}

function subscriptionIncludesObd(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const record = entry as Record<string, unknown>;
  const signals = record.signals;
  if (Array.isArray(signals)) {
    return signals.some((s) => String(s).toLowerCase().includes('obdispluggedin'));
  }
  const metric = asString(record.metricName ?? record.signalName).toLowerCase();
  return metric.includes('obdispluggedin');
}
