/**
 * Pure metric-state resolution for Auswertungen (Prompt 28/54).
 */
import type {
  EvaluationsMetricFetchPhase,
  EvaluationsMetricUxKind,
  EvaluationsResolvedMetricState,
  EvaluationsSummaryExportRow,
  ResolveMetricFromEnvelopeOptions,
} from './evaluations-metric-state.contract';
import type { EvaluationsMetricStatus, EvaluationsSectionEnvelope } from './evaluations-analytics-primitives.contract';
import type { EvaluationsAnalyticsSummaryResponse } from './evaluations-analytics-summary.contract';

const LABELS_DE: Record<EvaluationsMetricUxKind, { short: string; tooltip: string }> = {
  available: { short: 'Verfügbar', tooltip: 'Aktuelle Kennzahl — Daten vollständig geladen.' },
  partial: {
    short: 'Teilweise',
    tooltip: 'Kennzahl basiert auf unvollständigen Quellen — Wert kann unterschätzt sein.',
  },
  stale: {
    short: 'Veraltet',
    tooltip: 'Angezeigter Wert stammt aus älteren Daten — Aktualisierung läuft oder Quelle ist veraltet.',
  },
  unavailable: {
    short: 'Nicht verfügbar',
    tooltip: 'Für diesen Zeitraum oder Filter liegen keine verwertbaren Daten vor.',
  },
  error: {
    short: 'Fehler',
    tooltip: 'Datenabruf fehlgeschlagen — kein gültiger Wert. Bitte erneut laden.',
  },
  not_applicable: {
    short: 'Nicht anwendbar',
    tooltip: 'Kennzahl gilt für den aktuellen Kontext nicht.',
  },
  null_value: {
    short: 'Kein Wert',
    tooltip: 'Gültiger Nullwert — es liegt kein betroffener Bestand vor.',
  },
};

const LABELS_EN: Record<EvaluationsMetricUxKind, { short: string; tooltip: string }> = {
  available: { short: 'Available', tooltip: 'Current metric — data fully loaded.' },
  partial: { short: 'Partial', tooltip: 'Metric uses incomplete sources — value may be understated.' },
  stale: { short: 'Stale', tooltip: 'Displayed value is from older data — refresh in progress or source is stale.' },
  unavailable: { short: 'Unavailable', tooltip: 'No usable data for this period or filter.' },
  error: { short: 'Error', tooltip: 'Fetch failed — no valid value. Please retry.' },
  not_applicable: { short: 'N/A', tooltip: 'Metric does not apply in the current context.' },
  null_value: { short: 'No value', tooltip: 'Valid zero — no affected balance.' },
};

export function metricUxLabels(
  kind: EvaluationsMetricUxKind,
  locale: 'de' | 'en' = 'de',
): { short: string; tooltip: string } {
  return locale === 'en' ? LABELS_EN[kind] : LABELS_DE[kind];
}

export function resolveFetchPhase(input: {
  loading: boolean;
  isRefetching: boolean;
  error: string | null;
  hasData: boolean;
}): EvaluationsMetricFetchPhase {
  if (input.loading && !input.hasData) return 'loading';
  if (input.isRefetching) return 'refetching';
  if (input.error && !input.hasData) return 'failed';
  if (input.hasData || input.error) return 'ready';
  return 'idle';
}

function baseKindFromSectionStatus(status: EvaluationsMetricStatus): EvaluationsMetricUxKind {
  switch (status) {
    case 'OK':
      return 'available';
    case 'PARTIAL':
      return 'partial';
    case 'UNAVAILABLE':
      return 'unavailable';
    case 'ERROR':
      return 'error';
    default:
      return 'unavailable';
  }
}

