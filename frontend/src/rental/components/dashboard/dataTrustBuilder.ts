import type { StatusTone } from '../../../components/patterns';
import type { VehicleTelemetryFreshness } from './controlSignalsBuilder';
import type { ControlCenterKpi, DataFreshnessSummary } from './dashboardTypes';
import { formatLastSyncLabel } from './dashboardUtils';

export type DataTrustStatus =
  | 'live'
  | 'fresh'
  | 'partial'
  | 'stale'
  | 'error'
  | 'unavailable';

export type DataTrustDomainId =
  | 'fleet'
  | 'telemetry'
  | 'booking'
  | 'handover'
  | 'financial'
  | 'insights';

export type DashboardTrustHint =
  | 'live'
  | 'partial-data'
  | 'no-telemetry'
  | 'financial-unavailable'
  | 'booking-unavailable'
  | 'insights-unavailable'
  | 'freshness-unknown';

export interface DataTrustDomainSummary {
  id: DataTrustDomainId;
  label: string;
  status: DataTrustStatus;
  detail: string;
  timestampLabel: string;
  computable: boolean;
}

export interface DataTrustLayer {
  overallStatus: DataTrustStatus;
  domains: DataTrustDomainSummary[];
  lastRefreshLabel: string;
}

const STATUS_RANK: Record<DataTrustStatus, number> = {
  error: 0,
  unavailable: 1,
  stale: 2,
  partial: 3,
  fresh: 4,
  live: 5,
};

function de(locale: string): boolean {
  return locale === 'de';
}

function worstStatus(statuses: DataTrustStatus[]): DataTrustStatus {
  return statuses.reduce(
    (worst, s) => (STATUS_RANK[s] < STATUS_RANK[worst] ? s : worst),
    'live',
  );
}

export function dataTrustStatusTone(status: DataTrustStatus): StatusTone {
  if (status === 'live' || status === 'fresh') return 'success';
  if (status === 'partial') return 'info';
  if (status === 'stale') return 'watch';
  if (status === 'error') return 'critical';
  return 'neutral';
}

export function dataTrustStatusLabel(status: DataTrustStatus, locale: string): string {
  const isDe = de(locale);
  const map: Record<DataTrustStatus, [string, string]> = {
    live: ['Live', 'Live'],
    fresh: ['Fresh', 'Frisch'],
    partial: ['Partial', 'Teilweise'],
    stale: ['Stale', 'Veraltet'],
    error: ['Error', 'Fehler'],
    unavailable: ['Unavailable', 'Nicht verfügbar'],
  };
  return isDe ? map[status][1] : map[status][0];
}

export function trustHintLabel(hint: DashboardTrustHint, locale: string): string {
  const isDe = de(locale);
  const map: Record<DashboardTrustHint, [string, string]> = {
    live: ['Live', 'Live'],
    'partial-data': ['Partial data', 'Teilweise Daten'],
    'no-telemetry': ['No telemetry', 'Keine Telemetrie'],
    'financial-unavailable': ['Financial data unavailable', 'Finanzdaten nicht verfügbar'],
    'booking-unavailable': ['Booking data unavailable', 'Buchungsdaten nicht verfügbar'],
    'insights-unavailable': ['Insights unavailable', 'Insights nicht verfügbar'],
    'freshness-unknown': ['Freshness unknown', 'Aktualität unbekannt'],
  };
  return isDe ? map[hint][1] : map[hint][0];
}

function classifyTelemetryStatus(tlm: VehicleTelemetryFreshness): DataTrustStatus {
  if (tlm.totalInScope === 0) return 'unavailable';
  if (tlm.telemetryUnavailable || !tlm.hasReliableTimestamps) return 'unavailable';
  if (tlm.freshCount > 0 && tlm.staleCount === 0 && tlm.offlineCount === 0 && tlm.unknownCount === 0) {
    return 'live';
  }
  if (tlm.freshCount >= tlm.staleCount + tlm.offlineCount) return 'fresh';
  if (tlm.staleCount > tlm.freshCount) return 'stale';
  return 'partial';
}

