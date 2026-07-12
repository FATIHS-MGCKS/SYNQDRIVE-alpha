import { describe, expect, it } from 'vitest';
import { mapDerivedInsightToActionQueueItem } from '../actionQueueBuilder';
import type { DerivedOperationalInsight } from '../deriveOperationalInsights';
import { ensureNotificationPanelQueueItems } from '../notificationQueueEnricher';
import { buildNotificationSummaryFromItem } from './notification-summary-view-model';

const tariffInsight: DerivedOperationalInsight = {
  id: 'derived-vehicles-without-tariff',
  source: 'derived-operations',
  severity: 'critical',
  category: 'operations',
  title: '3 Fahrzeug(e) ohne Tarif',
  reason: 'Diese Fahrzeuge sind nicht buchbar, bis eine aktive Tarifgruppe zugewiesen ist.',
  timeSortMs: Date.now(),
  cta: 'open-price-tariffs',
  isOverdue: false,
};

describe('ensureNotificationPanelQueueItems', () => {
  it('materializes queue for derived tariff bridge items so cards render', () => {
    const item = mapDerivedInsightToActionQueueItem(tariffInsight);
    expect(item.queue).toBeUndefined();

    const [enriched] = ensureNotificationPanelQueueItems([item], {
      locale: 'de',
      referenceNowMs: Date.now(),
      t: (key) => key,
    });

    expect(enriched.queue).toBeDefined();
    expect(enriched.queue?.severity).toBe('critical');
    expect(enriched.queue?.lifecycleStatus).toBe('open');

    const summary = buildNotificationSummaryFromItem(enriched, 'de', Date.now());
    expect(summary).not.toBeNull();
    expect(summary?.severity).toBe('critical');
    expect(enriched.title).toBe('notification.title.vehiclesWithoutTariff');
  });
});
