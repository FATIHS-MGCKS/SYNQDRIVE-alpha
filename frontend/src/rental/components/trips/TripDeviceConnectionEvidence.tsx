import { useEffect, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { api, type TripDeviceConnectionEvidenceItem } from '../../../lib/api';
import { Icon } from '../ui/Icon';
import {
  DEVICE_CONNECTION_LABELS,
  formatDeviceConnectionTimestamp,
  formatDurationMs,
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

  useEffect(() => {
    if (!vehicleId || !tripId) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api.vehicleIntelligence
      .tripDeviceConnectionEvidence(vehicleId, tripId)
      .then((res) => {
        if (!cancelled) setEvents(res.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
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

  if (events.length === 0) return null;

  return (
    <section className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="alert-triangle" className="w-4 h-4 text-[color:var(--status-critical)]" />
        <h4 className="text-[12px] font-semibold text-foreground">
          Telematik / Manipulationshinweis
        </h4>
      </div>
      <ul className="space-y-3">
        {events.map((item) => (
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
            <p className="text-[11px] text-muted-foreground">
              Dauer bis Wiederverbindung:{' '}
              {item.recoveryDurationMs != null
                ? formatDurationMs(item.recoveryDurationMs)
                : '—'}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <StatusChip tone="info" className="text-[10px]">
                Quelle: {item.source}
              </StatusChip>
              <StatusChip
                tone={item.evidenceStatus === 'recovered' ? 'success' : 'warning'}
                className="text-[10px]"
              >
                Beweisstatus: {tripEvidenceStatusLabel(item.evidenceStatus)}
              </StatusChip>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
