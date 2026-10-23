import type { ReactNode } from 'react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import { LiquidGlassLens } from '../../../components/surface';
import { tv } from './trips-view-ui';
import type { TripMotionMapPickListItem, TripMotionMapPopoverState } from './motion-map.types';
import {
  deriveMotionEventMetrics,
  formatMotionBucketTime,
  formatSignedKmh,
  formatSignedMps2,
  isMotionEventKinematicallyImplausible,
  motionEventLabelKey,
  motionEventQualityLabelKey,
} from './motion-map.utils';
import type { TripM7aMapPoint } from './m7a-map.types';
import { m7aOutcomeLabelKey } from './m7a-map.utils';

interface TripMotionMapPopoverProps {
  state: TripMotionMapPopoverState;
  onClose: () => void;
  onPickListSelect?: (item: TripMotionMapPickListItem) => void;
  onM7aPointSelect?: (point: TripM7aMapPoint) => void;
}

function m7aPointSummary(
  point: TripM7aMapPoint,
  t: (key: string, vars?: Record<string, string | number>) => string,
): ReactNode {
  return (
    <>
      <p className="mt-2 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
        {t(m7aOutcomeLabelKey(point.outcome))}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
        {point.osmWayId != null ? t('trips.m7aMap.osmWay', { wayId: point.osmWayId }) : t('trips.m7aMap.noWay')}
      </p>
      {point.candidateWayIds.length > 1 && (
        <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
          {t('trips.m7aMap.candidates', { ids: point.candidateWayIds.join(', ') })}
        </p>
      )}
      {point.ambiguityReasons.length > 0 && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {t('trips.m7aMap.ambiguity', { reasons: point.ambiguityReasons.join(', ') })}
        </p>
      )}
    </>
  );
}

function pickListItemLabel(
  item: TripMotionMapPickListItem,
  t: (key: string, vars?: Record<string, string | number>) => string,
  locale: string,
): string {
  if (item.type === 'event') {
    return `${t(motionEventLabelKey(item.event))} · ${formatMotionBucketTime(item.event.startLabelUtc, locale)}`;
  }
  return `${t('trips.motionMap.stopTitle')} · ${formatMotionBucketTime(item.stop.startLatestUtc, locale)}`;
}

