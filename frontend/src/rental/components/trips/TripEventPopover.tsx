import { Icon } from '../ui/Icon';
import { LiquidGlassLens } from '../../../components/surface';
import { cn } from '../../../components/ui/utils';
import { tv } from './trips-view-ui';
import type { TripBehaviorEvent } from './trips-map.types';
import { formatTripTime } from './trips-map.utils';
import { classificationToSeverity, eventTypeLabel } from './behavior-ui.utils';
import { TripEventSeverityBadge } from './TripEventSeverityBadge';

interface TripEventPopoverProps {
  event: TripBehaviorEvent;
  x: number;
  y: number;
  onClose: () => void;
  onShowInDetails?: () => void;
}

export function TripEventPopover({ event, x, y, onClose, onShowInDetails }: TripEventPopoverProps) {
  const severity = classificationToSeverity(event.classification, event.eventCategory);
  const toneClass =
    severity === 'critical' || severity === 'abuse'
      ? 'ring-1 ring-red-500/35'
      : severity === 'notable'
        ? 'ring-1 ring-amber-500/35'
        : '';

  const left = Math.min(Math.max(x, 120), window.innerWidth - 120);
  const top = Math.max(y - 8, 72);

  return (
    <>
      <button
        type="button"
        className="absolute inset-0 z-30 bg-transparent"
        aria-label="Popover schließen"
        onClick={onClose}
      />
      <div
        className="absolute z-40 w-[min(16rem,calc(100%-1.5rem))] -translate-x-1/2 -translate-y-full pointer-events-none"
        style={{ left, top }}
      >
        <LiquidGlassLens
          variant="fleetPanel"
          renderMode="shell"
          intensity="subtle"
          className={cn('pointer-events-auto w-full', toneClass)}
          role="dialog"
          aria-label={eventTypeLabel(event)}
        >
          <div className="liquid-glass-lens__trip-panel">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-foreground leading-snug">
                  {eventTypeLabel(event)}
                </p>
                <div className="mt-1">
                  <TripEventSeverityBadge level={severity} />
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={`${tv.focusRing} text-muted-foreground hover:text-foreground`}
              >
                <Icon name="x" className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {formatTripTime(event.startedAt)}
              {event.endSpeedKmh != null && event.startSpeedKmh != null && (
                <>
                  <span className="mx-1 opacity-40">·</span>
                  {Math.round(event.startSpeedKmh)} → {Math.round(event.endSpeedKmh)} km/h
                </>
              )}
            </p>
            {(event.peakG != null || event.peakValue != null) && (
              <p className="mt-1 text-[10px] text-foreground/90">
                {event.peakG != null && (
                  <span className="font-semibold tabular-nums">{event.peakG.toFixed(2)}g</span>
                )}
                {event.peakG != null && event.peakValue != null && (
                  <span className="mx-1 opacity-40">·</span>
                )}
                {event.peakValue != null && (
                  <span className="tabular-nums">
                    {event.peakValue.toFixed(1)} {event.peakValueUnit ?? ''}
                  </span>
                )}
              </p>
            )}
            {onShowInDetails && (
              <LiquidGlassLens
                variant="fleetPanelAction"
                renderMode="lens"
                intensity="subtle"
                className="mt-2.5 w-full"
              >
                <button
                  type="button"
                  onClick={() => {
                    onShowInDetails();
                    onClose();
                  }}
                  className={`liquid-glass-lens__panel-action ${tv.focusRing}`}
                >
                  <span className="liquid-glass-lens__panel-action__label">In Details anzeigen</span>
                </button>
              </LiquidGlassLens>
            )}
          </div>
        </LiquidGlassLens>
      </div>
    </>
  );
}