function classifyInsightsStatus(input: {
  locale: string;
  insightsLoading: boolean;
  insightsError: boolean;
  insightsStale: boolean;
  insightsGeneratedAt: string | null;
}): { status: DataTrustStatus; detail: string; timestampLabel: string; computable: boolean } {
  const isDe = de(input.locale);
  if (input.insightsError) {
    return {
      status: 'error',
      detail: isDe ? 'Insights-API nicht erreichbar' : 'Insights API unreachable',
      timestampLabel: isDe ? 'Aktualität unbekannt' : 'Freshness unknown',
      computable: false,
    };
  }
  if (input.insightsLoading) {
    return {
      status: 'partial',
      detail: isDe ? 'Insights werden geladen' : 'Loading insights',
      timestampLabel: isDe ? 'Aktualität unbekannt' : 'Freshness unknown',
      computable: false,
    };
  }
  if (input.insightsStale) {
    return {
      status: 'stale',
      detail: isDe ? 'Letzter Lauf veraltet' : 'Last run is stale',
      timestampLabel: input.insightsGeneratedAt
        ? formatLastSyncLabel(input.insightsGeneratedAt, null, input.locale)
        : isDe
          ? 'Aktualität unbekannt'
          : 'Freshness unknown',
      computable: true,
    };
  }
  if (!input.insightsGeneratedAt) {
    return {
      status: 'partial',
      detail: isDe ? 'Noch kein Insights-Lauf' : 'No insights run yet',
      timestampLabel: isDe ? 'Aktualität unbekannt' : 'Freshness unknown',
      computable: false,
    };
  }
  const ageMin = Math.round((Date.now() - Date.parse(input.insightsGeneratedAt)) / 60_000);
  const status: DataTrustStatus = ageMin <= 30 ? 'live' : ageMin <= 120 ? 'fresh' : 'stale';
  return {
    status,
    detail: isDe ? 'Detektoren aus letztem Lauf' : 'Detectors from last run',
    timestampLabel: formatLastSyncLabel(input.insightsGeneratedAt, null, input.locale),
    computable: true,
  };
}