export function resolveMetricFromEnvelope<T>(
  options: ResolveMetricFromEnvelopeOptions<T>,
): EvaluationsResolvedMetricState {
  const locale = options.locale ?? 'de';
  const {
    envelope,
    extractValue,
    formatValue,
    fetchPhase,
    fetchError,
    notApplicable,
    zeroMeansNull = false,
  } = options;

  const fail = (kind: EvaluationsMetricUxKind, error?: string | null): EvaluationsResolvedMetricState => {
    const labels = metricUxLabels(kind, locale);
    const detail = error ?? envelope?.error ?? fetchError ?? null;
    const tooltip = detail ? `${labels.tooltip} (${detail})` : labels.tooltip;
    return {
      kind,
      fetchPhase,
      canShowValue: false,
      showStaleOverlay: false,
      displayValue: null,
      rawValue: null,
      tooltip,
      shortLabel: labels.short,
      sectionStatus: envelope?.status,
      error: detail,
    };
  };

  if (notApplicable) {
    return fail('not_applicable');
  }

  if (fetchPhase === 'loading') {
    const labels = metricUxLabels('unavailable', locale);
    return {
      kind: 'unavailable',
      fetchPhase,
      canShowValue: false,
      showStaleOverlay: false,
      displayValue: null,
      rawValue: null,
      tooltip: locale === 'en' ? 'Loading…' : 'Wird geladen…',
      shortLabel: labels.short,
    };
  }

  if (fetchPhase === 'failed' || (fetchError && !envelope)) {
    return fail('error', fetchError);
  }

  if (!envelope) {
    return fail('unavailable');
  }

  const sectionKind = baseKindFromSectionStatus(envelope.status);
  if (sectionKind === 'error') {
    return fail('error', envelope.error);
  }
  if (sectionKind === 'unavailable') {
    return fail('unavailable', envelope.error);
  }

  const stale = envelope.freshness?.stale === true;
  const showStaleOverlay = fetchPhase === 'refetching' || stale;

  if (!envelope.data) {
    if (sectionKind === 'partial') {
      return fail('partial', envelope.error);
    }
    return fail('unavailable', envelope.error);
  }

  const rawValue = extractValue(envelope.data);
  if (rawValue === null) {
    const labels = metricUxLabels('unavailable', locale);
    return {
      kind: 'unavailable',
      fetchPhase,
      canShowValue: false,
      showStaleOverlay,
      displayValue: null,
      rawValue: null,
      tooltip: envelope.error ?? labels.tooltip,
      shortLabel: labels.short,
      sectionStatus: envelope.status,
      error: envelope.error,
    };
  }

  if (zeroMeansNull && rawValue === 0) {
    const labels = metricUxLabels('null_value', locale);
    return {
      kind: 'null_value',
      fetchPhase,
      canShowValue: true,
      showStaleOverlay,
      displayValue: formatValue(0),
      rawValue: 0,
      tooltip: labels.tooltip,
      shortLabel: labels.short,
      sectionStatus: envelope.status,
      error: envelope.error,
    };
  }

  let kind: EvaluationsMetricUxKind = sectionKind;
  if (stale && kind === 'available') {
    kind = 'stale';
  }

  const labels = metricUxLabels(kind, locale);
  let tooltip = labels.tooltip;
  if (envelope.error && kind === 'partial') {
    tooltip = `${labels.tooltip} (${envelope.error})`;
  }
  if (fetchPhase === 'refetching') {
    tooltip =
      locale === 'en'
        ? `${tooltip} Previous value shown while refreshing.`
        : `${tooltip} Vorheriger Wert wird während der Aktualisierung angezeigt.`;
  }

  return {
    kind,
    fetchPhase,
    canShowValue: true,
    showStaleOverlay,
    displayValue: formatValue(rawValue),
    rawValue,
    tooltip,
    shortLabel: labels.short,
    sectionStatus: envelope.status,
    error: envelope.error,
  };
}

export function resolveScalarMetricState(input: {
  value: number | null | undefined;
  fetchPhase: EvaluationsMetricFetchPhase;
  fetchError?: string | null;
  unavailable?: boolean;
  locale?: 'de' | 'en';
}): EvaluationsResolvedMetricState {
  const locale = input.locale ?? 'de';
  const formatEur = (minor: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'de-DE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(minor / 100);

  if (input.unavailable) {
    return resolveMetricFromEnvelope({
      envelope: {
        status: 'UNAVAILABLE',
        data: null,
        error: input.fetchError ?? null,
        generatedAt: new Date().toISOString(),
      },
      extractValue: () => null,
      formatValue: formatEur,
      fetchPhase: input.fetchPhase,
      fetchError: input.fetchError,
      locale,
    });
  }

  if (input.fetchError) {
    return resolveMetricFromEnvelope({
      envelope: {
        status: 'ERROR',
        data: null,
        error: input.fetchError,
        generatedAt: new Date().toISOString(),
      },
      extractValue: () => null,
      formatValue: formatEur,
      fetchPhase: input.fetchPhase,
      fetchError: input.fetchError,
      locale,
    });
  }

  if (input.value === null || input.value === undefined) {
    return resolveMetricFromEnvelope({
      envelope: {
        status: 'UNAVAILABLE',
        data: null,
        error: null,
        generatedAt: new Date().toISOString(),
      },
      extractValue: () => null,
      formatValue: formatEur,
      fetchPhase: input.fetchPhase,
      locale,
    });
  }

  return resolveMetricFromEnvelope({
    envelope: {
      status: 'OK',
      data: { value: input.value },
      error: null,
      generatedAt: new Date().toISOString(),
    },
    extractValue: (d) => d.value,
    formatValue: formatEur,
    fetchPhase: input.fetchPhase,
    locale,
    zeroMeansNull: false,
  });
}

export function formatCount(value: number, locale: 'de' | 'en' = 'de'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'de-DE').format(value);
}