export function TripMotionMapPopover({ state, onClose, onPickListSelect, onM7aPointSelect }: TripMotionMapPopoverProps) {
  const { t, locale } = useLanguage();
  const left = Math.min(Math.max(state.x, 120), window.innerWidth - 120);
  const top = Math.max(state.y - 8, 72);

  let title = '';
  let body: ReactNode = null;

  if (state.kind === 'm7aPickList') {
    title = t('trips.m7aMap.pickListTitle');
    body = (
      <>
        <p className="text-[10px] text-muted-foreground mb-1.5">{t('trips.m7aMap.pickListHint')}</p>
        <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto">
          {state.points.map((point, index) => (
            <li key={`${point.bucketLabelUtc}-${index}`}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1 text-left text-[10px] font-medium text-foreground hover:bg-muted/60 tabular-nums"
                onClick={() => onM7aPointSelect?.(point)}
              >
                {formatMotionBucketTime(point.bucketLabelUtc, locale)} · {t(m7aOutcomeLabelKey(point.outcome) as never)}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  } else if (state.kind === 'm7aPoint') {
    title = t(m7aOutcomeLabelKey(state.point.outcome) as never);
    body = (
      <>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {formatMotionBucketTime(state.point.bucketLabelUtc, locale)}
        </p>
        {m7aPointSummary(state.point, (key, vars) => t(key as never, vars))}
      </>
    );
  } else if (state.kind === 'pickList') {
    title = t('trips.motionMap.pickListTitle');
    body = (
      <>
        <p className="text-[10px] text-muted-foreground mb-1.5">{t('trips.motionMap.pickListHint')}</p>
        <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto">
          {state.items.map((item, index) => (
            <li key={index}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1 text-left text-[10px] font-medium text-foreground hover:bg-muted/60 tabular-nums"
                onClick={() => onPickListSelect?.(item)}
              >
                {pickListItemLabel(item, (key, vars) => t(key as never, vars), locale)}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  } else if (state.kind === 'sample') {
    title = t('trips.motionMap.speedTitle');
    body = (
      <>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {formatMotionBucketTime(state.sample.bucketLabelUtc, locale)}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-foreground tabular-nums">
          {state.sample.speedKmh == null
            ? t('trips.motionMap.noMeasurement')
            : `${Math.round(state.sample.speedKmh)} km/h`}
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {t('trips.motionMap.motionState', { state: state.sample.motionState })}
        </p>
        {state.m7aBindingNote && (
          <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-300">{state.m7aBindingNote}</p>
        )}
        {state.m7aPoint && m7aPointSummary(state.m7aPoint, (key, vars) => t(key as never, vars))}
      </>
    );
  } else if (state.kind === 'event') {
    title = t(motionEventLabelKey(state.event));
    const metrics = deriveMotionEventMetrics(state.event);
    const qualityKey = motionEventQualityLabelKey(state.event.quality);
    const segment = state.segment;
    body = (
      <>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {t('trips.motionMap.eventWindow', {
            start: formatMotionBucketTime(state.event.startLabelUtc, locale),
            end: formatMotionBucketTime(state.event.endLabelUtc, locale),
          })}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-foreground tabular-nums">
          {t('trips.motionMap.speedDelta', {
            from: Math.round(state.event.startSpeedKmh),
            to: Math.round(state.event.endSpeedKmh),
            delta: formatSignedKmh(metrics.signedDeltaKmh),
          })}
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
          {metrics.durationS != null && t('trips.motionMap.eventDuration', { seconds: metrics.durationS })}
          {metrics.durationS != null && metrics.meanAccelMps2 != null && <span className="mx-1 opacity-40">·</span>}
          {metrics.meanAccelMps2 != null &&
            t('trips.motionMap.eventMeanAccel', { accel: formatSignedMps2(metrics.meanAccelMps2) })}
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {t('trips.motionMap.eventQuality', { quality: qualityKey ? t(qualityKey) : state.event.quality })}
        </p>
        {segment && segment.sampleCount < 2 && (
          <p className="mt-1 text-[10px] text-muted-foreground">{t('trips.motionMap.segmentUnavailable')}</p>
        )}
        {segment && segment.sampleCount >= 2 && segment.extended && (
          <p className="mt-1 text-[10px] text-muted-foreground">{t('trips.motionMap.segmentApproximate')}</p>
        )}
        {state.event.artefactSuspect && (
          <p className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            {t('trips.motionMap.artefactSuspect')}
          </p>
        )}
        {!state.event.artefactSuspect && isMotionEventKinematicallyImplausible(state.event) && (
          <p className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            {t('trips.motionMap.kinematicImplausible')}
          </p>
        )}
      </>
    );
  } else {
    title = t('trips.motionMap.stopTitle');
    const stopKind = state.stop.observed && !state.stop.inferred
      ? t('trips.motionMap.stopObserved')
      : state.stop.inferred
        ? t('trips.motionMap.stopInferred')
        : t('trips.motionMap.stopMixed');
    body = (
      <>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {formatMotionBucketTime(state.stop.startLatestUtc, locale)}
          {state.stop.endLatestUtc ? ` – ${formatMotionBucketTime(state.stop.endLatestUtc, locale)}` : ''}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-foreground tabular-nums">
          {t('trips.motionMap.stopMinDuration', { seconds: Math.round(state.stop.minDurationS) })}
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{stopKind}</p>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className="absolute inset-0 z-30 bg-transparent"
        aria-label={t('trips.motionMap.close')}
        onClick={onClose}
      />
      <div
        className="absolute z-40 w-[min(16rem,calc(100%-1.5rem))] -translate-x-1/2 -translate-y-full pointer-events-none"
        style={{ left, top }}
      >
        <LiquidGlassLens variant="fleetPanel" renderMode="shell" intensity="subtle" className="pointer-events-auto w-full">
          <div className="liquid-glass-lens__trip-panel">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-[11px] font-semibold text-foreground">{title}</p>
              <button type="button" onClick={onClose} className={tv.focusRing} aria-label={t('trips.motionMap.close')}>
                <Icon name="x" className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            {body}
          </div>
        </LiquidGlassLens>
      </div>
    </>
  );
}
