import { useCallback, useMemo, useState } from 'react';
import { Icon, type IconName } from './ui/Icon';
import { useFleetVehicles } from '../FleetContext';
import {
  useDashboardInsights,
  useVehicleHealthAlerts,
  type DashboardInsight,
  type InsightEntityBreakdown as EntityBreakdown,
  type InsightSeverity,
  type InsightType,
  type VehicleHealthAlert,
} from '../DashboardInsightsContext';
import { useLanguage } from '../i18n/LanguageContext';
import type { VehicleData } from '../data/vehicles';
import { EmptyState } from '../../components/patterns';
import type { DashboardNotificationItem } from './dashboard/dashboardNotificationTypes';

type NavigableView = 'bookings' | 'stations';

type InsightsTab = 'business' | 'vehicle-alerts' | 'financial' | 'notifications';

export type { DashboardNotificationItem } from './dashboard/dashboardNotificationTypes';

// ─── Severity config ─────────────────────────────────────────────────

interface SeverityStyle {
  icon: IconName;
  label: string;
  card: { light: string; dark: string };
  badge: { light: string; dark: string };
  icon_color: { light: string; dark: string };
  text: { light: string; dark: string };
}

const SEVERITY_CONFIG: Record<InsightSeverity, SeverityStyle> = {
  CRITICAL: {
    icon: 'alert-triangle',
    label: 'Critical',
    card: {
      light: 'bg-red-50/60 border-red-200/40',
      dark: 'bg-red-900/15 border-red-800/20',
    },
    badge: {
      light: 'bg-red-500/15 text-red-600',
      dark: 'bg-red-500/20 text-red-400',
    },
    icon_color: { light: 'text-red-600', dark: 'text-red-400' },
    text: { light: 'text-red-700', dark: 'text-red-400' },
  },
  WARNING: {
    icon: 'clock',
    label: 'Attention',
    card: {
      light: 'bg-orange-50/60 border-orange-200/40',
      dark: 'bg-orange-900/15 border-orange-800/20',
    },
    badge: {
      light: 'bg-orange-500/15 text-orange-600',
      dark: 'bg-orange-500/20 text-orange-400',
    },
    icon_color: { light: 'text-orange-600', dark: 'text-orange-400' },
    text: { light: 'text-orange-700', dark: 'text-orange-400' },
  },
  OPPORTUNITY: {
    icon: 'calendar',
    label: 'Opportunity',
    card: {
      light: 'bg-status-info-soft border-status-info/20',
      dark: 'bg-brand-soft border-brand/20',
    },
    badge: {
      light: 'bg-status-info-soft text-status-info',
      dark: 'bg-brand-soft text-brand',
    },
    icon_color: { light: 'text-brand', dark: 'text-brand' },
    text: { light: 'text-status-info', dark: 'text-brand' },
  },
  INFO: {
    icon: 'info',
    label: 'Info',
    card: {
      light: 'bg-gray-50/60 border-gray-200/40',
      dark: 'bg-muted/40 border-border/30',
    },
    badge: {
      light: 'bg-gray-500/15 text-gray-600',
      dark: 'bg-muted/50 text-muted-foreground',
    },
    icon_color: { light: 'text-gray-600', dark: 'text-muted-foreground' },
    text: { light: 'text-gray-700', dark: 'text-muted-foreground' },
  },
};

// ─── Component ───────────────────────────────────────────────────────

interface BusinessInsightsBoxProps {
  isDarkMode: boolean;
  /** Open a vehicle's overview page (navigation owner: parent App.tsx). */
  onOpenVehicle?: (vehicleId: string) => void;
  /** Open a top-level rental view (navigation owner: parent App.tsx). */
  onOpenView?: (view: NavigableView) => void;
  /**
   * Dashboard notifications stream. Forwarded directly from DashboardView so
   * the notification feed lives inside the unified Insights box (no separate
   * Notifications card on the Dashboard anymore).
   */
  notifications?: DashboardNotificationItem[];
  /** Station id filter (`null` = all stations). */
  stationFilter?: string | null;
}

/**
 * Unified "Insights from your Business" panel on the Dashboard.
 *
 * V4.6.89 — previously there was one Business-Insights card at the top and
 * two small cards (Vehicle Alerts, Notifications) further down. Those three
 * surfaces all derived from the same DashboardInsights feed and constantly
 * fought for the user's attention. They are now consolidated into this one
 * component with four tabs (Business / Vehicle Alerts / Financial /
 * Notifications) so the Dashboard reads as a single "what needs my
 * attention" control tower. Financial splits revenue-impact insights
 * (LOW_UTILIZATION, lostRevenueEur) out of the operational Business tab.
 */
