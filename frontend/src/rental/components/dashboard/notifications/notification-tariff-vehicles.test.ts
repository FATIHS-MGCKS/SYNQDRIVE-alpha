import { describe, expect, it } from 'vitest';
import { mapDerivedInsightToActionQueueItem } from '../actionQueueBuilder';
import type { DerivedOperationalInsight } from '../deriveOperationalInsights';
import { ensureNotificationPanelQueueItems } from '../notificationQueueEnricher';
import { buildNotificationDetailViewModel } from './notification-task-bridge';
import { buildNotificationSummaryFromItem } from './notification-summary-view-model';
import { formatAffectedVehiclesPreview } from './notification-affected-vehicles';

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
  affectedVehicles: [
    { id: 'v1', label: 'KS MX 2024 · Mercedes-Benz C 63 AMG 2018' },
    { id: 'v2', label: 'KS MS 661 · Audi A4 2016' },
    { id: 'v3', label: 'KS FH 660E · Tesla Model 3 2023' },
  ],
};

describe('tariff notification vehicle list', () => {
  it('hides vehicle preview in collapsed summary; shows description in detail when expanded', () => {
    const item = mapDerivedInsightToActionQueueItem(tariffInsight);
    const [enriched] = ensureNotificationPanelQueueItems([item], {
      locale: 'de',
      referenceNowMs: Date.now(),
      t: (key) => {
        if (key === 'notification.cta.openPriceTariffs') return 'Preise & Tarife öffnen';
        if (key === 'notification.title.vehiclesWithoutTariff') return '3 Fahrzeug(e) ohne Tarif';
        return key;
      },
    });

    const summary = buildNotificationSummaryFromItem(enriched, 'de', Date.now());
    expect(summary?.subtitle).toBeUndefined();
    expect(summary?.headlineTitle).toContain('ohne Tarif');

    const detail = buildNotificationDetailViewModel(enriched, 'de');
    expect(detail.ctaPrimaryLabel).toBe('Preise & Tarife öffnen');
    expect(detail.issueDescription).toContain('nicht buchbar');
    expect(detail.affectedVehicles).toHaveLength(3);
    expect(detail.affectedVehiclesLabel).toContain('3');
  });

  it('formats compact preview with overflow count', () => {
    const preview = formatAffectedVehiclesPreview(
      [
        { id: '1', label: 'A' },
        { id: '2', label: 'B' },
        { id: '3', label: 'C' },
        { id: '4', label: 'D' },
      ],
      'de',
      3,
    );
    expect(preview).toBe('A · B · C · +1 weitere');
  });
});
