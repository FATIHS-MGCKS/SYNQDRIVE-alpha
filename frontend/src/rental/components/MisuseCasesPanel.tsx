import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { StatusChip } from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';
import {
  formatOperationalIssueEvidence,
  normalizeOperationalIssues,
  sanitizeUserFacingIssueText,
  type OperationalIssue,
} from '../lib/operational-issues';

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
  vehicleId?: string | null;
  bookingId?: string | null;
  tripId?: string | null;
  customerId?: string | null;
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

function EmptyMisuseState({
  title,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      <p className="text-xs font-medium text-foreground">{emptyTitle ?? 'Unauffällige Fahrt'}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {emptyDescription ?? 'Keine Hinweise auf Missbrauch oder Schaden für diese Fahrt.'}
      </p>
    </div>
  );
}

function normalizedCases(
  cases: MisuseCaseRecord[],
  context: Pick<MisuseCasesPanelProps, 'vehicleId' | 'tripId' | 'bookingId' | 'customerId'>,
): OperationalIssue[] {
  return normalizeOperationalIssues({
    misuseCases: cases.map((c) => ({
      ...c,
      vehicleId: c.vehicleId ?? context.vehicleId,
      tripId: c.tripId ?? context.tripId,
      bookingId: c.bookingId ?? context.bookingId,
      customerId: c.customerId ?? context.customerId,
    })),
  }).filter((issue) => issue.domain === 'misuse' || issue.domain === 'damage');
}

function issueForCase(
  issue: OperationalIssue,
  raw: MisuseCaseRecord | undefined,
  compact: boolean,
) {
  const severity = raw?.severity ?? (issue.severity === 'critical' ? 'CRITICAL' : issue.severity === 'warning' ? 'WARNING' : 'INFO');
  const confidence = raw?.confidence ?? 'MEDIUM';
  return (
    <div key={issue.id} className={compact ? 'px-3 py-2' : 'px-4 py-3'}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-foreground">{issue.title}</span>
        <StatusChip tone={severityTone(severity)} dot>
          {severityLabel(severity)}
        </StatusChip>
        <StatusChip tone={confidenceTone(confidence)}>
          {confidenceLabel(confidence)}
        </StatusChip>
      </div>
      {issue.subtitle && (
        <p className="text-xs text-muted-foreground">{issue.subtitle}</p>
      )}
      {issue.evidence?.length ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {issue.evidence.map((evidence) => (
            <span key={`${evidence.label}:${evidence.value}:${evidence.unit ?? ''}`} className="text-[10px] text-muted-foreground tabular-nums">
              {formatOperationalIssueEvidence(evidence)}
            </span>
          ))}
        </div>
      ) : null}
      {issue.recommendedAction && !compact && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Empfohlen: {sanitizeUserFacingIssueText(issue.recommendedAction)}
        </p>
      )}
    </div>
  );
}

export function MisuseCasesPanel({
  orgId,
  vehicleId,
  tripId,
  bookingId,
  customerId,
  title = 'Missbrauchs-/Schadensverdacht',
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
    void Promise.resolve().then(() => {
      if (cancelled) return;
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
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, vehicleId, tripId, bookingId, customerId, limit]);

  if (!orgId) {
    return <EmptyMisuseState title={title} emptyTitle={emptyTitle} emptyDescription={emptyDescription} />;
  }

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
    return <EmptyMisuseState title={title} emptyTitle={emptyTitle} emptyDescription={emptyDescription} />;
  }

  const issues = normalizedCases(cases, { vehicleId, tripId, bookingId, customerId });
  if (issues.length === 0) {
    return <EmptyMisuseState title={title} emptyTitle={emptyTitle} emptyDescription={emptyDescription} />;
  }
  const rawById = new Map(cases.map((c) => [c.id, c]));
  const criticalCount = issues.filter((issue) => issue.severity === 'critical' || issue.domain === 'damage').length;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        <p className="text-[10px] text-muted-foreground mt-1">
          {issues.length === 1 ? '1 Verdacht erkannt' : `${issues.length} Hinweise erkannt`}
          {criticalCount > 0 ? ` · ${criticalCount} mit Schadensbezug` : ''}
        </p>
      </div>
      <div className="divide-y divide-border">
        {issues.map((issue) => issueForCase(issue, rawById.get(issue.primarySource.sourceId ?? ''), compact))}
      </div>
    </div>
  );
}
