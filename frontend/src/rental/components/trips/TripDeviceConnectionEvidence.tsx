import { useEffect, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { api, getErrorMessage, type TripDeviceConnectionEvidenceItem } from '../../../lib/api';
import { Icon } from '../ui/Icon';
import {
  DEVICE_CONNECTION_LABELS,
  formatDeviceConnectionTimestamp,
  formatDurationMs,
  isDeviceConnectionForbiddenError,
  tripEvidenceHeadline,
  tripEvidenceStatusLabel,
} from '../../lib/device-connection-ui';

export interface TripDeviceConnectionEvidenceProps {
  vehicleId?: string;
  tripId: string;
}

export function TripDeviceConnectionEvidence({
  vehicleId,
  tripId,
}: TripDeviceConnectionEvidenceProps) {
  const [events, setEvents] = useState<TripDeviceConnectionEvidenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!vehicleId || !tripId) {
      setEvents([]);
      setForbidden(false);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setForbidden(false);
    setError(false);
    void api.vehicleIntelligence
      .tripDeviceConnectionEvidence(vehicleId, tripId)
      .then((res) => {
        if (!cancelled) setEvents(res.events ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setEvents([]);
        const message = getErrorMessage(err);
        if (isDeviceConnectionForbiddenError(message)) {
          setForbidden(true);
        } else {
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, tripId]);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />
        Telematik-Evidenz wird geladen…
      </div>
    );
  }

  if (forbidden) {
    return (
      <p className="text-[11px] text-muted-foreground">
        {DEVICE_CONNECTION_LABELS.cardForbidden}
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-[11px] text-muted-foreground">
        {DEVICE_CONNECTION_LABELS.cardError}
      </p>
    );
  }

  if (events.length === 0) return null;

  return (
    <section className="rounded-xl border border-border/60 surface-premium p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Icon
          name="alert-triangle"
          className="w-4 h-4 text-[color:var(--status-critical)]"
        />
        <h4 className="text-[12px] font-semibold text-foreground">
          Telematik / OBD-Verbindung
        </h4>
      </div>
      <ul className="space-y-3">
        {events.map((item) => {
          const isUnplug = item.eventType === 'OBD_DEVICE_UNPLUGGED';
          return (
          <li
            key={item.id}
            className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 space-y-1.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[12px] font-semibold">{tripEvidenceHeadline(item)}</p>
              {item.rentalRelevant && (
                <StatusChip tone="critical" className="text-[10px]">
                  {DEVICE_CONNECTION_LABELS.duringActiveBooking}
                </StatusChip>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Zeitpunkt: {formatDeviceConnectionTimestamp(item.observedAt)}
            </p>
            {isUnplug && (
              <p className="text-[11px] text-muted-foreground">
                Dauer bis Wiederverbindung:{' '}
                {item.recoveryDurationMs != null
                  ? formatDurationMs(item.recoveryDurationMs)
                  : '—'}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <StatusChip tone="info" className="text-[10px]">
                Quelle: {item.source}
              </StatusChip>
              {isUnplug && item.evidenceStatus != null && (
                <StatusChip
                  tone={item.evidenceStatus === 'recovered' ? 'success' : 'warning'}
                  className="text-[10px]"
                >
                  Beweisstatus: {tripEvidenceStatusLabel(item.evidenceStatus)}
                </StatusChip>
              )}
            </div>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
