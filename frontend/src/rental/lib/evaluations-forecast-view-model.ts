/**
 * Pure view-model for Auswertungen predictive forecast cards (Prompt 45/54).
 */

export type ForecastRegistryStatus =
  | 'DRAFT'
  | 'SHADOW'
  | 'APPROVED'
  | 'DISABLED'
  | 'ROLLED_BACK';

export type ForecastVisibilityState =
  | 'available'
  | 'low_confidence'
  | 'insufficient_history'
  | 'model_disabled'
  | 'gate_not_passed'
  | 'stale'
  | 'partial_data';

export type ForecastConfidenceLevel = 'high' | 'medium' | 'low';

export type ForecastKind = 'operational' | 'risk';

export type RegistryRow = {
  modelKey: string;
  modelVersion: string;
  horizonDays: number | null;
  status: ForecastRegistryStatus;
  gatesPassed?: boolean;
  driftSeverity?: string | null;
  backtestMetrics?: Record<string, unknown> | null;
};

export type BacktestResultRow = {
  modelKey: string;
  horizonDays: number;
  gatesPassed: boolean;
  status: string;
  metrics?: Record<string, unknown> | null;
};

export type OperationalForecastRow = {
  id: string;
  forecastKey: string;
  horizonDays: number;
  modelVersion: string;
  featureSetVersion: string;
  inferenceTier: string;
  scopeKey: string;
  currency: string | null;
  unit: string;
  asOfDate: string;
  horizonStartDate: string;
  horizonEndDate: string;
  pointEstimate: number;
  intervalLow: number;
  intervalHigh: number;
  dataCoveragePercent: number;
  status: string;
  suppressedReason?: string | null;
  generatedAt: string;
  expiresAt: string | null;
  evaluation?: {
    smape?: number | null;
    mape?: number | null;
    holdoutDays?: number;
    selectedMethod?: string;
  };
  explainability?: {
    inferenceTier?: string;
    method?: string;
    topFactors?: Array<{ factor: string; impact: string }>;
    limitations?: string[];
  };
  lineage?: {
    historyDays?: number;
    revenueSource?: string;
  };
  isForecast?: boolean;
};

export type RiskForecastRow = {
  id: string;
  riskKey: string;
  horizonDays: number;
  modelVersion: string;
  featureSetVersion: string;
  inferenceTier: string;
  scopeKey: string;
  currency: string | null;
  unit: string;
  asOfDate: string;
  horizonStartDate: string;
  horizonEndDate: string;
  probabilityEstimate: number | null;
  impactEstimate: number | null;
  costP50Minor: number | null;
  costP90Minor: number | null;
  pointEstimate: number | null;
  intervalLow: number | null;
  intervalHigh: number | null;
  dataCoveragePercent: number;
  status: string;
  suppressedReason?: string | null;
  generatedAt: string;
  expiresAt: string | null;
  evaluation?: Record<string, unknown>;
  explainability?: {
    topFactors?: Array<{ factor: string; impact: string }>;
    limitations?: string[];
  };
  isRiskForecast?: boolean;
};

export type EvaluationsForecastCardModel = {
  id: string;
  kind: ForecastKind;
  targetKey: string;
  horizonDays: number;
  pointEstimate: number | null;
  intervalLow: number | null;
  intervalHigh: number | null;
  unit: string;
  currency: string | null;
  inferenceTier: string;
  modelVersion: string;
  featureSetVersion: string;
  dataBasis: string;
  dataCoveragePercent: number;
  generatedAt: string;
  expiresAt: string | null;
  asOfDate: string;
  horizonStartDate: string;
  horizonEndDate: string;
  scopeKey: string;
  historicalSmape: number | null;
  historicalMape: number | null;
  gatesPassed: boolean | null;
  topFactors: Array<{ factor: string; impact: string }>;
  limitations: string[];
  visibility: ForecastVisibilityState;
  visibilityMessage: string;
  confidenceLevel: ForecastConfidenceLevel;
  isStale: boolean;
  probabilityEstimate: number | null;
  impactEstimate: number | null;
  costP50Minor: number | null;
  costP90Minor: number | null;
  isRiskForecast: boolean;
  registryStatus: ForecastRegistryStatus | null;
};

export type EvaluationsForecastsSectionModel = {
  displayableCards: EvaluationsForecastCardModel[];
  hiddenCount: number;
  hiddenReasons: string[];
  filterContext: {
    scopeKey: string;
    currency: string;
    stationLabel: string | null;
  };
  hasAnyData: boolean;
};

const STALE_HOURS = 72;
const LOW_COVERAGE = 60;
const PARTIAL_COVERAGE = 80;

const OPERATIONAL_LABELS: Record<string, string> = {
  DEMAND: 'Nachfrage (Buchungsstarts)',
  REVENUE: 'Umsatz (ausgestellte Rechnungen)',
  UTILIZATION: 'Auslastung',
};

