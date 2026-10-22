import { useLanguage } from '../../../i18n/LanguageContext';
import type { TripMotionMapPayload } from './motion-map.types';
import { isMotionMapActive, isMotionMapEvaluationPresent } from './motion-map.utils';

export function TripMotionMapStatusBanner({
  payload,
  loading,
  error,
}: {
  payload: TripMotionMapPayload | null;
  loading: boolean;
  error: boolean;
}) {
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="pointer-events-none absolute top-3 left-3 z-20 rounded-lg border border-border/50 bg-background/85 px-2.5 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm">
        {t('trips.motionMap.loading')}
      </div>
    );
  }
  if (error) {
    return (
      <div className="pointer-events-none absolute top-3 left-3 z-20 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-800 dark:text-amber-300 backdrop-blur-sm">
        {t('trips.motionMap.loadError')}
      </div>
    );
  }
  if (!payload) return null;
  if (isMotionMapEvaluationPresent(payload) && !isMotionMapActive(payload)) {
    return (
      <div className="pointer-events-none absolute top-3 left-3 z-20 max-w-[min(100%,18rem)] rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-900 dark:text-amber-200 backdrop-blur-sm">
        <span className="font-semibold">{payload.previewLabel}</span>
        <span className="mt-0.5 block">{t('trips.motionMap.snapshotUnverified')}</span>
        {payload.geometryNote && (
          <span className="mt-0.5 block text-muted-foreground">{payload.geometryNote}</span>
        )}
      </div>
    );
  }
  if (isMotionMapActive(payload)) {
    return (
      <div className="pointer-events-none absolute top-3 left-3 z-20 max-w-[min(100%,18rem)] rounded-lg border border-brand/25 bg-background/90 px-2.5 py-1.5 text-[10px] text-foreground backdrop-blur-sm">
        <span className="font-semibold text-brand">{payload.previewLabel}</span>
        {payload.status === 'SUCCEEDED_EMPTY' && (
          <span className="mt-0.5 block text-muted-foreground">{t('trips.motionMap.emptyEvaluation')}</span>
        )}
        {payload.newerFailedRunId && (
          <span className="mt-0.5 block text-amber-700 dark:text-amber-300">{t('trips.motionMap.newerRunFailed')}</span>
        )}
        {payload.snapshotBindingVerified === false && (
          <span className="mt-0.5 block text-muted-foreground">{t('trips.motionMap.snapshotUnverified')}</span>
        )}
        {payload.geometryNote && (
          <span className="mt-0.5 block text-muted-foreground">{payload.geometryNote}</span>
        )}
      </div>
    );
  }
  if (payload.status === 'PENDING') {
    return (
      <div className="pointer-events-none absolute top-3 left-3 z-20 rounded-lg border border-border/50 bg-background/85 px-2.5 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm">
        {t('trips.motionMap.pending')}
      </div>
    );
  }
  if (payload.status === 'FAILED') {
    return (
      <div className="pointer-events-none absolute top-3 left-3 z-20 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[10px] text-red-700 dark:text-red-300 backdrop-blur-sm">
        {t('trips.motionMap.failed')}
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute top-3 left-3 z-20 rounded-lg border border-border/40 bg-background/80 px-2.5 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm">
      {t('trips.motionMap.notAvailable')}
    </div>
  );
}
