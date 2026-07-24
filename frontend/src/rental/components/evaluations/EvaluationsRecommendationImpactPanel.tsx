import { AlertTriangle, BarChart3, Loader2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { EvaluationsRecommendationRecord } from '@synq/evaluations-insights/evaluations-recommendations';
import {
  canMeasureRecommendationImpact,
  resolveDefaultImpactKpi,
  type RecommendationImpactOutcomeStatus,
  type RecommendationImpactTrend,
  type RecommendationImplementationStatus,
} from '@synq/evaluations-insights/evaluations-impact-measurement';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { useRentalOrg } from '../../RentalContext';
import { canManageEvaluationsRecommendations } from '@synq/evaluations-insights/evaluations-recommendations';
import { formatRecommendationMoney } from '../../lib/evaluations-recommendations-format';
import {
  useEvaluationsRecommendationImpact,
  type MeasureRecommendationImpactInput,
} from '../../hooks/useEvaluationsRecommendationImpact';
import { cn } from '../../../components/ui/utils';
import { EVALUATIONS_TOUCH_TARGET_CLASS } from './evaluations-responsive.constants';

const OUTCOME_KEYS: Record<RecommendationImpactOutcomeStatus, TranslationKey> = {
  INSUFFICIENT_DATA: 'evaluations.impact.outcome.INSUFFICIENT_DATA',
  INCONCLUSIVE: 'evaluations.impact.outcome.INCONCLUSIVE',
  PARTIAL_SUCCESS: 'evaluations.impact.outcome.PARTIAL_SUCCESS',
  SUCCESS: 'evaluations.impact.outcome.SUCCESS',
  BELOW_EXPECTATION: 'evaluations.impact.outcome.BELOW_EXPECTATION',
  NEGATIVE: 'evaluations.impact.outcome.NEGATIVE',
  CANCELLED: 'evaluations.impact.outcome.CANCELLED',
  PARTIALLY_IMPLEMENTED: 'evaluations.impact.outcome.PARTIALLY_IMPLEMENTED',
};

const TREND_KEYS: Record<RecommendationImpactTrend, TranslationKey> = {
  IMPROVING: 'evaluations.impact.trend.IMPROVING',
  STABLE: 'evaluations.impact.trend.STABLE',
  DECLINING: 'evaluations.impact.trend.DECLINING',
  UNKNOWN: 'evaluations.impact.trend.UNKNOWN',
};

const CONFIDENCE_KEYS = {
  LOW: 'evaluations.actionCenter.confidence.LOW',
  MEDIUM: 'evaluations.actionCenter.confidence.MEDIUM',
  HIGH: 'evaluations.actionCenter.confidence.HIGH',
  VERY_HIGH: 'evaluations.actionCenter.confidence.VERY_HIGH',
} as const;

interface EvaluationsRecommendationImpactPanelProps {
  recommendation: EvaluationsRecommendationRecord;
  analyticsLocale: string;
}

function TrendIcon({ trend }: { trend: RecommendationImpactTrend }) {
  if (trend === 'IMPROVING') return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden />;
  if (trend === 'DECLINING') return <TrendingDown className="h-3.5 w-3.5 text-red-500" aria-hidden />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
}

function formatPeriod(
  from: string,
  to: string,
  locale: string,
): string {
  const fmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'medium' });
  return `${fmt.format(new Date(from))} – ${fmt.format(new Date(to))}`;
}

function defaultPeriods() {
  return {
    baselineFrom: '2026-06-01',
    baselineTo: '2026-06-30',
    measurementFrom: '2026-07-01',
    measurementTo: '2026-07-30',
  };
}