const RISK_LABELS: Record<string, string> = {
  MAINTENANCE_COST: 'Wartungskosten',
  UNPLANNED_FAILURE: 'Ungeplanter Ausfall',
  EXPECTED_DOWNTIME: 'Erwartete Ausfallzeit',
  CAPACITY_RISK: 'Kapazitätsrisiko',
  COST_RISK: 'Kostenrisiko',
};

export function targetLabel(key: string, kind: ForecastKind): string {
  if (kind === 'operational') return OPERATIONAL_LABELS[key] ?? key;
  return RISK_LABELS[key] ?? key;
}

export function isForecastStale(
  generatedAt: string,
  expiresAt: string | null,
  now = Date.now(),
): boolean {
  if (expiresAt) {
    const exp = new Date(expiresAt).getTime();
    if (!Number.isNaN(exp) && exp < now) return true;
  }
  const gen = new Date(generatedAt).getTime();
  if (Number.isNaN(gen)) return false;
  return now - gen > STALE_HOURS * 60 * 60 * 1000;
}

export function findRegistry(
  registry: RegistryRow[],
  modelKey: string,
  horizonDays: number,
): RegistryRow | undefined {
  return registry.find(
    (r) => r.modelKey === modelKey && (r.horizonDays === horizonDays || r.horizonDays == null),
  );
}

export function findBacktest(
  backtests: BacktestResultRow[],
  modelKey: string,
  horizonDays: number,
): BacktestResultRow | undefined {
  return backtests.find((b) => b.modelKey === modelKey && b.horizonDays === horizonDays);
}

export function isRegistryApproved(status: ForecastRegistryStatus | null | undefined): boolean {
  return status === 'APPROVED';
}

export function computeConfidenceLevel(
  coverage: number,
  inferenceTier: string,
  status: string,
): ForecastConfidenceLevel {
  if (status === 'FALLBACK' || status === 'INSUFFICIENT_HISTORY' || status === 'INSUFFICIENT_DATA') {
    return 'low';
  }
  if (coverage < LOW_COVERAGE) return 'low';
  if (coverage < PARTIAL_COVERAGE || inferenceTier === 'RULE_BASED') return 'medium';
  return 'high';
}

export function resolveVisibility(input: {
  registry: RegistryRow | undefined;
  forecastStatus: string;
  dataCoveragePercent: number;
  isStale: boolean;
  suppressedReason?: string | null;
}): { visibility: ForecastVisibilityState; message: string; displayable: boolean } {
  const status = input.registry?.status;
  if (status === 'DISABLED' || status === 'ROLLED_BACK') {
    return {
      visibility: 'model_disabled',
      message: 'Modell deaktiviert — Prognose wird nicht angezeigt.',
      displayable: false,
    };
  }
  if (!isRegistryApproved(status ?? null)) {
    return {
      visibility: 'gate_not_passed',
      message: 'Release Gate nicht erfüllt — Prognose erst nach Freigabe sichtbar.',
      displayable: false,
    };
  }
  if (
    input.forecastStatus === 'INSUFFICIENT_HISTORY' ||
    input.forecastStatus === 'INSUFFICIENT_DATA' ||
    input.forecastStatus === 'SUPPRESSED'
  ) {
    return {
      visibility: 'insufficient_history',
      message: input.suppressedReason ?? 'Unzureichende Historie für eine belastbare Prognose.',
      displayable: false,
    };
  }
  if (input.isStale) {
    return {
      visibility: 'stale',
      message: 'Prognose veraltet — letzte Berechnung liegt zu weit zurück.',
      displayable: false,
    };
  }
  if (input.dataCoveragePercent < LOW_COVERAGE) {
    return {
      visibility: 'partial_data',
      message: 'Nur teilweise Datenabdeckung — Interpretation mit Vorsicht.',
      displayable: true,
    };
  }
  const confidence = computeConfidenceLevel(
    input.dataCoveragePercent,
    'STATISTICAL',
    input.forecastStatus,
  );
  if (confidence === 'low' || input.forecastStatus === 'FALLBACK') {
    return {
      visibility: 'low_confidence',
      message: 'Niedrige Prognose-Confidence — Schätzung, keine Gewissheit.',
      displayable: true,
    };
  }
  return {
    visibility: 'available',
    message: 'Statistische Prognose mit dokumentierter Unsicherheit.',
    displayable: true,
  };
}

function operationalDataBasis(row: OperationalForecastRow): string {
  if (row.forecastKey === 'REVENUE') {
    return row.lineage?.revenueSource === 'invoice_issued_minor'
      ? 'Ausgestellte Ausgangsrechnungen (EUR)'
      : 'Ausgestellte Rechnungen';
  }
  if (row.forecastKey === 'UTILIZATION') return 'Flotten-Auslastung (täglich)';
  return 'Buchungsstarts (täglich)';
}