export function buildDataTrustLayer(input: {
  locale: string;
  orgActive: boolean;
  fleetLoading: boolean;
  fleetVehicleCount: number;
  fleetCountdownSec: number;
  telemetry: VehicleTelemetryFreshness;
  dataFreshness: DataFreshnessSummary;
  todayBookingsError: boolean;
  invoicesError: boolean;
  lastManualSyncAt: string | null;
}): DataTrustLayer {
  const isDe = de(input.locale);
  const { dataFreshness: df, telemetry: tlm } = input;

  const fleetStatus: DataTrustStatus = !input.orgActive
    ? 'unavailable'
    : df.fleetLoading
      ? 'partial'
      : input.fleetVehicleCount === 0
        ? 'partial'
        : 'live';

  const fleetDomain: DataTrustDomainSummary = {
    id: 'fleet',
    label: isDe ? 'Flottendaten' : 'Fleet data',
    status: fleetStatus,
    detail: !input.orgActive
      ? isDe
        ? 'Keine Organisation aktiv'
        : 'No active organization'
      : df.fleetLoading
        ? isDe
          ? 'Flotte wird geladen'
          : 'Loading fleet'
        : input.fleetVehicleCount === 0
          ? isDe
            ? 'Keine Fahrzeuge im Scope'
            : 'No vehicles in scope'
          : isDe
            ? `${input.fleetVehicleCount} Fahrzeuge im Scope`
            : `${input.fleetVehicleCount} vehicles in scope`,
    timestampLabel: df.fleetLoading
      ? isDe
        ? 'Aktualität unbekannt'
        : 'Freshness unknown'
      : input.fleetCountdownSec > 0
        ? isDe
          ? `Auto-Refresh in ${input.fleetCountdownSec}s`
          : `Auto-refresh in ${input.fleetCountdownSec}s`
        : isDe
          ? 'Gerade geladen'
          : 'Just loaded',
    computable: !df.fleetLoading && input.orgActive,
  };

  const telemetryStatus = classifyTelemetryStatus(tlm);
  const telemetryDomain: DataTrustDomainSummary = {
    id: 'telemetry',
    label: isDe ? 'Telemetrie' : 'Telemetry data',
    status: telemetryStatus,
    detail: tlm.totalInScope === 0
      ? isDe
        ? 'Keine Fahrzeuge für Telemetrie'
        : 'No vehicles for telemetry'
      : tlm.telemetryUnavailable
        ? isDe
          ? 'Keine zuverlässigen Timestamps'
          : 'No reliable timestamps'
        : isDe
          ? `${tlm.freshCount} frisch · ${tlm.staleCount} stale · ${tlm.offlineCount + tlm.unknownCount} offline/unbekannt`
          : `${tlm.freshCount} fresh · ${tlm.staleCount} stale · ${tlm.offlineCount + tlm.unknownCount} offline/unknown`,
    timestampLabel: tlm.hasReliableTimestamps
      ? tlm.lastRefreshLabel
      : isDe
        ? 'Aktualität unbekannt'
        : 'Freshness unknown',
    computable: tlm.hasReliableTimestamps && tlm.totalInScope > 0,
  };

  const bookingStatus: DataTrustStatus = input.todayBookingsError
    ? 'error'
    : !df.todayBookingsLoaded
      ? 'partial'
      : 'live';

  const bookingDomain: DataTrustDomainSummary = {
    id: 'booking',
    label: isDe ? 'Buchungsdaten' : 'Booking data',
    status: bookingStatus,
    detail: input.todayBookingsError
      ? isDe
        ? 'Heutige Buchungen nicht geladen'
        : "Today's bookings failed to load"
      : !df.todayBookingsLoaded
        ? isDe
          ? 'Heutige Buchungen werden geladen'
          : "Loading today's bookings"
        : isDe
          ? 'Pickups & Returns heute verfügbar'
          : "Today's pickups & returns available",
    timestampLabel: df.todayBookingsLoaded
      ? isDe
        ? 'Heute geladen'
        : 'Loaded for today'
      : isDe
        ? 'Aktualität unbekannt'
        : 'Freshness unknown',
    computable: df.todayBookingsLoaded && !input.todayBookingsError,
  };

  const handoverDomain: DataTrustDomainSummary = {
    id: 'handover',
    label: isDe ? 'Handover-Daten' : 'Handover data',
    status: bookingStatus,
    detail: input.todayBookingsError
      ? isDe
        ? 'Handover-Planung nicht belastbar'
        : 'Handover planning not reliable'
      : !df.todayBookingsLoaded
        ? isDe
          ? 'Wartet auf Buchungsdaten'
          : 'Waiting for booking data'
        : isDe
          ? 'Übergaben aus Today-Bookings ableitbar'
          : 'Handovers derived from today bookings',
    timestampLabel: bookingDomain.timestampLabel,
    computable: bookingDomain.computable,
  };

  const financialStatus: DataTrustStatus = !input.orgActive
    ? 'unavailable'
    : input.invoicesError
      ? 'error'
      : !df.invoicesLoaded
        ? 'partial'
        : 'fresh';

  const financialDomain: DataTrustDomainSummary = {
    id: 'financial',
    label: isDe ? 'Finanzdaten' : 'Financial data',
    status: financialStatus,
    detail: !input.orgActive
      ? isDe
        ? 'Keine Organisation aktiv'
        : 'No active organization'
      : input.invoicesError
        ? isDe
          ? 'Rechnungen nicht geladen'
          : 'Invoices failed to load'
        : !df.invoicesLoaded
          ? isDe
            ? 'Rechnungen werden geladen'
            : 'Loading invoices'
          : isDe
            ? 'Rechnungen für KPIs verfügbar'
            : 'Invoices available for KPIs',
    timestampLabel: isDe ? 'Aktualität unbekannt' : 'Freshness unknown',
    computable: df.invoicesLoaded && !input.invoicesError && input.orgActive,
  };

  const insightsMeta = classifyInsightsStatus({
    locale: input.locale,
    insightsLoading: df.insightsLoading,
    insightsError: df.insightsError,
    insightsStale: df.insightsStale,
    insightsGeneratedAt: df.insightsGeneratedAt,
  });

  const insightsDomain: DataTrustDomainSummary = {
    id: 'insights',
    label: isDe ? 'Dashboard Insights' : 'Dashboard insights',
    status: insightsMeta.status,
    detail: insightsMeta.detail,
    timestampLabel: insightsMeta.timestampLabel,
    computable: insightsMeta.computable,
  };

  const domains = [
    fleetDomain,
    telemetryDomain,
    bookingDomain,
    handoverDomain,
    financialDomain,
    insightsDomain,
  ];

  return {
    overallStatus: worstStatus(domains.map((d) => d.status)),
    domains,
    lastRefreshLabel: formatLastSyncLabel(
      df.insightsGeneratedAt,
      input.lastManualSyncAt,
      input.locale,
    ),
  };
}