export function buildSummaryExportRows(
  summary: EvaluationsAnalyticsSummaryResponse,
  locale: 'de' | 'en' = 'de',
): EvaluationsSummaryExportRow[] {
  const rows: EvaluationsSummaryExportRow[] = [];
  const pushSection = <T>(
    sectionKey: string,
    envelope: EvaluationsSectionEnvelope<T>,
    metrics: Array<{ key: string; label: string; extract: (data: T) => number | null; format: (v: number) => string }>,
  ) => {
    for (const metric of metrics) {
      const resolved = resolveMetricFromEnvelope({
        envelope,
        extractValue: metric.extract,
        formatValue: metric.format,
        fetchPhase: 'ready',
        locale,
      });
      const excluded = !resolved.canShowValue;
      rows.push({
        sectionKey,
        metricKey: metric.key,
        label: metric.label,
        status: envelope.status,
        uxKind: resolved.kind,
        value: resolved.displayValue ?? '—',
        excluded,
        exclusionReason: excluded ? (resolved.error ?? resolved.tooltip) : null,
        generatedAt: envelope.generatedAt ?? null,
        error: envelope.error,
      });
    }
  };

  pushSection('receivables', summary.receivables, [
    {
      key: 'openAmount',
      label: locale === 'en' ? 'Open receivables' : 'Offene Forderungen',
      extract: (d) => d.openAmountMinor,
      format: (v) => formatCount(v / 100, locale) + ' EUR',
    },
    {
      key: 'overdueAmount',
      label: locale === 'en' ? 'Overdue receivables' : 'Überfällige Forderungen',
      extract: (d) => d.overdueAmountMinor,
      format: (v) => formatCount(v / 100, locale) + ' EUR',
    },
  ]);

  pushSection('activeRisks', summary.activeRisks, [
    {
      key: 'businessRiskGroups',
      label: locale === 'en' ? 'Business risk groups' : 'Geschäftsrisiken (Gruppen)',
      extract: (d) => d.businessRiskGroups,
      format: (v) => formatCount(v, locale),
    },
    {
      key: 'criticalBookings',
      label: locale === 'en' ? 'Critical bookings' : 'Kritische Buchungen',
      extract: (d) => d.criticalBookings,
      format: (v) => formatCount(v, locale),
    },
    {
      key: 'revenueLeakageGroups',
      label: locale === 'en' ? 'Revenue leakage groups' : 'Umsatzverlust (Gruppen)',
      extract: (d) => d.revenueLeakageGroups,
      format: (v) => formatCount(v, locale),
    },
  ]);

  pushSection('downtime', summary.downtime, [
    {
      key: 'totalDowntimeVehicles',
      label: locale === 'en' ? 'Downtime vehicles' : 'Fahrzeugausfälle',
      extract: (d) => d.totalDowntimeVehicles,
      format: (v) => formatCount(v, locale),
    },
  ]);

  return rows;
}

export function summaryExportToCsv(rows: EvaluationsSummaryExportRow[]): string {
  const header = [
    'section',
    'metric',
    'label',
    'status',
    'ux_kind',
    'value',
    'excluded',
    'exclusion_reason',
    'generated_at',
    'error',
  ];
  const escape = (v: string | null | boolean) => {
    const s = v === null ? '' : String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.sectionKey,
        row.metricKey,
        row.label,
        row.status,
        row.uxKind,
        row.value,
        row.excluded,
        row.exclusionReason,
        row.generatedAt,
        row.error,
      ]
        .map(escape)
        .join(','),
    );
  }
  return lines.join('\n');
}