export function BusinessInsightsBox({ isDarkMode, onOpenVehicle, onOpenView, notifications, stationFilter }: BusinessInsightsBoxProps) {
  const { fleetVehicles } = useFleetVehicles();
  const { t, locale } = useLanguage();
  const { response: data, loading, error, refresh: fetchInsights } = useDashboardInsights();
  // V4.6.95 — Apply the dashboard-level station filter at the source so the
  // health-alerts hook + every per-row vehicle lookup see a consistent
  // slice of the fleet. `null`/empty filter ⇒ pass through unchanged.
  const filteredFleetVehicles = useMemo(() => {
    if (!stationFilter) return fleetVehicles;
    return fleetVehicles.filter(
      (v) =>
        v.stationId === stationFilter ||
        v.homeStationId === stationFilter ||
        v.currentStationId === stationFilter,
    );
  }, [fleetVehicles, stationFilter]);
  const { alerts: vehicleHealthAlerts, counts: vehicleHealthSummary } = useVehicleHealthAlerts(filteredFleetVehicles);
  const [activeTab, setActiveTab] = useState<InsightsTab>('business');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Index fleet vehicles by ID once per fleet refresh — keeps per-row lookup
  // O(1) regardless of fleet size. Reflects the active station filter so
  // insights for vehicles outside the selection no longer resolve to a
  // station/license/model and get hidden by the per-row filter below.
  const fleetById = useMemo(() => {
    const m = new Map<string, VehicleData>();
    for (const v of filteredFleetVehicles) m.set(v.id, v);
    return m;
  }, [filteredFleetVehicles]);

  // Vehicle-health insights (BATTERY_CRITICAL, SERVICE_OVERDUE) are served
  // in the dedicated "Vehicle Alerts" tab. Financial insights (LOW_UTILIZATION
  // — carries lostRevenueEur metrics) are served in the dedicated "Financial"
  // tab. Routing them into their own tabs keeps the "Business" tab focused on
  // operational signals (handovers, station shortages, service windows…) and
  // avoids the same row showing up in two places at once.
  const VEHICLE_HEALTH_TYPES: InsightType[] = ['BATTERY_CRITICAL', 'SERVICE_OVERDUE'];
  const FINANCIAL_TYPES: InsightType[] = ['LOW_UTILIZATION'];

  // V4.6.95 — Station-scoped insight filter. When a station is selected,
  // we drop any vehicle-tied insight whose entities are all outside the
  // current station; insights without `entityIds` are organisation-level
  // signals and pass through unchanged.
  const matchesStation = useCallback((insight: DashboardInsight): boolean => {
    if (!stationFilter) return true;
    const ids = insight.entityIds ?? [];
    if (ids.length === 0) return true;
    return ids.some((id) => fleetById.has(id));
  }, [stationFilter, fleetById]);

  const businessInsights = useMemo(
    () =>
      (data?.insights ?? [])
        .filter((i) => !VEHICLE_HEALTH_TYPES.includes(i.type) && !FINANCIAL_TYPES.includes(i.type))
        .filter(matchesStation),
    [data, matchesStation],
  );
  const financialInsights = useMemo(
    () => (data?.insights ?? []).filter((i) => FINANCIAL_TYPES.includes(i.type)).filter(matchesStation),
    [data, matchesStation],
  );

  const dm = isDarkMode;
  const cardBase = `rounded-lg p-4 border shadow-sm ${dm ? 'surface-premium border-border' : 'bg-white border-gray-200'}`;

  const businessCritical = businessInsights.filter((i) => i.severity === 'CRITICAL').length;
  const financialCritical = financialInsights.filter((i) => i.severity === 'CRITICAL').length;
  const notificationsList = notifications ?? [];
  const unreadNotifications = notificationsList.filter((n) => n.unread).length;

  // Per-tab count surfaced in the tab pill + the header badge.
  const tabCounts: Record<InsightsTab, number> = {
    business: businessInsights.length,
    'vehicle-alerts': vehicleHealthSummary.total,
    financial: financialInsights.length,
    notifications: notificationsList.length,
  };

  // Header badge follows the active tab so the most relevant signal is in
  // the top-right corner regardless of which tab the user is on.
  const headerBadge = (() => {
    if (activeTab === 'business' && businessCritical > 0) {
      return {
        label: `${businessCritical} critical`,
        className: dm ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600',
      };
    }
    if (activeTab === 'vehicle-alerts' && vehicleHealthSummary.critical > 0) {
      return {
        label: `${vehicleHealthSummary.critical} critical`,
        className: dm ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600',
      };
    }
    if (activeTab === 'financial' && financialCritical > 0) {
      return {
        label: `${financialCritical} critical`,
        className: dm ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600',
      };
    }
    if (activeTab === 'notifications' && unreadNotifications > 0) {
      return {
        label: `${unreadNotifications} ${locale === 'de' ? 'ungelesen' : 'unread'}`,
        className: dm ? 'bg-violet-500/20 text-violet-300' : 'bg-violet-100 text-violet-600',
      };
    }
    return null;
  })();

  // V4.6.95 — Each tab carries an explicit tone so the count pill renders in
  // a colour-coded chip (green / red / brand / blue) instead of a flat grey
  // "naked" number. The tone choices follow the semantics of each tab:
  //  • business      → brand   (operational signals)
  //  • vehicle-alerts→ critical (any number here means a vehicle needs help)
  //  • financial     → success (revenue-impact insights)
  //  • notifications → info    (neutral inbox-style chip)
  const tabs: { key: InsightsTab; label: string; tone: 'brand' | 'critical' | 'success' | 'info' }[] = [
    { key: 'business', label: 'Business', tone: 'brand' },
    { key: 'vehicle-alerts', label: t('dashboard.vehicleAlerts'), tone: 'critical' },
    { key: 'financial', label: t('dashboard.finances'), tone: 'success' },
    { key: 'notifications', label: t('dashboard.notifications'), tone: 'info' },
  ];

  return (
    <div className={cardBase}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${dm ? 'bg-brand-soft' : 'bg-brand-soft'}`}>
            <Icon name="sparkles" className={`w-4 h-4 ${dm ? 'text-brand' : 'text-brand'}`} />
          </div>
          <div>
            <h3 className={`text-[12px] font-semibold tracking-[-0.003em] leading-tight ${dm ? 'text-foreground' : 'text-gray-900'}`}>
              {locale === 'de' ? 'Insights aus deinem Business' : 'Insights from your Business'}
            </h3>
            {data && !loading && (businessInsights.length > 0 || vehicleHealthAlerts.length > 0) && (
              <p className={`text-[10.5px] mt-0.5 ${dm ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                {formatRelativeTime(data.generatedAt)}
              </p>
            )}
          </div>
        </div>
        {headerBadge && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${headerBadge.className}`}>
            {headerBadge.label}
          </span>
        )}
      </div>

      {/* Tab bar — Business / Vehicle Alerts / Financial / Notifications */}
      <div className="sq-tab-bar p-1 flex items-stretch mb-3 w-full">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = tabCounts[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-0 px-2 py-1.5 rounded-[calc(var(--radius-md)-2px)] text-[12px] font-semibold tracking-[-0.003em] whitespace-nowrap transition-all duration-200 flex items-center justify-center gap-1.5 ${
                isActive
                  ? 'surface-premium text-foreground shadow-[var(--shadow-1)] ring-1 ring-[color:color-mix(in_srgb,var(--brand)_12%,transparent)]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="truncate text-[11.5px]">{tab.label}</span>
              {count > 0 && (
                <span
                  className={`text-[11px] min-w-[20px] h-[19px] px-1.5 flex items-center justify-center rounded-full font-bold tabular-nums shrink-0 sq-tone-${tab.tone} ${
                    isActive
                      ? 'ring-1 ring-[color:color-mix(in_srgb,currentColor_35%,transparent)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                      : ''
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body — depends on active tab */}
      {loading ? (
        <LoadingState isDarkMode={dm} />
      ) : error ? (
        <ErrorState isDarkMode={dm} onRetry={fetchInsights} />
      ) : activeTab === 'business' ? (
        businessInsights.length === 0 ? (
          <EmptyState
            icon={<Icon name="check-circle" className="w-5 h-5 text-[color:var(--status-positive)]" />}
            title="No open items right now"
            description="Insights will appear when action is needed"
            compact
          />
        ) : (
          <div className="space-y-2">
            {businessInsights.slice(0, 4).map((insight) => (
              <InsightRow
                key={insight.id}
                insight={insight}
                isDarkMode={dm}
                isExpanded={expandedId === insight.id}
                onToggle={() => setExpandedId((prev) => (prev === insight.id ? null : insight.id))}
                fleetById={fleetById}
                onOpenVehicle={onOpenVehicle}
                onOpenView={onOpenView}
              />
            ))}
          </div>
        )
      ) : activeTab === 'vehicle-alerts' ? (
        <VehicleAlertsList
          alerts={vehicleHealthAlerts}
          isDarkMode={dm}
          locale={locale}
          onOpenVehicle={onOpenVehicle}
        />
      ) : activeTab === 'financial' ? (
        financialInsights.length === 0 ? (
          <FinancialEmptyState isDarkMode={dm} locale={locale} />
        ) : (
          <div className="space-y-2">
            {financialInsights.slice(0, 4).map((insight) => (
              <InsightRow
                key={insight.id}
                insight={insight}
                isDarkMode={dm}
                isExpanded={expandedId === insight.id}
                onToggle={() => setExpandedId((prev) => (prev === insight.id ? null : insight.id))}
                fleetById={fleetById}
                onOpenVehicle={onOpenVehicle}
                onOpenView={onOpenView}
              />
            ))}
          </div>
        )
      ) : (
        <NotificationsList
          notifications={notificationsList}
          isDarkMode={dm}
          emptyLabel={t('common.noData')}
        />
      )}
    </div>
  );
}