function domainToTrustHint(domain: DataTrustDomainSummary): DashboardTrustHint | undefined {
  if (domain.status === 'live' || domain.status === 'fresh') return undefined;
  if (domain.id === 'telemetry' && domain.status === 'unavailable') return 'no-telemetry';
  if (domain.id === 'financial' && (domain.status === 'error' || domain.status === 'unavailable')) {
    return 'financial-unavailable';
  }
  if (domain.id === 'booking' && domain.status === 'error') return 'booking-unavailable';
  if (domain.id === 'insights' && domain.status === 'error') return 'insights-unavailable';
  if (domain.status === 'partial' || domain.status === 'stale') return 'partial-data';
  if (
    domain.timestampLabel.includes('unbekannt') ||
    domain.timestampLabel.includes('unknown')
  ) {
    return 'freshness-unknown';
  }
  return 'partial-data';
}

export function attachKpiTrustHints(
  kpis: ControlCenterKpi[],
  trust: DataTrustLayer,
): ControlCenterKpi[] {
  const byId = Object.fromEntries(trust.domains.map((d) => [d.id, d])) as Record<
    DataTrustDomainId,
    DataTrustDomainSummary
  >;

  return kpis.map((kpi) => {
    let domain: DataTrustDomainSummary | undefined;
    if (kpi.id === 'ready-to-rent' || kpi.id === 'active-rented' || kpi.id === 'maintenance') {
      domain = byId.fleet;
    } else if (kpi.id === 'due-soon' || kpi.id === 'overdue-returns') {
      domain = byId.booking;
    } else if (kpi.id === 'critical-alerts') {
      domain = byId.insights;
    }
    const trustHint = domain ? domainToTrustHint(domain) : undefined;
    return trustHint ? { ...kpi, trustHint } : kpi;
  });
}

export function sectionTrustHint(
  section: 'operations' | 'fleet' | 'finance' | 'insights',
  trust: DataTrustLayer,
): DashboardTrustHint | undefined {
  const byId = Object.fromEntries(trust.domains.map((d) => [d.id, d])) as Record<
    DataTrustDomainId,
    DataTrustDomainSummary
  >;

  if (section === 'operations') {
    return domainToTrustHint(byId.booking) ?? domainToTrustHint(byId.handover);
  }
  if (section === 'fleet') {
    return domainToTrustHint(byId.fleet) ?? domainToTrustHint(byId.telemetry);
  }
  if (section === 'finance') return domainToTrustHint(byId.financial);
  return domainToTrustHint(byId.insights);
}
