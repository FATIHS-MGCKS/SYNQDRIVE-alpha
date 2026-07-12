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
  it('shows affected vehicles in summary subtitle and detail panel', () => {
    const item = mapDerivedInsightToActionQueueItem(tariffInsight);
    const [enriched] = ensureNotificationPanelQueueItems([item], {
      locale: 'de',
      referenceNowMs: Date.now(),
      t: (key) => (key === 'notification.cta.openPriceTariffs' ? 'Preise & Tarife öffnen' : key),
    });

    const summary = buildNotificationSummaryFromItem(enriched, 'de', Date.now());
    expect(summary?.subtitle).toContain('KS MX 2024');
    expect(summary?.subtitle).toContain('KS FH 660E');

    const detail = buildNotificationDetailViewModel(enriched, 'de');
    expect(detail.ctaPrimaryLabel).toBe('Preise & Tarife öffnen');
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