// ─── Vehicle Alerts list (Tab 2) ─────────────────────────────────────

interface VehicleAlertsListProps {
  alerts: VehicleHealthAlert[];
  isDarkMode: boolean;
  locale: string;
  onOpenVehicle?: (vehicleId: string) => void;
}

function VehicleAlertsList({ alerts, isDarkMode, locale, onOpenVehicle }: VehicleAlertsListProps) {
  const dm = isDarkMode;

  if (alerts.length === 0) {
    return (
      <div
        className={`rounded-lg border p-4 flex items-center gap-3 ${
          dm ? 'bg-emerald-500/5 border-emerald-800/30 text-emerald-400' : 'bg-emerald-50/60 border-emerald-200/40 text-emerald-600'
        }`}
      >
        <Icon name="check-circle" className="w-4 h-4 shrink-0" />
        <div>
          <div className="text-xs font-semibold">
            {locale === 'de' ? 'Alle Fahrzeuge in Ordnung' : 'All vehicles healthy'}
          </div>
          <div className="text-[10.5px] mt-0.5 opacity-80">
            {locale === 'de'
              ? 'Keine kritischen oder Warn-Meldungen von Batterie- oder Service-Detektoren.'
              : 'No critical or warning detections from the battery / service detectors.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {alerts.slice(0, 5).map((alert) => {
        const sevBadge =
          alert.severity === 'critical'
            ? dm ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'
            : alert.severity === 'warning'
              ? dm ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
              : dm ? 'bg-status-info-soft text-status-info' : 'bg-status-info-soft text-status-info';
        const cardBg =
          alert.severity === 'critical'
            ? dm ? 'bg-red-900/15 border-red-800/30' : 'bg-red-50/80 border-red-200/60'
            : alert.severity === 'warning'
              ? dm ? 'bg-amber-900/15 border-amber-800/30' : 'bg-amber-50/80 border-amber-200/60'
              : dm ? 'bg-status-info-soft border-status-info/30' : 'bg-status-info-soft border-status-info/25';
        const canOpen = !!onOpenVehicle;

        return (
          <li
            key={alert.vehicleId}
            className={`rounded-lg border px-3 py-2.5 transition-colors ${cardBg} ${
              canOpen ? 'cursor-pointer hover:brightness-95' : ''
            }`}
            role={canOpen ? 'button' : undefined}
            tabIndex={canOpen ? 0 : undefined}
            onClick={() => {
              if (canOpen) onOpenVehicle!(alert.vehicleId);
            }}
            onKeyDown={(e) => {
              if (!canOpen) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenVehicle!(alert.vehicleId);
              }
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-[10.5px] font-semibold truncate ${dm ? 'text-foreground' : 'text-gray-900'}`}>
                  {alert.license || alert.model || alert.vehicleId.slice(0, 8)}
                </span>
                {alert.model && alert.license && (
                  <span className={`text-[10.5px] truncate ${dm ? 'text-muted-foreground' : 'text-gray-500'}`}>
                    {alert.model}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {alert.kinds.map((k) => (
                  <span
                    key={k}
                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider ${sevBadge}`}
                  >
                    {k === 'BATTERY_CRITICAL'
                      ? locale === 'de' ? 'Batterie' : 'Battery'
                      : locale === 'de' ? 'Service' : 'Service'}
                  </span>
                ))}
              </div>
            </div>
            <p className={`text-[10.5px] leading-relaxed ${dm ? 'text-foreground/90' : 'text-gray-800'}`}>
              {alert.primaryReason}
            </p>
            {alert.station && (
              <div className={`mt-1 flex items-center gap-1 text-[10px] ${dm ? 'text-muted-foreground' : 'text-gray-500'}`}>
                <Icon name="map-pin" className="w-3 h-3" />
                <span className="truncate">{alert.station}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Notifications list (Tab 3) ──────────────────────────────────────

interface NotificationsListProps {
  notifications: DashboardNotificationItem[];
  isDarkMode: boolean;
  emptyLabel: string;
}

function NotificationsList({ notifications, isDarkMode, emptyLabel }: NotificationsListProps) {
  const dm = isDarkMode;

  if (notifications.length === 0) {
    return (
      <div
        className={`rounded-lg border p-6 flex flex-col items-center gap-1.5 text-center ${
          dm ? 'bg-muted/30 border-border/30' : 'bg-gray-50/40 border-gray-200/40'
        }`}
      >
        <Icon name="bell" className={`w-4 h-4 ${dm ? 'text-muted-foreground' : 'text-muted-foreground'}`} />
        <p className={`text-[11px] ${dm ? 'text-muted-foreground' : 'text-gray-500'}`}>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {notifications.slice(0, 6).map((n, i) => {
        const iconStyles = NOTIFICATION_ICON[n.type];
        return (
          <li
            key={i}
            className={`flex items-start gap-2.5 rounded-lg p-2.5 transition-all ${
              n.unread
                ? dm ? 'bg-violet-900/10 border border-violet-800/20' : 'bg-violet-50/60 border border-violet-200/40'
                : dm ? 'bg-muted/40' : 'bg-muted/50'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                dm ? iconStyles.bgDark : iconStyles.bgLight
              }`}
            >
              <Icon name={iconStyles.icon} className={`w-3 h-3 ${dm ? iconStyles.iconDark : iconStyles.iconLight}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`text-[11.5px] font-semibold truncate ${dm ? 'text-foreground' : 'text-gray-900'}`}>
                  {n.title}
                </span>
                {n.unread && <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />}
              </div>
              <p className={`text-[10.5px] mt-0.5 leading-snug ${dm ? 'text-muted-foreground' : 'text-gray-600'}`}>
                {n.desc}
              </p>
            </div>
            <span className={`text-[10px] shrink-0 mt-0.5 ${dm ? 'text-muted-foreground' : 'text-muted-foreground'}`}>{n.time}</span>
          </li>
        );
      })}
    </ul>
  );
}

const NOTIFICATION_ICON: Record<DashboardNotificationItem['type'], {
  icon: IconName;
  bgLight: string;
  bgDark: string;
  iconLight: string;
  iconDark: string;
}> = {
  alert: { icon: 'alert-triangle', bgLight: 'bg-red-100', bgDark: 'bg-red-500/15', iconLight: 'text-red-500', iconDark: 'text-red-400' },
  booking: { icon: 'calendar', bgLight: 'bg-brand-soft', bgDark: 'bg-status-info-soft', iconLight: 'text-status-info', iconDark: 'text-status-info' },
  return: { icon: 'check-circle', bgLight: 'bg-green-100', bgDark: 'bg-green-500/15', iconLight: 'text-green-500', iconDark: 'text-green-400' },
  maintenance: { icon: 'wrench', bgLight: 'bg-amber-100', bgDark: 'bg-amber-500/15', iconLight: 'text-amber-500', iconDark: 'text-amber-400' },
  feedback: { icon: 'message-square', bgLight: 'bg-violet-100', bgDark: 'bg-violet-500/15', iconLight: 'text-violet-500', iconDark: 'text-violet-400' },
  system: { icon: 'zap', bgLight: 'bg-muted', bgDark: 'bg-muted/40', iconLight: 'text-muted-foreground', iconDark: 'text-muted-foreground' },
};

// ─── Insight Row ─────────────────────────────────────────────────────

interface InsightRowProps {
  insight: DashboardInsight;
  isDarkMode: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  fleetById: Map<string, VehicleData>;
  onOpenVehicle?: (vehicleId: string) => void;
  onOpenView?: (view: NavigableView) => void;
}

function InsightRow({ insight, isDarkMode, isExpanded, onToggle, fleetById, onOpenVehicle, onOpenView }: InsightRowProps) {
  const severity = SEVERITY_CONFIG[insight.severity] ?? SEVERITY_CONFIG.INFO;
  const dm = isDarkMode;

  const entityIds = insight.entityIds ?? [];
  const isVehicleScope = isVehicleScoped(insight);
  const entityBreakdown = (insight.metrics?.entities as EntityBreakdown[] | undefined) ?? null;

  // The row is interactive when there is anything meaningful to expand to
  // (per-entity breakdown, multiple entity IDs, or any free-text reasons).
  const hasExpandable =
    (entityBreakdown && entityBreakdown.length > 0) ||
    entityIds.length > 0 ||
    (insight.reasons?.length ?? 0) > 0;

  const title = safeTruncate(insight.title, 36);
  const message = safeTruncate(insight.message, 140);

  const handleToggle = () => {
    if (hasExpandable) onToggle();
  };

  return (
    <div
      className={`rounded-lg border transition-colors ${dm ? severity.card.dark : severity.card.light} ${
        hasExpandable ? 'cursor-pointer hover:brightness-95' : ''
      }`}
      role={hasExpandable ? 'button' : undefined}
      aria-expanded={hasExpandable ? isExpanded : undefined}
      tabIndex={hasExpandable ? 0 : undefined}
      onClick={handleToggle}
      onKeyDown={
        hasExpandable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggle();
              }
            }
          : undefined
      }
    >
      {/* Summary header */}
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${dm ? 'bg-muted/40' : 'bg-white'}`}>
            <Icon name={severity.icon} className={`w-3.5 h-3.5 ${dm ? severity.icon_color.dark : severity.icon_color.light}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-xs font-semibold truncate ${dm ? severity.text.dark : severity.text.light}`}>
                {title}
              </span>
              <span className={`text-[10px] px-1.5 py-px rounded-full font-medium shrink-0 ${dm ? severity.badge.dark : severity.badge.light}`}>
                {severity.label}
              </span>
            </div>

            <p className={`text-[11px] leading-relaxed ${dm ? 'text-muted-foreground' : 'text-gray-600'}`}>
              {message}
            </p>

            {hasExpandable && (
              <div className="mt-1.5 flex items-center gap-1">
                <span className={`text-[10px] font-medium ${dm ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                  {isExpanded ? 'Hide details' : insight.actionLabel || 'View details'}
                </span>
                <Icon name="chevron-down"
                  className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''} ${dm ? 'text-muted-foreground' : 'text-muted-foreground'}`}
                />
              </div>
            )}
          </div>

          {insight.isGrouped && insight.groupCount > 1 && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${dm ? 'bg-muted/60 text-muted-foreground' : 'bg-muted text-muted-foreground'}`}>
              {insight.groupCount}x
            </span>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {hasExpandable && isExpanded && (
        <div
          className={`border-t px-3 py-2.5 space-y-2 ${dm ? 'border-border/40' : 'border-gray-200/60'}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {isVehicleScope ? (
            <ExpandedVehicleList
              insight={insight}
              entityBreakdown={entityBreakdown}
              entityIds={entityIds}
              fleetById={fleetById}
              isDarkMode={dm}
              onOpenVehicle={onOpenVehicle}
            />
          ) : (
            <ExpandedGenericBlock
              insight={insight}
              isDarkMode={dm}
              onOpenView={onOpenView}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Expanded body: vehicle list ─────────────────────────────────────

function ExpandedVehicleList({
  insight,
  entityBreakdown,
  entityIds,
  fleetById,
  isDarkMode,
  onOpenVehicle,
}: {
  insight: DashboardInsight;
  entityBreakdown: EntityBreakdown[] | null;
  entityIds: string[];
  fleetById: Map<string, VehicleData>;
  isDarkMode: boolean;
  onOpenVehicle?: (vehicleId: string) => void;
}) {
  const dm = isDarkMode;

  // Derive a unified per-entity list. Prefer the backend-supplied breakdown
  // (carries per-vehicle metrics from the original detector) and fall back to
  // bare entityIds (older persisted insights, single-entity insights without
  // a grouping pass).
  const items: EntityBreakdown[] = useMemo(() => {
    if (entityBreakdown && entityBreakdown.length > 0) return entityBreakdown;
    return entityIds.map((id) => ({
      id,
      metrics: insight.metrics ?? null,
      reasons: insight.reasons ?? null,
    }));
  }, [entityBreakdown, entityIds, insight.metrics, insight.reasons]);

  if (items.length === 0) {
    return (
      <p className={`text-[11px] ${dm ? 'text-muted-foreground' : 'text-gray-500'}`}>
        Keine zugeordneten Fahrzeuge.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {items.map((entity, idx) => {
        const vehicle = fleetById.get(entity.id) ?? null;
        const label = vehicle?.license || vehicle?.model || entity.id.slice(0, 8);
        const sub = vehicle ? `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() : null;
        // Prefer the detector-curated primary reason (e.g. "SOH 25% (< 50%)")
        // over a mechanical rendering of raw metrics — the detector already
        // decided which sample drove the alert, so surfacing an unrelated
        // carrier value would be misleading (e.g. showing alternator charge
        // voltage next to an SOH-based critical alert).
        const primaryReason = entity.reasons?.[0] ?? null;
        const secondaryReason =
          entity.reasons && entity.reasons.length > 1 ? entity.reasons[1] : null;
        const detail = primaryReason ?? formatEntityDetail(insight.type, entity.metrics);
        const canOpen = !!onOpenVehicle && !!vehicle;

        return (
          <li
            key={`${entity.id}:${idx}`}
            className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${dm ? 'bg-muted/40' : 'bg-white/70'}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-[12px] font-semibold truncate ${dm ? 'text-foreground' : 'text-gray-900'}`}>
                  {label}
                </span>
                {sub && (
                  <span className={`text-[10px] truncate ${dm ? 'text-muted-foreground' : 'text-gray-500'}`}>
                    {sub}
                  </span>
                )}
              </div>
              {detail && (
                <p className={`text-[10.5px] mt-0.5 leading-snug ${dm ? 'text-muted-foreground' : 'text-gray-600'}`}>
                  {detail}
                </p>
              )}
              {secondaryReason && (
                <p className={`text-[10px] mt-0.5 leading-snug ${dm ? 'text-muted-foreground' : 'text-gray-500'}`}>
                  {secondaryReason}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={!canOpen}
              onClick={() => {
                if (canOpen && vehicle) onOpenVehicle!(vehicle.id);
              }}
              className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${
                canOpen
                  ? dm
                    ? 'bg-brand-soft text-brand hover:bg-brand-soft/80'
                    : 'bg-status-info-soft text-status-info hover:bg-status-info-soft/80'
                  : dm
                    ? 'bg-muted text-muted-foreground/60 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
              title={canOpen ? 'Fahrzeug öffnen' : 'Fahrzeug nicht in Flotte gefunden'}
            >
              Öffnen
              <Icon name="arrow-right" className="w-3 h-3" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Expanded body: generic (station / bookings) ─────────────────────

function ExpandedGenericBlock({
  insight,
  isDarkMode,
  onOpenView,
}: {
  insight: DashboardInsight;
  isDarkMode: boolean;
  onOpenView?: (view: NavigableView) => void;
}) {
  const dm = isDarkMode;
  const targetView: NavigableView | null =
    insight.actionType === 'navigate_station'
      ? 'stations'
      : insight.actionType === 'navigate_booking' || insight.actionType === 'navigate_bookings'
        ? 'bookings'
        : null;

  return (
    <div className="space-y-2">
      {(insight.reasons?.length ?? 0) > 0 && (
        <ul className={`text-[11px] leading-relaxed list-disc pl-4 space-y-0.5 ${dm ? 'text-muted-foreground' : 'text-gray-600'}`}>
          {insight.reasons!.slice(0, 4).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {targetView && onOpenView && (
        <button
          type="button"
          onClick={() => onOpenView(targetView)}
          className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${
            dm ? 'bg-brand-soft text-brand hover:bg-brand-soft/80' : 'bg-status-info-soft text-status-info hover:bg-status-info-soft/80'
          }`}
        >
          {insight.actionLabel ?? (targetView === 'stations' ? 'Open station' : 'Open bookings')}
          <Icon name="external-link" className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ─── State components ────────────────────────────────────────────────

function LoadingState({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`rounded-lg p-3 border animate-pulse ${isDarkMode ? 'bg-muted/40 border-border/30' : 'bg-gray-50/60 border-gray-200/40'}`}
        >
          <div className="flex items-start gap-2.5">
            <div className={`w-6 h-6 rounded-md ${isDarkMode ? 'bg-muted/60' : 'bg-gray-200/60'}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-3 rounded w-1/3 ${isDarkMode ? 'bg-muted/60' : 'bg-gray-200/60'}`} />
              <div className={`h-2.5 rounded w-4/5 ${isDarkMode ? 'bg-muted/40' : 'bg-gray-200/40'}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FinancialEmptyState({ isDarkMode, locale }: { isDarkMode: boolean; locale: string }) {
  return (
    <div
      className={`rounded-lg border p-4 flex items-center gap-3 ${
        isDarkMode
          ? 'bg-emerald-500/5 border-emerald-800/30 text-emerald-400'
          : 'bg-emerald-50/60 border-emerald-200/40 text-emerald-600'
      }`}
    >
      <Icon name="check-circle" className="w-4 h-4 shrink-0" />
      <div>
        <div className="text-xs font-semibold">
          {locale === 'de' ? 'Keine finanziellen Auffälligkeiten' : 'No financial alerts'}
        </div>
        <div className="text-[10.5px] mt-0.5 opacity-80">
          {locale === 'de'
            ? 'Aktuell keine Hinweise auf entgangene Umsätze oder ungenutzte Flottenkapazität.'
            : 'No signals for lost revenue or under-utilised fleet capacity right now.'}
        </div>
      </div>
    </div>
  );
}

function ErrorState({ isDarkMode, onRetry }: { isDarkMode: boolean; onRetry: () => void }) {
  return (
    <div className={`rounded-lg border p-4 text-center ${isDarkMode ? 'bg-muted/30 border-border/30' : 'bg-gray-50/40 border-gray-200/40'}`}>
      <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>
        Could not load insights
      </p>
      <button
        onClick={onRetry}
        className={`mt-2 text-[10px] font-medium px-2.5 py-1 rounded-md transition-colors ${isDarkMode ? 'bg-muted text-foreground/85 hover:bg-muted/80' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
      >
        Retry
      </button>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function safeTruncate(s: string | undefined | null, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

function formatRelativeTime(iso: string | undefined | null): string {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60_000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return '';
  }
}

function isVehicleScoped(insight: DashboardInsight): boolean {
  // entityScope arrives as a string from the API; treat anything other than
  // STATION / BOOKING as a vehicle list (covers the 6 vehicle-scoped types
  // and is a safe default when scope is missing on legacy payloads).
  const scope = insight.entityScope?.toUpperCase();
  if (scope === 'STATION') return false;
  if (scope === 'BOOKING') return false;
  if (insight.actionType === 'navigate_station') return false;
  if (insight.actionType === 'navigate_booking' || insight.actionType === 'navigate_bookings') return false;
  return true;
}

function formatEntityDetail(type: InsightType, metrics: Record<string, unknown> | null | undefined): string | null {
  if (!metrics) return null;
  const parts: string[] = [];

  switch (type) {
    case 'BATTERY_CRITICAL': {
      const v = numericOr(metrics.voltageV, null);
      const soh = numericOr(metrics.sohPercent, null);
      if (v !== null) parts.push(`Spannung ${v.toFixed(2)} V`);
      if (soh !== null) parts.push(`SOH ${Math.round(soh)}%`);
      break;
    }
    case 'SERVICE_OVERDUE': {
      const days = numericOr(metrics.remainingDays, null);
      const km = numericOr(metrics.remainingKm, null);
      if (days !== null) parts.push(days < 0 ? `${Math.abs(Math.round(days))} Tage überfällig` : `Noch ${Math.round(days)} Tage`);
      if (km !== null) parts.push(km < 0 ? `${Math.abs(Math.round(km)).toLocaleString('de-DE')} km überfällig` : `Noch ${Math.round(km).toLocaleString('de-DE')} km`);
      break;
    }
    case 'LOW_UTILIZATION': {
      const idle = numericOr(metrics.idleDays, null);
      const lost = numericOr(metrics.lostRevenueEur, null);
      if (idle !== null) parts.push(`${idle}+ Tage idle`);
      if (lost !== null) parts.push(`~${Math.round(lost).toLocaleString('de-DE')} € entgangen`);
      break;
    }
    case 'SERVICE_WINDOW': {
      const h = numericOr(metrics.windowHours, null);
      if (h !== null) parts.push(`Freies Fenster: ${Math.round(h)} h`);
      break;
    }
    case 'SERVICE_BEFORE_BOOKING': {
      const h = numericOr(metrics.hoursUntilBooking, null);
      if (h !== null) parts.push(`Pickup in ${Math.round(h)} h`);
      break;
    }
    case 'TIGHT_HANDOVER': {
      const gap = numericOr(metrics.gapMinutes, null);
      if (gap !== null) parts.push(`${Math.round(gap)} min zwischen Rückgabe & Pickup`);
      break;
    }
    case 'RETURN_NEEDS_INSPECTION': {
      const r = metrics.returnInMin ?? metrics.dueInMin;
      const num = numericOr(r, null);
      if (num !== null) parts.push(`Rückgabe in ${Math.round(num)} min`);
      break;
    }
    case 'PICKUP_OVERDUE': {
      // V4.6.81 — Der Detector schreibt minutesOverdue in die Metrics
      // (siehe PickupOverdueDetector). Für die Dashboard-Zeile formatieren
      // wir das in h/Tage um, damit das Disponieren-Team direkt sieht,
      // wie akut der Rückstand ist.
      const m = numericOr(metrics.minutesOverdue, null);
      if (m !== null) {
        if (m >= 24 * 60) {
          const days = Math.floor(m / (24 * 60));
          const h = Math.floor((m % (24 * 60)) / 60);
          parts.push(`${days} Tag${days === 1 ? '' : 'e'} ${h} h überfällig`);
        } else if (m >= 60) {
          parts.push(`${Math.floor(m / 60)} h ${Math.round(m % 60)} min überfällig`);
        } else {
          parts.push(`${Math.round(m)} min überfällig`);
        }
      }
      break;
    }
    default:
      break;
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

function numericOr(value: unknown, fallback: number | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

