import { useEffect, useState } from 'react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { api, type TripGpsSpeedEvaluationProductV1 } from '../../../lib/api';
import { Icon } from '../ui/Icon';
import { isTripGpsSpeedEvaluationV2ProductUiEnabled } from '../../lib/trip-gps-speed-evaluation-feature';
import {
  formatTripGpsCoveragePercent,
  formatTripGpsSpeedKmh,
  tripGpsSpeedEvaluationHasDisplayableMetrics,
} from '../../lib/trip-gps-speed-evaluation-ui';

export interface TripGpsSpeedEvaluationPanelProps {
  vehicleId?: string;
  tripId: string;
}

function MetricRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-[13px] font-semibold tabular-nums text-foreground">{value}</dd>
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TripGpsSpeedEvaluationPanel({ vehicleId, tripId }: TripGpsSpeedEvaluationPanelProps) {
  const { t } = useLanguage();
  const [payload, setPayload] = useState<TripGpsSpeedEvaluationProductV1 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const uiEnabled = isTripGpsSpeedEvaluationV2ProductUiEnabled();

  useEffect(() => {
    if (!uiEnabled || !vehicleId || !tripId) {
      setPayload(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    void api.vehicleIntelligence
      .tripGpsSpeedEvaluationV2(vehicleId, tripId)
      .then((res) => {
        if (!cancelled) setPayload(res);
      })
      .catch(() => {
        if (!cancelled) {
          setPayload(null);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uiEnabled, vehicleId, tripId]);

  if (!uiEnabled) return null;

  if (loading) {
    return (
      <div
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Icon name="loader-2" className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {t('tripGpsSpeedEvaluation.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-[11px] text-amber-600 dark:text-amber-400" role="alert">
        {t('tripGpsSpeedEvaluation.error')}
      </p>
    );
  }

  if (!payload) return null;

  const notAvailable = t('tripGpsSpeedEvaluation.notAvailable');
  const hasMetrics = tripGpsSpeedEvaluationHasDisplayableMetrics(payload);

  let statusMessage: string | null = null;
  if (payload.availability === 'PENDING') {
    statusMessage = t('tripGpsSpeedEvaluation.pending');
  } else if (payload.availability === 'UNAVAILABLE') {
    statusMessage = t('tripGpsSpeedEvaluation.empty');
  } else if (payload.availability === 'NOT_ASSESSABLE') {
    statusMessage = t('tripGpsSpeedEvaluation.notAssessable');
  } else if (payload.limitedAssessability) {
    statusMessage = t('tripGpsSpeedEvaluation.limitedAssessability');
  }

  const maxKmh = formatTripGpsSpeedKmh(payload.speed?.maxKmh);
  const meanKmh = formatTripGpsSpeedKmh(payload.speed?.meanKmh);
  const maxHint =
    payload.speed?.maxScope === 'TRUSTED_LIMITED_ONLY'
      ? t('tripGpsSpeedEvaluation.maxScope.limited')
      : payload.limitedAssessability || payload.speed?.maxScope === 'TRUSTED_NUMERIC_INTERVALS'
        ? t('tripGpsSpeedEvaluation.maxScope.partial')
        : undefined;

  const numericCov = formatTripGpsCoveragePercent(payload.coverage?.numericCoveragePercent);
  const trustedCov = formatTripGpsCoveragePercent(payload.coverage?.trustedNumericCoveragePercent);
  const limitedCov = formatTripGpsCoveragePercent(payload.coverage?.trustedLimitedCoveragePercent);

  return (
    <section
      className="border border-border/60 surface-premium p-3 space-y-3"
      aria-label={t('tripGpsSpeedEvaluation.sectionTitle')}
    >
      <div className="flex items-center gap-2">
        <Icon name="gauge" className="h-4 w-4 text-[color:var(--status-info)]" aria-hidden />
        <h4 className="text-[12px] font-semibold text-foreground">
          {t('tripGpsSpeedEvaluation.sectionTitle')}
        </h4>
      </div>

      {statusMessage ? (
        <p className="text-[11px] text-muted-foreground">{statusMessage}</p>
      ) : null}

      {hasMetrics ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          <MetricRow
            label={t('tripGpsSpeedEvaluation.maxSpeed')}
            value={maxKmh != null ? `${maxKmh} ${t('tripGpsSpeedEvaluation.kmhSuffix')}` : notAvailable}
            hint={maxHint}
          />
          <MetricRow
            label={t('tripGpsSpeedEvaluation.meanSpeed')}
            value={meanKmh != null ? `${meanKmh} ${t('tripGpsSpeedEvaluation.kmhSuffix')}` : notAvailable}
            hint={t('tripGpsSpeedEvaluation.meanScope.trustedIntervals')}
          />
          <MetricRow
            label={t('tripGpsSpeedEvaluation.coverage.numeric')}
            value={
              numericCov != null
                ? `${numericCov}${t('tripGpsSpeedEvaluation.percentSuffix')}`
                : notAvailable
            }
          />
          <MetricRow
            label={t('tripGpsSpeedEvaluation.coverage.trustedNumeric')}
            value={
              trustedCov != null
                ? `${trustedCov}${t('tripGpsSpeedEvaluation.percentSuffix')}`
                : notAvailable
            }
          />
          <MetricRow
            label={t('tripGpsSpeedEvaluation.coverage.trustedLimited')}
            value={
              limitedCov != null
                ? `${limitedCov}${t('tripGpsSpeedEvaluation.percentSuffix')}`
                : notAvailable
            }
          />
          {payload.coverage != null ? (
            <MetricRow
              label={t('tripGpsSpeedEvaluation.stationaryIntervalsAccepted')}
              value={String(payload.coverage.trustedLimitedStationaryIntervalCount)}
              hint={t('tripGpsSpeedEvaluation.stationaryIntervalsAcceptedHint')}
            />
          ) : null}
          {payload.motion != null &&
          payload.motion.stationarySupportedIntervalCount !==
            payload.coverage?.trustedLimitedStationaryIntervalCount ? (
            <MetricRow
              label={t('tripGpsSpeedEvaluation.stationaryIntervalsCandidates')}
              value={String(payload.motion.stationarySupportedIntervalCount)}
              hint={t('tripGpsSpeedEvaluation.stationaryIntervalsCandidatesHint')}
            />
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