export function EvaluationsRecommendationImpactPanel({
  recommendation,
  analyticsLocale,
}: EvaluationsRecommendationImpactPanelProps) {
  const { t, locale } = useLanguage();
  const { orgId, userRole, hasPermission } = useRentalOrg();
  const canManage = canManageEvaluationsRecommendations({ userRole, hasPermission });
  const measurable = canMeasureRecommendationImpact(recommendation.status);
  const defaultKpi = resolveDefaultImpactKpi(recommendation.category);

  const { latest, versions, loading, pending, error, measure } = useEvaluationsRecommendationImpact(
    orgId,
    recommendation.id,
    measurable,
  );

  const [showForm, setShowForm] = useState(false);
  const [baselineValue, setBaselineValue] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [actualKpiValue, setActualKpiValue] = useState('');
  const [actualBenefitMinor, setActualBenefitMinor] = useState('');
  const [actualCostMinor, setActualCostMinor] = useState('');
  const [dataCoveragePercent, setDataCoveragePercent] = useState('90');
  const [implementationStatus, setImplementationStatus] =
    useState<RecommendationImplementationStatus>('FULL');
  const [seasonalFactor, setSeasonalFactor] = useState('');
  const periods = defaultPeriods();
  const [baselineFrom, setBaselineFrom] = useState(periods.baselineFrom);
  const [baselineTo, setBaselineTo] = useState(periods.baselineTo);
  const [measurementFrom, setMeasurementFrom] = useState(periods.measurementFrom);
  const [measurementTo, setMeasurementTo] = useState(periods.measurementTo);

  useEffect(() => {
    if (!showForm) return;
    setBaselineValue('');
    setTargetValue('');
    setActualKpiValue('');
    setActualBenefitMinor(
      recommendation.expectedBenefit
        ? String(Math.round(recommendation.expectedBenefit.amountMinor / 100))
        : '',
    );
    setActualCostMinor(
      recommendation.estimatedCost
        ? String(Math.round(recommendation.estimatedCost.amountMinor / 100))
        : '',
    );
  }, [showForm, recommendation]);

  if (!measurable) return null;

  const buildMeasureBody = (): MeasureRecommendationImpactInput => ({
    baselineValue: baselineValue ? Number(baselineValue) : null,
    targetValue: targetValue ? Number(targetValue) : null,
    actualKpiValue: actualKpiValue ? Number(actualKpiValue) : null,
    actualBenefit:
      actualBenefitMinor && recommendation.expectedBenefit
        ? {
            amountMinor: Math.round(Number(actualBenefitMinor) * 100),
            currency: recommendation.expectedBenefit.currency,
          }
        : null,
    actualCost:
      actualCostMinor && recommendation.estimatedCost
        ? {
            amountMinor: Math.round(Number(actualCostMinor) * 100),
            currency: recommendation.estimatedCost.currency,
          }
        : null,
    baselinePeriod: {
      from: new Date(baselineFrom).toISOString(),
      to: new Date(`${baselineTo}T23:59:59.999Z`).toISOString(),
    },
    measurementPeriod: {
      from: new Date(measurementFrom).toISOString(),
      to: new Date(`${measurementTo}T23:59:59.999Z`).toISOString(),
    },
    dataCoveragePercent: dataCoveragePercent ? Number(dataCoveragePercent) : null,
    implementationStatus,
    seasonalOrExternalFactors: seasonalFactor.trim() ? [seasonalFactor.trim()] : undefined,
    locale: locale === 'en' ? 'en' : 'de',
  });

  const handleMeasure = async () => {
    try {
      await measure(buildMeasureBody());
      setShowForm(false);
    } catch {
      /* surfaced via hook */
    }
  };

  const display = latest;

  return (
    <section aria-labelledby="eval-rec-impact-title" data-testid="evaluations-recommendation-impact">
      <h3
        id="eval-rec-impact-title"
        className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        <BarChart3 className="h-3.5 w-3.5" aria-hidden />
        {t('evaluations.impact.title')}
      </h3>

      {loading && !display ? (
        <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {t('evaluations.impact.loading')}
        </div>
      ) : null}

      {error ? (
        <p
          className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-600 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {display ? (
        <div className="space-y-3 rounded-lg border border-border/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase">
              {t(OUTCOME_KEYS[display.outcomeStatus])}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <TrendIcon trend={display.trend} />
              {t(TREND_KEYS[display.trend])}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {t('evaluations.impact.confidence')}: {t(CONFIDENCE_KEYS[display.confidence])}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              v{display.version}
            </span>
          </div>

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {display.correlationDisclaimer}
          </p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <p className="sq-section-label mb-0.5">{t('evaluations.impact.baseline')}</p>
              <p className="text-[12px] tabular-nums">
                {display.baselineValue ?? '—'}
                <span className="block text-[10px] text-muted-foreground">
                  {display.baselineKpiLabel ?? defaultKpi.label}
                </span>
              </p>
            </div>
            <div>
              <p className="sq-section-label mb-0.5">{t('evaluations.impact.target')}</p>
              <p className="text-[12px] tabular-nums">{display.targetValue ?? '—'}</p>
            </div>
            <div>
              <p className="sq-section-label mb-0.5">{t('evaluations.impact.actualKpi')}</p>
              <p className="text-[12px] font-semibold tabular-nums">{display.actualKpiValue ?? '—'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-md bg-muted/20 px-2 py-2">
              <p className="sq-section-label mb-1">{t('evaluations.impact.expectedVsActual')}</p>
              <p className="text-[11px]">
                <span className="text-muted-foreground">{t('evaluations.impact.expectedBenefit')}: </span>
                <span className="tabular-nums">
                  {formatRecommendationMoney(display.expectedBenefit, analyticsLocale)}
                </span>
              </p>
              <p className="text-[11px]">
                <span className="text-muted-foreground">{t('evaluations.impact.actualBenefit')}: </span>
                <span className="tabular-nums font-medium">
                  {formatRecommendationMoney(display.actualBenefit, analyticsLocale)}
                </span>
              </p>
              {display.varianceFromExpected ? (
                <p className="mt-1 text-[11px]">
                  <span className="text-muted-foreground">{t('evaluations.impact.variance')}: </span>
                  <span
                    className={cn(
                      'tabular-nums font-medium',
                      display.varianceFromExpected.amountMinor >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400',
                    )}
                  >
                    {formatRecommendationMoney(display.varianceFromExpected, analyticsLocale)}
                  </span>
                </p>
              ) : null}
            </div>
            <div className="rounded-md bg-muted/20 px-2 py-2">
              <p className="sq-section-label mb-1">{t('evaluations.impact.costs')}</p>
              <p className="text-[11px]">
                <span className="text-muted-foreground">{t('evaluations.impact.expectedCost')}: </span>
                <span className="tabular-nums">
                  {formatRecommendationMoney(display.expectedCost, analyticsLocale)}
                </span>
              </p>
              <p className="text-[11px]">
                <span className="text-muted-foreground">{t('evaluations.impact.actualCost')}: </span>
                <span className="tabular-nums font-medium">
                  {formatRecommendationMoney(display.actualCost, analyticsLocale)}
                </span>
              </p>
              {display.dataCoveragePercent != null ? (
                <p className="mt-1 text-[11px]">
                  <span className="text-muted-foreground">{t('evaluations.impact.dataCoverage')}: </span>
                  <span className="tabular-nums">{display.dataCoveragePercent}%</span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-[10px] text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">{t('evaluations.impact.baselinePeriod')}: </span>
              {formatPeriod(display.baselinePeriod.from, display.baselinePeriod.to, analyticsLocale)}
            </p>
            <p>
              <span className="font-medium text-foreground">{t('evaluations.impact.measurementPeriod')}: </span>
              {formatPeriod(
                display.measurementPeriod.from,
                display.measurementPeriod.to,
                analyticsLocale,
              )}
            </p>
          </div>

          {display.limitations.length > 0 ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-2">
              <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                {t('evaluations.impact.limitations')}
              </p>
              <ul className="list-disc space-y-0.5 pl-4 text-[10px] text-amber-900 dark:text-amber-100">
                {display.limitations.map((item, idx) => (
                  <li key={`${item.code}-${idx}`}>{item.message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {display.deviationExplanation ? (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{t('evaluations.impact.deviation')}: </span>
              {display.deviationExplanation}
            </p>
          ) : null}

          {versions.length > 1 ? (
            <p className="text-[10px] text-muted-foreground">
              {t('evaluations.impact.versionCount', { count: versions.length })}
            </p>
          ) : null}
        </div>
      ) : !loading ? (
        <p className="text-[11px] text-muted-foreground">{t('evaluations.impact.empty')}</p>
      ) : null}

      {canManage ? (
        <div className="mt-3">
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className={cn('sq-cta px-3 py-2 text-[11px] font-semibold', EVALUATIONS_TOUCH_TARGET_CLASS)}
            >
              {latest ? t('evaluations.impact.recordNew') : t('evaluations.impact.record')}
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <p className="text-[11px] font-semibold">{t('evaluations.impact.formTitle')}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                  {t('evaluations.impact.baseline')}
                  <input
                    type="number"
                    value={baselineValue}
                    onChange={(e) => setBaselineValue(e.target.value)}
                    className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                  />
                </label>
                <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                  {t('evaluations.impact.target')}
                  <input
                    type="number"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                  />
                </label>
                <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                  {t('evaluations.impact.actualKpi')}
                  <input
                    type="number"
                    value={actualKpiValue}
                    onChange={(e) => setActualKpiValue(e.target.value)}
                    className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                  {t('evaluations.impact.actualBenefit')} (EUR)
                  <input
                    type="number"
                    value={actualBenefitMinor}
                    onChange={(e) => setActualBenefitMinor(e.target.value)}
                    className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                  />
                </label>
                <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                  {t('evaluations.impact.actualCost')} (EUR)
                  <input
                    type="number"
                    value={actualCostMinor}
                    onChange={(e) => setActualCostMinor(e.target.value)}
                    className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                  {t('evaluations.impact.baselinePeriod')}
                  <span className="flex gap-1">
                    <input
                      type="date"
                      value={baselineFrom}
                      onChange={(e) => setBaselineFrom(e.target.value)}
                      className="w-full rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                    />
                    <input
                      type="date"
                      value={baselineTo}
                      onChange={(e) => setBaselineTo(e.target.value)}
                      className="w-full rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                    />
                  </span>
                </label>
                <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                  {t('evaluations.impact.measurementPeriod')}
                  <span className="flex gap-1">
                    <input
                      type="date"
                      value={measurementFrom}
                      onChange={(e) => setMeasurementFrom(e.target.value)}
                      className="w-full rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                    />
                    <input
                      type="date"
                      value={measurementTo}
                      onChange={(e) => setMeasurementTo(e.target.value)}
                      className="w-full rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                    />
                  </span>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                  {t('evaluations.impact.dataCoverage')} (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={dataCoveragePercent}
                    onChange={(e) => setDataCoveragePercent(e.target.value)}
                    className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                  />
                </label>
                <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                  {t('evaluations.impact.implementationStatus')}
                  <select
                    value={implementationStatus}
                    onChange={(e) =>
                      setImplementationStatus(e.target.value as RecommendationImplementationStatus)
                    }
                    className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                  >
                    <option value="FULL">{t('evaluations.impact.implementation.FULL')}</option>
                    <option value="PARTIAL">{t('evaluations.impact.implementation.PARTIAL')}</option>
                    <option value="CANCELLED">{t('evaluations.impact.implementation.CANCELLED')}</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                {t('evaluations.impact.seasonalFactor')}
                <input
                  type="text"
                  value={seasonalFactor}
                  onChange={(e) => setSeasonalFactor(e.target.value)}
                  placeholder={t('evaluations.impact.seasonalFactorPlaceholder')}
                  className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px]"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void handleMeasure()}
                  className={cn('sq-cta px-3 py-2 text-[11px] font-semibold', EVALUATIONS_TOUCH_TARGET_CLASS)}
                >
                  {pending ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
                  {t('evaluations.impact.save')}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setShowForm(false)}
                  className={cn(
                    'rounded-lg border border-border/60 px-3 py-2 text-[11px] font-semibold',
                    EVALUATIONS_TOUCH_TARGET_CLASS,
                  )}
                >
                  {t('evaluations.impact.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
