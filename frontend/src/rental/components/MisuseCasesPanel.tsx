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
import {
  confidenceLabel as contextConfidenceLabel,
  contextClassificationLabel,
  evidenceGradeLabel,
  reasonCodeLabel,
} from './trips/event-context-ui';
import { RENTAL_COPY } from './trips/trips-view-ui';

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
  embedded?: boolean;
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
  embedded,
}: {
  title: string;
  emptyTitle?: string;
  emptyDescription?: string;
  embedded?: boolean;
}) {
  if (embedded) return null;

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

interface ContextEvidence {
  sourceAnchors?: { drivingEventIds?: string[] };
  contextClassifications?: string[];
  evidenceGrade?: string | null;
  confidence?: string | null;
  usedSignals?: string[];
  missingSignals?: string[];
  reasonCodes?: string[];
  windowStart?: string | null;
  windowEnd?: string | null;
  keyValues?: Record<string, number | null | undefined>;
}

function readContextEvidence(
  evidenceSummary: Record<string, unknown> | null | undefined,
): ContextEvidence | null {
  if (!evidenceSummary || typeof evidenceSummary !== 'object') return null;
  const ce = (evidenceSummary as Record<string, unknown>).contextEvidence;
  if (!ce || typeof ce !== 'object') return null;
  return ce as ContextEvidence;
}

function formatWindow(start?: string | null, end?: string | null): string | null {
  if (!start) return null;
  try {
    const s = new Date(start);
    const e = end ? new Date(end) : null;
    const t = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return e ? `${t(s)} – ${t(e)}` : t(s);
  } catch {
    return null;
  }
}

/**
 * Renders the structured context evidence behind a misuse case so the operator
 * sees WHY it was raised — source anchors, evidence grade/confidence, the engine
 * signals used, reason codes and the context window. No "black box".
 */
function MisuseContextEvidence({ evidence }: { evidence: ContextEvidence }) {
  const anchors = evidence.sourceAnchors;
  const driving = anchors?.drivingEventIds?.length ?? 0;
  const window = formatWindow(evidence.windowStart, evidence.windowEnd);
  const kv = evidence.keyValues ?? {};
  const keyChips: Array<{ label: string; value: string }> = [];
  if (typeof kv.maxRpm === 'number') keyChips.push({ label: 'Max Drehzahl', value: `${Math.round(kv.maxRpm)} rpm` });
  if (typeof kv.maxThrottle === 'number') keyChips.push({ label: 'Max Gaspedal', value: `${Math.round(kv.maxThrottle)} %` });
  if (typeof kv.maxEngineLoad === 'number') keyChips.push({ label: 'Max Motorlast', value: `${Math.round(kv.maxEngineLoad)} %` });
  if (typeof kv.coolantAtEvent === 'number') keyChips.push({ label: 'Kühlmittel', value: `${Math.round(kv.coolantAtEvent)} °C` });
  if (typeof kv.preSpeed === 'number' || typeof kv.postSpeed === 'number') {
    keyChips.push({
      label: 'Speed (vor→nach)',
      value: `${typeof kv.preSpeed === 'number' ? Math.round(kv.preSpeed) : '—'} → ${typeof kv.postSpeed === 'number' ? Math.round(kv.postSpeed) : '—'} km/h`,
    });
  }

  return (
    <div className="mt-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          Beweislage
        </span>
        {evidence.evidenceGrade && (
          <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">
            {evidenceGradeLabel(evidence.evidenceGrade)}
          </span>
        )}
        {evidence.confidence && (
          <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">
            {contextConfidenceLabel(evidence.confidence)}
          </span>
        )}
      </div>

      {(evidence.contextClassifications?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          {evidence.contextClassifications!.map((c) => (
            <span
              key={c}
              className="rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-medium text-sky-600 dark:text-status-info"
            >
              {contextClassificationLabel(c)}
            </span>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Anker: {driving > 0 ? `${driving} natives Ereignis${driving === 1 ? '' : 'se'}` : 'keine'}
        {window ? ` · Fenster ${window}` : ''}
      </p>

      {keyChips.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {keyChips.map((c) => (
            <span key={c.label} className="text-[10px] text-muted-foreground tabular-nums">
              {c.label}: <span className="font-medium text-foreground">{c.value}</span>
            </span>
          ))}
        </div>
      )}

      {(evidence.usedSignals?.length ?? 0) > 0 && (
        <p className="text-[9px] text-muted-foreground">
          Signale: {evidence.usedSignals!.join(', ')}
          {(evidence.missingSignals?.length ?? 0) > 0
            ? ` · fehlend: ${evidence.missingSignals!.join(', ')}`
            : ''}
        </p>
      )}

      {(evidence.reasonCodes?.length ?? 0) > 0 && (
        <p className="text-[9px] text-muted-foreground">
          Gründe: {evidence.reasonCodes!.map((r) => reasonCodeLabel(r)).join(' · ')}
        </p>
      )}
    </div>
  );
}

function issueForCase(
  issue: OperationalIssue,
  raw: MisuseCaseRecord | undefined,
  compact: boolean,
  embedded?: boolean,
) {
  const contextEvidence = readContextEvidence(raw?.evidenceSummary);
  const severity = raw?.severity ?? (issue.severity === 'critical' ? 'CRITICAL' : issue.severity === 'warning' ? 'WARNING' : 'INFO');
  const confidence = raw?.confidence ?? 'MEDIUM';
  return (
    <div
      key={issue.id}
      className={
        embedded
          ? 'rounded-xl border border-border/60 bg-card/50 px-3 py-2.5'
          : compact
            ? 'px-3 py-2'
            : 'px-4 py-3'
      }
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-foreground">{issue.title}</span>
        <StatusChip tone={severityTone(severity)} dot className="text-[9px]">
          {severityLabel(severity)}
        </StatusChip>
        {(confidence === 'LOW' || confidence === 'INSUFFICIENT') && (
          <StatusChip tone={confidenceTone(confidence)} className="text-[9px]">
            {confidenceLabel(confidence)}
          </StatusChip>
        )}
      </div>
      {issue.subtitle && (
        <p className="text-[10px] leading-snug text-muted-foreground">{issue.subtitle}</p>
      )}
      {issue.evidence?.length ? (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
          {issue.evidence.map((evidence) => (
            <div key={`${evidence.label}:${evidence.value}:${evidence.unit ?? ''}`} className="min-w-0">
              <p className="text-[9px] font-medium text-muted-foreground">{evidence.label}</p>
              <p className="text-[10px] font-semibold tabular-nums text-foreground break-words">
                {formatOperationalIssueEvidence(evidence)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {contextEvidence && <MisuseContextEvidence evidence={contextEvidence} />}
      {issue.recommendedAction && !compact && !embedded && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Empfohlen: {sanitizeUserFacingIssueText(issue.recommendedAction)}
        </p>
      )}
      {embedded && (
        <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
          {RENTAL_COPY.misuseReviewDisclaimer}
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
  title = 'Prüfhinweise',
  emptyTitle,
  emptyDescription,
  compact = false,
  embedded = false,
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
    return (
      <EmptyMisuseState
        title={title}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        embedded={embedded}
      />
    );
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
    return (
      <EmptyMisuseState
        title={title}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        embedded={embedded}
      />
    );
  }

  const issues = normalizedCases(cases, { vehicleId, tripId, bookingId, customerId });
  if (issues.length === 0) {
    return (
      <EmptyMisuseState
        title={title}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        embedded={embedded}
      />
    );
  }
  const rawById = new Map(cases.map((c) => [c.id, c]));
  const criticalCount = issues.filter((issue) => issue.severity === 'critical' || issue.domain === 'damage').length;

  return (
    <div
      className={
        embedded
          ? 'space-y-2'
          : 'rounded-lg border border-border bg-card'
      }
    >
      <div className={embedded ? 'space-y-0.5' : 'border-b border-border px-4 py-3'}>
        <h3
          className={
            embedded
              ? 'text-[12px] font-semibold text-foreground'
              : 'text-xs font-semibold uppercase tracking-wider text-muted-foreground'
          }
        >
          {title}
        </h3>
        <p className="text-[10px] text-muted-foreground">
          {issues.length === 1 ? '1 Prüfhinweis' : `${issues.length} Prüfhinweise`}
          {criticalCount > 0 ? ` · ${criticalCount} mit Schadensbezug` : ''}
        </p>
      </div>
      <div className={embedded ? 'space-y-2' : 'divide-y divide-border'}>
        {issues.map((issue) =>
          issueForCase(issue, rawById.get(issue.primarySource.sourceId ?? ''), compact, embedded),
        )}
      </div>
    </div>
  );
}
