import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { StatusChip } from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';

export type MisuseCaseRecord = {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  categoryLabel?: string;
  type: string;
  typeLabel?: string;
  severity: string;
  confidence: string;
  eventCount: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
  recommendedAction?: string | null;
  attributionLabel?: string;
  isPrivateTripSnapshot?: boolean;
  bookingId?: string | null;
  tripId?: string | null;
  evidenceSummary?: Record<string, unknown> | null;
};

type MisuseCasesPanelProps = {
  orgId: string | null | undefined;
  vehicleId?: string;
  tripId?: string;
  bookingId?: string;
  customerId?: string;
  title?: string;
  /** Calm, positive heading shown when there are no cases (e.g. trip detail). */
  emptyTitle?: string;
  /** Calm subline shown when there are no cases. */
  emptyDescription?: string;
  compact?: boolean;
  limit?: number;
};

function severityTone(severity: string): StatusTone {
  switch (severity) {
    case 'CRITICAL':
      return 'critical';
    case 'SEVERE':
      return 'warning';
    case 'WARNING':
      return 'warning';
    default:
      return 'neutral';
  }
}

function confidenceTone(confidence: string): StatusTone {
  switch (confidence) {
    case 'HIGH':
      return 'success';
    case 'MEDIUM':
      return 'info';
    default:
      return 'neutral';
  }
}

function severityLabel(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return 'Kritisch';
    case 'SEVERE':
      return 'Schwer';
    case 'WARNING':
      return 'Auffällig';
    default:
      return 'Hinweis';
  }
}

function confidenceLabel(confidence: string): string {
  switch (confidence) {
    case 'HIGH':
      return 'Hohe Sicherheit';
    case 'MEDIUM':
      return 'Mittlere Sicherheit';
    default:
      return 'Geringe Sicherheit';
  }
}

export function MisuseCasesPanel({
  orgId,
  vehicleId,
  tripId,
  bookingId,
  customerId,
  title = 'Verdachtsfälle',
  emptyTitle,
  emptyDescription,
  compact = false,
  limit = 20,
}: MisuseCasesPanelProps) {
  const [cases, setCases] = useState<MisuseCaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.misuseCases
      .list(orgId, {
        vehicleId,
        tripId,
        bookingId,
        customerId,
        limit,
        page: 1,
      })
      .then((res) => {
        if (cancelled) return;
        setCases((res.data ?? []) as MisuseCaseRecord[]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCases([]);
        setError(err instanceof Error ? err.message : 'Hinweise konnten nicht geladen werden');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, vehicleId, tripId, bookingId, customerId, limit]);

  if (!orgId) return null;

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
        Hinweise werden geladen…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
        {error}
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {title}
        </h3>
        <p className="text-xs font-medium text-foreground">{emptyTitle ?? 'Keine Auffälligkeiten'}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {emptyDescription ?? 'Keine Hinweise für diesen Kontext.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title} ({cases.length})
        </h3>
        <p className="text-[10px] text-muted-foreground mt-1">
          {cases.length === 1 ? '1 Verdacht erkannt' : `${cases.length} Hinweise erkannt`}
        </p>
      </div>
      <div className="divide-y divide-border">
        {cases.map((c) => {
          const showAttribution = c.attributionLabel && !c.isPrivateTripSnapshot;
          const metaParts = [
            c.categoryLabel ?? c.category,
            showAttribution ? c.attributionLabel : null,
            c.eventCount >= 1 ? `${c.eventCount} ${c.eventCount === 1 ? 'Ereignis' : 'Ereignisse'}` : null,
          ].filter(Boolean);
          return (
          <div key={c.id} className={compact ? 'px-3 py-2' : 'px-4 py-3'}>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-foreground">{c.typeLabel ?? c.title}</span>
              <StatusChip tone={severityTone(c.severity)} dot>
                {severityLabel(c.severity)}
              </StatusChip>
              <StatusChip tone={confidenceTone(c.confidence)}>
                {confidenceLabel(c.confidence)}
              </StatusChip>
            </div>
            <div className="text-[10px] text-muted-foreground mb-1">
              {metaParts.join(' · ')}
            </div>
            {c.description && (
              <p className="text-xs text-muted-foreground">{c.description}</p>
            )}
            {c.recommendedAction && !compact && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Empfohlen: {c.recommendedAction}
              </p>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
