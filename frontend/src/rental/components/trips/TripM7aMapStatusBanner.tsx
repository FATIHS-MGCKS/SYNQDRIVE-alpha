import { useLanguage } from '../../../i18n/LanguageContext';
import type { TripM7aMapPayload } from './m7a-map.types';
import { isM7aMapActive, isM7aMapEvaluationPresent } from './m7a-map.utils';

export function TripM7aMapStatusBanner({
  payload,
  loading,
  error,
}: {
  payload: TripM7aMapPayload | null;
  loading: boolean;
  error: boolean;
}) {
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="pointer-events-none absolute top-3 right-3 z-20 rounded-lg border border-border/50 bg-background/85 px-2.5 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm max-w-[min(100%,16rem)]">
        {t('trips.m7aMap.loading')}
      </div>
    );
  }
  if (error) {
    return (
      <div className="pointer-events-none absolute top-3 right-3 z-20 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-800 dark:text-amber-300 backdrop-blur-sm max-w-[min(100%,16rem)]">
        {t('trips.m7aMap.loadError')}
      </div>
    );
  }
  if (!payload) return null;

  if (isM7aMapEvaluationPresent(payload) && !isM7aMapActive(payload)) {
    const legacy = payload.limitations.includes('LEGACY_RUN_WITHOUT_POSITION_ANCHORS');
    return (
      <div className="pointer-events-none absolute top-3 right-3 z-20 max-w-[min(100%,18rem)] rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-900 dark:text-amber-200 backdrop-blur-sm">
        <span className="font-semibold">{payload.previewLabel}</span>
        <span className="mt-0.5 block">
          {legacy ? t('trips.m7aMap.legacyNoAnchors') : t('trips.m7aMap.noMapGeometry')}
        </span>
        {payload.geometryNote && (
          <span className="mt-0.5 block text-muted-foreground">{payload.geometryNote}</span>
        )}
      </div>
    );
  }

  if (isM7aMapActive(payload)) {
    return (
      <div className="pointer-events-none absolute top-3 right-3 z-20 max-w-[min(100%,18rem)] rounded-lg border border-violet-500/25 bg-background/90 px-2.5 py-1.5 text-[10px] text-foreground backdrop-blur-sm">
        <span className="font-semibold text-violet-700 dark:text-violet-300">{payload.previewLabel}</span>
        <span className="mt-0.5 block text-muted-foreground">{t('trips.m7aMap.anchorPointsHint')}</span>
        <span className="mt-0.5 block text-muted-foreground">{t('trips.m7aMap.modelDecisionHint')}</span>
      </div>
    );
  }

  if (payload.status === 'PENDING') {
    return (
      <div className="pointer-events-none absolute top-3 right-3 z-20 rounded-lg border border-border/50 bg-background/85 px-2.5 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm">
        {t('trips.m7aMap.pending')}
      </div>
    );
  }
  if (payload.status === 'ROAD_CONTEXT_UNAVAILABLE') {
    return (
      <div className="pointer-events-none absolute top-3 right-3 z-20 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-800 dark:text-amber-300 backdrop-blur-sm max-w-[min(100%,18rem)]">
        {t('trips.m7aMap.roadContextUnavailable')}
      </div>
    );
  }
  if (payload.status === 'FAILED') {
    return (
      <div className="pointer-events-none absolute top-3 right-3 z-20 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[10px] text-red-700 dark:text-red-300 backdrop-blur-sm">
        {t('trips.m7aMap.failed')}
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute top-3 right-3 z-20 rounded-lg border border-border/40 bg-background/80 px-2.5 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm">
      {t('trips.m7aMap.notAvailable')}
    </div>
  );
}
