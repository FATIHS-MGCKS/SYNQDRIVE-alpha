import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { LiquidGlassLens } from '../../../components/surface';
import { tv } from './trips-view-ui';
import type { TripMotionMapPopoverState } from './motion-map.types';
import { formatMotionBucketTime, motionEventLabel } from './motion-map.utils';

interface TripMotionMapPopoverProps {
  state: TripMotionMapPopoverState;
  onClose: () => void;
}

export function TripMotionMapPopover({ state, onClose }: TripMotionMapPopoverProps) {
  const left = Math.min(Math.max(state.x, 120), window.innerWidth - 120);
  const top = Math.max(state.y - 8, 72);

  let title = '';
  let body: ReactNode = null;

  if (state.kind === 'sample') {
    title = 'Geschwindigkeit';
    body = (
      <>
        <p className="text-[10px] text-muted-foreground tabular-nums">{formatMotionBucketTime(state.sample.bucketLabelUtc)}</p>
        <p className="mt-1 text-[11px] font-semibold text-foreground tabular-nums">
          {state.sample.speedKmh == null ? 'Keine Messung' : `${Math.round(state.sample.speedKmh)} km/h`}
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">Zustand: {state.sample.motionState}</p>
      </>
    );
  } else if (state.kind === 'event') {
    title = motionEventLabel(state.event);
    body = (
      <>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {formatMotionBucketTime(state.event.startLabelUtc)}
        </p>
        <p className="mt-1 text-[11px] text-foreground tabular-nums">
          {Math.round(state.event.startSpeedKmh)} → {Math.round(state.event.endSpeedKmh)} km/h
          <span className="text-muted-foreground"> ({state.event.deltaKmh > 0 ? '+' : ''}{Math.round(state.event.deltaKmh)})</span>
        </p>
        {state.event.artefactSuspect && (
          <p className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">Artefaktverdacht</p>
        )}
      </>
    );
  } else {
    title = 'Stillstand';
    body = (
      <>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {formatMotionBucketTime(state.stop.startLatestUtc)}
          {state.stop.endLatestUtc ? ` – ${formatMotionBucketTime(state.stop.endLatestUtc)}` : ''}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-foreground tabular-nums">
          mind. {Math.round(state.stop.minDurationS)} s
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {state.stop.observed && !state.stop.inferred ? 'Beobachtet' : state.stop.inferred ? 'Erschlossen' : 'Gemischt'}
        </p>
      </>
    );
  }

  return (
    <>
      <button type="button" className="absolute inset-0 z-30 bg-transparent" aria-label="Schließen" onClick={onClose} />
      <div
        className="absolute z-40 w-[min(16rem,calc(100%-1.5rem))] -translate-x-1/2 -translate-y-full pointer-events-none"
        style={{ left, top }}
      >
        <LiquidGlassLens variant="fleetPanel" renderMode="shell" intensity="subtle" className="pointer-events-auto w-full">
          <div className="liquid-glass-lens__trip-panel">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-[11px] font-semibold text-foreground">{title}</p>
              <button type="button" onClick={onClose} className={tv.focusRing}>
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