export function mapOperationalForecastCard(
  row: OperationalForecastRow,
  registry: RegistryRow[],
  backtests: BacktestResultRow[],
  now = Date.now(),
): EvaluationsForecastCardModel {
  const reg = findRegistry(registry, row.forecastKey, row.horizonDays);
  const bt = findBacktest(backtests, row.forecastKey, row.horizonDays);
  const stale = isForecastStale(row.generatedAt, row.expiresAt, now);
  const resolved = resolveVisibility({
    registry: reg,
    forecastStatus: row.status,
    dataCoveragePercent: row.dataCoveragePercent,
    isStale: stale,
    suppressedReason: row.suppressedReason,
  });

  return {
    id: row.id,
    kind: 'operational',
    targetKey: row.forecastKey,
    horizonDays: row.horizonDays,
    pointEstimate: row.pointEstimate,
    intervalLow: row.intervalLow,
    intervalHigh: row.intervalHigh,
    unit: row.unit,
    currency: row.currency ?? 'EUR',
    inferenceTier: row.inferenceTier,
    modelVersion: row.modelVersion,
    featureSetVersion: row.featureSetVersion,
    dataBasis: operationalDataBasis(row),
    dataCoveragePercent: row.dataCoveragePercent,
    generatedAt: row.generatedAt,
    expiresAt: row.expiresAt,
    asOfDate: row.asOfDate,
    horizonStartDate: row.horizonStartDate,
    horizonEndDate: row.horizonEndDate,
    scopeKey: row.scopeKey,
    historicalSmape: row.evaluation?.smape ?? (bt?.metrics?.smape as number | null) ?? null,
    historicalMape: row.evaluation?.mape ?? (bt?.metrics?.mape as number | null) ?? null,
    gatesPassed: bt?.gatesPassed ?? reg?.gatesPassed ?? null,
    topFactors: row.explainability?.topFactors ?? [],
    limitations: row.explainability?.limitations ?? [],
    visibility: resolved.visibility,
    visibilityMessage: resolved.message,
    confidenceLevel: computeConfidenceLevel(row.dataCoveragePercent, row.inferenceTier, row.status),
    isStale: stale,
    probabilityEstimate: null,
    impactEstimate: null,
    costP50Minor: null,
    costP90Minor: null,
    isRiskForecast: false,
    registryStatus: reg?.status ?? null,
    ...(resolved.displayable ? {} : { pointEstimate: null, intervalLow: null, intervalHigh: null }),
  };
}

export function mapRiskForecastCard(
  row: RiskForecastRow,
  registry: RegistryRow[],
  backtests: BacktestResultRow[],
  now = Date.now(),
): EvaluationsForecastCardModel {
  const reg = findRegistry(registry, row.riskKey, row.horizonDays);
  const bt = findBacktest(backtests, row.riskKey, row.horizonDays);
  const stale = isForecastStale(row.generatedAt, row.expiresAt, now);
  const resolved = resolveVisibility({
    registry: reg,
    forecastStatus: row.status,
    dataCoveragePercent: row.dataCoveragePercent,
    isStale: stale,
    suppressedReason: row.suppressedReason,
  });

  return {
    id: row.id,
    kind: 'risk',
    targetKey: row.riskKey,
    horizonDays: row.horizonDays,
    pointEstimate: row.pointEstimate,
    intervalLow: row.intervalLow,
    intervalHigh: row.intervalHigh,
    unit: row.unit,
    currency: row.currency ?? 'EUR',
    inferenceTier: row.inferenceTier,
    modelVersion: row.modelVersion,
    featureSetVersion: row.featureSetVersion,
    dataBasis: 'Servicefälle, Health-Signale, Feature-Snapshots',
    dataCoveragePercent: row.dataCoveragePercent,
    generatedAt: row.generatedAt,
    expiresAt: row.expiresAt,
    asOfDate: row.asOfDate,
    horizonStartDate: row.horizonStartDate,
    horizonEndDate: row.horizonEndDate,
    scopeKey: row.scopeKey,
    historicalSmape: (bt?.metrics?.smape as number | null) ?? null,
    historicalMape: (bt?.metrics?.mape as number | null) ?? null,
    gatesPassed: bt?.gatesPassed ?? reg?.gatesPassed ?? null,
    topFactors: row.explainability?.topFactors ?? [],
    limitations: row.explainability?.limitations ?? [],
    visibility: resolved.visibility,
    visibilityMessage: resolved.message,
    confidenceLevel: computeConfidenceLevel(row.dataCoveragePercent, row.inferenceTier, row.status),
    isStale: stale,
    probabilityEstimate: row.probabilityEstimate,
    impactEstimate: row.impactEstimate,
    costP50Minor: row.costP50Minor,
    costP90Minor: row.costP90Minor,
    isRiskForecast: true,
    registryStatus: reg?.status ?? null,
    ...(resolved.displayable
      ? {}
      : {
          pointEstimate: null,
          intervalLow: null,
          intervalHigh: null,
          probabilityEstimate: null,
          costP50Minor: null,
          costP90Minor: null,
        }),
  };
}

