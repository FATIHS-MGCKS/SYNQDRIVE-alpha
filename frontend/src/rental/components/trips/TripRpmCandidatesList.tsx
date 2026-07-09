import { useEffect, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { api, type RpmCandidateView } from '../../../lib/api';
import { Icon } from '../ui/Icon';
import {
  RPM_WEBHOOK_LABELS,
  formatRpmTimestamp,
  formatRpmValue,
  rpmCandidateHeadline,
  rpmCandidateStatusLabel,
  rpmCandidateStatusTone,
  rpmContextSummary,
  sortRpmCandidates,
} from '../../lib/rpm-webhook-ui';

export interface TripRpmCandidatesListProps {
  vehicleId?: string;
  tripId: string;
}

export function TripRpmCandidatesList({ vehicleId, tripId }: TripRpmCandidatesListProps) {
  const [candidates, setCandidates] = useState<RpmCandidateView[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!vehicleId || !tripId) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api.vehicleIntelligence
      .tripRpmCandidates(vehicleId, tripId)
      .then((res) => {
        if (!cancelled) setCandidates(sortRpmCandidates(res.candidates ?? []));
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
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
        RPM-Webhook-Evidenz wird geladen…
      </div>
    );
  }

  if (candidates.length === 0) return null;

  return (
    <section className="rounded-xl border border-border/60 surface-premium p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="gauge" className="w-4 h-4 text-[color:var(--status-warning)]" />
        <h4 className="text-[12px] font-semibold text-foreground">
          {RPM_WEBHOOK_LABELS.sectionTitle}
        </h4>
      </div>
      <ul className="space-y-3">
        {candidates.map((item) => {
          const contextSummary = rpmContextSummary(item);
          return (
            <li
              key={item.id}
              className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 space-y-1.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[12px] font-semibold">{rpmCandidateHeadline(item)}</p>
                {item.tripId && (
                  <StatusChip tone="info" className="text-[10px]">
                    {RPM_WEBHOOK_LABELS.duringTrip}
                  </StatusChip>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Zeitpunkt: {formatRpmTimestamp(item.observedAt)}
              </p>
              {contextSummary && (
                <p className="text-[11px] text-muted-foreground">{contextSummary}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <StatusChip tone="info" className="text-[10px]">
                  Quelle: {item.source}
                </StatusChip>
                <StatusChip tone={rpmCandidateStatusTone(item.status)} className="text-[10px]">
                  Status: {rpmCandidateStatusLabel(item.status)}
                </StatusChip>
                <StatusChip tone="neutral" className="text-[10px] tabular-nums">
                  Schwellwert: {formatRpmValue(item.threshold)}
                </StatusChip>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
