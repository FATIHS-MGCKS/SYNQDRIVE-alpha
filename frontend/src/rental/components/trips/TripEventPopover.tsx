import { Icon } from '../ui/Icon';
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
  const toneBorder =
    severity === 'critical' || severity === 'abuse'
      ? 'border-red-500/40'
      : severity === 'notable'
        ? 'border-amber-500/35'
        : 'border-border/60';

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
        className={`absolute z-40 w-[min(16rem,calc(100%-1.5rem))] -translate-x-1/2 -translate-y-full sq-map-liquid-glass border ${toneBorder} px-3 py-2.5 shadow-lg`}
        style={{ left, top }}
        role="dialog"
        aria-label={eventTypeLabel(event)}
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-foreground leading-snug">
              {eventTypeLabel(event)}
            </p>
            <div className="mt-1">
              <TripEventSeverityBadge level={severity} />
            </div>
          </div>
          <button type="button" onClick={onClose} className={`${tv.focusRing} text-muted-foreground hover:text-foreground`}>
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
            {event.peakG != null && event.peakValue != null && <span className="mx-1 opacity-40">·</span>}
            {event.peakValue != null && (
              <span className="tabular-nums">
                {event.peakValue.toFixed(1)} {event.peakValueUnit ?? ''}
              </span>
            )}
          </p>
        )}
        {onShowInDetails && (
          <button
            type="button"
            onClick={() => {
              onShowInDetails();
              onClose();
            }}
            className={`${tv.focusRing} mt-2.5 w-full rounded-lg border border-border/70 bg-muted/40 px-2 py-1.5 text-[10px] font-semibold text-foreground hover:bg-muted/70 transition-colors`}
          >
            In Details anzeigen
          </button>
        )}
      </div>
    </>
  );
}