export function buildEvaluationsForecastsSection(input: {
  operational: OperationalForecastRow[];
  risk: RiskForecastRow[];
  registry: RegistryRow[];
  backtests: BacktestResultRow[];
  stationLabel?: string | null;
  now?: number;
}): EvaluationsForecastsSectionModel {
  const now = input.now ?? Date.now();
  const all = [
    ...input.operational.map((r) => mapOperationalForecastCard(r, input.registry, input.backtests, now)),
    ...input.risk.map((r) => mapRiskForecastCard(r, input.registry, input.backtests, now)),
  ];

  const displayableCards = all.filter(
    (c) =>
      c.visibility === 'available' ||
      c.visibility === 'low_confidence' ||
      c.visibility === 'partial_data',
  );

  const hidden = all.filter((c) => !displayableCards.includes(c));
  const hiddenReasons = [...new Set(hidden.map((c) => c.visibilityMessage))];

  const primaryHorizon = [30, 7];
  const sorted = [...displayableCards].sort((a, b) => {
    const ha = primaryHorizon.indexOf(a.horizonDays);
    const hb = primaryHorizon.indexOf(b.horizonDays);
    const scoreA = ha === -1 ? 99 : ha;
    const scoreB = hb === -1 ? 99 : hb;
    if (scoreA !== scoreB) return scoreA - scoreB;
    return a.targetKey.localeCompare(b.targetKey);
  });

  return {
    displayableCards: sorted,
    hiddenCount: hidden.length,
    hiddenReasons,
    filterContext: {
      scopeKey: 'fleet',
      currency: 'EUR',
      stationLabel: input.stationLabel ?? null,
    },
    hasAnyData: all.length > 0,
  };
}

export function formatForecastValue(
  card: EvaluationsForecastCardModel,
  locale = 'de-DE',
): { primary: string; range: string | null } {
  if (card.unit === 'EUR_minor') {
    const cents = card.pointEstimate ?? card.costP50Minor ?? 0;
    const primary = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: card.currency ?? 'EUR',
      maximumFractionDigits: 0,
    }).format(cents / 100);
    const low = card.costP50Minor ?? card.intervalLow;
    const high = card.costP90Minor ?? card.intervalHigh;
    if (low != null && high != null) {
      const fmt = (v: number) =>
        new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: card.currency ?? 'EUR',
          maximumFractionDigits: 0,
        }).format(v / 100);
      return { primary, range: `${fmt(low)} – ${fmt(high)}` };
    }
    return { primary, range: null };
  }
  if (card.unit === 'percent') {
    const v = card.pointEstimate ?? 0;
    return { primary: `${v.toFixed(1)} %`, range: null };
  }
  if (card.unit === 'probability') {
    const p = card.probabilityEstimate ?? card.pointEstimate ?? 0;
    return { primary: `${(p * 100).toFixed(1)} %`, range: null };
  }
  if (card.unit === 'minutes') {
    const m = card.pointEstimate ?? 0;
    return { primary: `${Math.round(m)} min`, range: null };
  }
  if (card.unit === 'score') {
    return { primary: String(Math.round(card.pointEstimate ?? 0)), range: null };
  }
  const v = card.pointEstimate ?? 0;
  return { primary: new Intl.NumberFormat(locale).format(v), range: null };
}

export function inferenceTierLabel(tier: string): string {
  if (tier === 'STATISTICAL') return 'Statistische Baseline';
  if (tier === 'RULE_BASED') return 'Regelbasierte Schätzung';
  return tier;
}

export const FORECAST_TERM_DEFINITIONS: Record<string, string> = {
  forecast:
    'Vorhersage für einen zukünftigen Zeitraum. Keine Garantie — immer mit Unsicherheitsintervall.',
  estimate: 'Heuristische Schätzung aus bekannten Eingaben — kein kalibriertes Prognosemodell.',
  observed: 'Gemessener Istwert aus gebuchten Daten.',
  interval: 'Unsicherheitsbereich (P50–P90 bzw. Intervallgrenzen). Werte außerhalb sind möglich.',
  smape: 'Symmetric MAPE — historische Prognosegüte aus Backtesting (niedriger = besser).',
  coverage: 'Anteil der Tage/Entitäten mit ausreichenden Eingangsdaten.',
  releaseGate: 'Freigabeprüfung — nur APPROVED-Modelle werden in Auswertungen angezeigt.',
};
