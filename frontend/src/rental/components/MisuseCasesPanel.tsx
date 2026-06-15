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

export function MisuseCasesPanel({
  orgId,
  vehicleId,
  tripId,
  bookingId,
  customerId,
  title = 'Prüffälle',
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
        setError(err instanceof Error ? err.message : 'Prüffälle konnten nicht geladen werden');
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
        Prüffälle werden geladen…
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
        <p className="text-xs text-muted-foreground">Keine Prüffälle für diesen Kontext.</p>
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
          Informative Hinweise — keine automatische Sperre oder Workflow-Aktion.
        </p>
      </div>
      <div className="divide-y divide-border">
        {cases.map((c) => (
          <div key={c.id} className={compact ? 'px-3 py-2' : 'px-4 py-3'}>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-foreground">{c.title}</span>
              <StatusChip tone={severityTone(c.severity)} dot>
                {c.severity}
              </StatusChip>
              <StatusChip tone={confidenceTone(c.confidence)}>
                {c.confidence}
              </StatusChip>
            </div>
            <div className="text-[10px] text-muted-foreground mb-1">
              {c.categoryLabel ?? c.category}
              {c.attributionLabel ? ` · ${c.attributionLabel}` : ''}
              {c.eventCount > 1 ? ` · ${c.eventCount} Ereignisse` : ''}
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
        ))}
      </div>
    </div>
  );
}
