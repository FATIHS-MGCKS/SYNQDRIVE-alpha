import type { ReactNode } from 'react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import { LiquidGlassLens } from '../../../components/surface';
import { tv } from './trips-view-ui';
import type { TripMotionMapPickListItem, TripMotionMapPopoverState } from './motion-map.types';
import { formatMotionBucketTime, motionEventLabelKey } from './motion-map.utils';

interface TripMotionMapPopoverProps {
  state: TripMotionMapPopoverState;
  onClose: () => void;
  onPickListSelect?: (item: TripMotionMapPickListItem) => void;
}

function pickListItemLabel(
  item: TripMotionMapPickListItem,
  t: (key: string) => string,
  locale: string,
): string {
  if (item.type === 'event') {
    return `${t(motionEventLabelKey(item.event))} · ${formatMotionBucketTime(item.event.startLabelUtc, locale)}`;
  }
  return `${t('trips.motionMap.stopTitle')} · ${formatMotionBucketTime(item.stop.startLatestUtc, locale)}`;
}

export function TripMotionMapPopover({ state, onClose, onPickListSelect }: TripMotionMapPopoverProps) {
  const { t, locale } = useLanguage();
  const left = Math.min(Math.max(state.x, 120), window.innerWidth - 120);
  const top = Math.max(state.y - 8, 72);

  let title = '';
  let body: ReactNode = null;

  if (state.kind === 'pickList') {
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
                {pickListItemLabel(item, t, locale)}
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
      </>
    );
  } else if (state.kind === 'event') {
    title = t(motionEventLabelKey(state.event));
    const delta =
      state.event.deltaKmh > 0 ? `+${Math.round(state.event.deltaKmh)}` : `${Math.round(state.event.deltaKmh)}`;
    body = (
      <>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {formatMotionBucketTime(state.event.startLabelUtc, locale)}
        </p>
        <p className="mt-1 text-[11px] text-foreground tabular-nums">
          {t('trips.motionMap.speedDelta', {
            from: Math.round(state.event.startSpeedKmh),
            to: Math.round(state.event.endSpeedKmh),
            delta,
          })}
        </p>
        {state.event.artefactSuspect && (
          <p className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            {t('trips.motionMap.artefactSuspect')}
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
