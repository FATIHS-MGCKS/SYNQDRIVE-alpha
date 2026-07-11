import type { DashboardInsight } from '../../DashboardInsightsContext';
import type { DashboardNotificationItem } from './dashboardNotificationTypes';

/**
 * Pure adapter: maps driving-assessment device-quality insights into the
 * synthetic dashboard notification feed consumed by ActionQueue legacy path.
 * Extracted for deterministic unit tests (notification-engine characterization).
 */
export function buildDashboardNotificationsFromInsights(
  insights: DashboardInsight[],
  options: { generatedAt: string | null; intlLocale: string },
): DashboardNotificationItem[] {
  const deviceQualityInsights = insights.filter(
    (insight) => insight.type === 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
  );
  return deviceQualityInsights.map((insight) => {
    const recovering =
      typeof insight.metrics?.vehicleStatus === 'string' &&
      insight.metrics.vehicleStatus === 'RECOVERING';
    const time = options.generatedAt
      ? new Date(options.generatedAt).toLocaleTimeString(options.intlLocale, {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';
    return {
      type: 'alert' as const,
      title:
        insight.title ||
        (recovering ? 'Fahrbewertung normalisiert sich' : 'Fahrbewertung eingeschränkt'),
      desc: insight.message || '',
      time,
      unread: !recovering,
    };
  });
}
