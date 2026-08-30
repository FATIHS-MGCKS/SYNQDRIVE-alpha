import { useEffect, useState } from 'react';
import { api, type MisuseCaseRecord } from '../../lib/api';
import { StatusChip } from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import type { SupportedLocale } from '../../i18n/locales';
import {
  formatOperationalIssueEvidence,
  normalizeOperationalIssues,
  sanitizeUserFacingIssueText,
  type OperationalIssue,
} from '../lib/operational-issues';
import type { TripEvidenceCase, TripEvidenceLevel } from '../../lib/api';
import {
  REVIEW_HINT_DEFAULT,
  formatEvidenceMeasurements,
  resolveEvidenceCardTitle,
} from './trips/behavior-ui.utils';
import {
  misuseCaseDecisionHint,
  misuseCaseStatusLabel,
} from '../lib/misuse-case-lifecycle.ui';
import {
  resolveContextClassificationLabel,
  resolveContextConfidenceLabel,
  resolveEvidenceConfidenceLabel,
  resolveEvidenceGradeLabel,
  resolveEvidenceLevelLabel,
  resolveEvidenceSourceLabel,
  resolveMisuseConfidenceLabel,
  resolveMisuseSeverityLabel,
  type MisuseStressTranslate,
} from '../lib/rental-misuse-stress-i18n';

export type { MisuseCaseRecord };

type MisuseCasesPanelProps = {
  orgId: string | null | undefined;
  vehicleId?: string;
  tripId?: string;
  bookingId?: string;
  customerId?: string;
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  compact?: boolean;
  embedded?: boolean;
  limit?: number;
};

type LoadErrorState = 'load_failed' | null;

function evidenceLevelTone(level: TripEvidenceLevel): StatusTone {
  switch (level) {
    case 'CRITICAL_DAMAGE_RISK':
      return 'critical';
    case 'DAMAGE_RISK':
    case 'MISUSE_SUSPECTED':
      return 'warning';
    case 'CHECK_RECOMMENDED':
      return 'info';
    default:
      return 'neutral';
  }
}

function readEvidenceCase(raw: MisuseCaseRecord | undefined): TripEvidenceCase | null {
  if (raw?.evidenceCase) return raw.evidenceCase;
  const summary = raw?.evidenceSummary;
  if (!summary || typeof summary !== 'object') return null;
  const candidate = (summary as Record<string, unknown>).evidenceCase;
  if (!candidate || typeof candidate !== 'object') return null;
  return candidate as TripEvidenceCase;
}

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

function EmptyMisuseState({
  title,
  emptyTitle,
  emptyDescription,
  embedded,
  t,
}: {
  title: string;
  emptyTitle?: string;
  emptyDescription?: string;
  embedded?: boolean;
  t: MisuseStressTranslate;
}) {
  if (embedded) return null;

  return (
    <div className="rounded-lg border border-border surface-premium p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      <p className="text-xs font-medium text-foreground">
        {emptyTitle ?? t('misuseStress.empty.calmTitle')}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {emptyDescription ?? t('misuseStress.empty.calmDescription')}
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

function MisuseEvidenceDetails({
  evidenceCase,
  contextEvidence,
  locale,
  t,
}: {
  evidenceCase: TripEvidenceCase | null;
  contextEvidence: ContextEvidence | null;
  locale: SupportedLocale;
  t: MisuseStressTranslate;
}) {
  const measurementRows = evidenceCase ? formatEvidenceMeasurements(evidenceCase.measurements) : [];
  const usedSignals = contextEvidence?.usedSignals ?? [];

  if (!evidenceCase && !contextEvidence) return null;

  const nativeEventCount = contextEvidence?.sourceAnchors?.drivingEventIds?.length ?? 0;
  const nativeEventLabel =
    nativeEventCount === 1
      ? t('misuseStress.evidence.nativeEventOne')
      : nativeEventCount > 1
        ? t('misuseStress.evidence.nativeEventMany', { count: nativeEventCount })
        : t('misuseStress.evidence.none');
  const windowLabel = formatWindow(contextEvidence?.windowStart, contextEvidence?.windowEnd);

  return (
    <div className="mt-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('misuseStress.evidence.sectionTitle')}
        </span>
        {evidenceCase && (
          <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">
            {resolveEvidenceLevelLabel(locale, evidenceCase.evidenceLevel)}
          </span>
        )}
        {contextEvidence?.evidenceGrade && (
          <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">
            {resolveEvidenceGradeLabel(locale, contextEvidence.evidenceGrade)}
          </span>
        )}
        {(evidenceCase?.confidence || contextEvidence?.confidence) && (
          <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">
            {evidenceCase
              ? resolveEvidenceConfidenceLabel(locale, evidenceCase.confidence)
              : resolveContextConfidenceLabel(locale, contextEvidence?.confidence ?? '')}
          </span>
        )}
      </div>

      {(evidenceCase?.reasons.length ?? 0) > 0 && (
        <p className="text-[9px] text-muted-foreground">
          {t('misuseStress.evidence.reasonsPrefix')}{' '}
          {evidenceCase!.reasons.slice(0, 4).join(' · ')}
        </p>
      )}

      {measurementRows.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {measurementRows.map((row) => (
            <span key={row.label} className="text-[10px] text-muted-foreground tabular-nums">
              {row.label}: <span className="font-medium text-foreground">{row.value}</span>
            </span>
          ))}
        </div>
      )}

      {usedSignals.length > 0 && (
        <p className="text-[9px] text-muted-foreground">
          {t('misuseStress.evidence.signalsPrefix')} {usedSignals.join(', ')}
          {(contextEvidence?.missingSignals?.length ?? 0) > 0
            ? `${t('misuseStress.evidence.missingSignals')} ${contextEvidence!.missingSignals!.join(', ')}`
            : ''}
        </p>
      )}

      {contextEvidence && (
        <>
          {(contextEvidence.contextClassifications?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {contextEvidence.contextClassifications!.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-medium text-sky-600 dark:text-status-info"
                >
                  {resolveContextClassificationLabel(locale, c)}
                </span>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            {t('misuseStress.evidence.anchorsPrefix')} {nativeEventLabel}
            {windowLabel ? `${t('misuseStress.evidence.windowPrefix')}${windowLabel}` : ''}
          </p>
        </>
      )}

      {evidenceCase?.source && (
        <p className="text-[9px] text-muted-foreground">
          {t('misuseStress.evidence.sourcePrefix')}{' '}
          {resolveEvidenceSourceLabel(locale, evidenceCase.source)}
        </p>
      )}
    </div>
  );
}

function issueForCase(
  issue: OperationalIssue,
  raw: MisuseCaseRecord | undefined,
  compact: boolean,
  embedded: boolean | undefined,
  locale: SupportedLocale,
  t: MisuseStressTranslate,
) {
  const severity =
    raw?.severity ??
    (issue.severity === 'critical' ? 'CRITICAL' : issue.severity === 'warning' ? 'WARNING' : 'INFO');
  const confidence = raw?.confidence ?? 'MEDIUM';
  const contextEvidence = readContextEvidence(raw?.evidenceSummary);
  const evidenceCase = readEvidenceCase(raw);
  const cardTitle = evidenceCase ? resolveEvidenceCardTitle(evidenceCase) : issue.title;
  const showReviewDisclaimer =
    evidenceCase?.requiresHumanReview !== false || !evidenceCase;
  const lifecycleStatus = raw?.lifecycle?.status ?? raw?.status;
  const lifecycleHint = misuseCaseDecisionHint(t, raw?.lifecycle?.decisionEligibility);
  const resolvedStatusLabel = misuseCaseStatusLabel(t, lifecycleStatus);

  return (
    <div
      key={issue.id}
      className={
        embedded
          ? 'rounded-xl border border-border/60 surface-premium px-3 py-2.5'
          : compact
            ? 'px-3 py-2'
            : 'px-4 py-3'
      }
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-foreground">{cardTitle}</span>
        {evidenceCase ? (
          <StatusChip tone={evidenceLevelTone(evidenceCase.evidenceLevel)} dot className="text-[9px]">
            {resolveEvidenceLevelLabel(locale, evidenceCase.evidenceLevel)}
          </StatusChip>
        ) : (
          <StatusChip tone={severityTone(severity)} dot className="text-[9px]">
            {resolveMisuseSeverityLabel(t, severity)}
          </StatusChip>
        )}
        {(evidenceCase?.confidence === 'LOW' || confidence === 'LOW' || confidence === 'INSUFFICIENT') && (
          <StatusChip tone={confidenceTone(confidence)} className="text-[9px]">
            {evidenceCase
              ? resolveEvidenceConfidenceLabel(locale, evidenceCase.confidence)
              : resolveMisuseConfidenceLabel(t, confidence)}
          </StatusChip>
        )}
        {lifecycleStatus && resolvedStatusLabel && (
          <StatusChip tone="neutral" className="text-[9px]">
            {resolvedStatusLabel}
          </StatusChip>
        )}
      </div>
      {(evidenceCase?.explanation || issue.subtitle) && (
        <p className="text-[10px] leading-snug text-muted-foreground">
          {sanitizeUserFacingIssueText(evidenceCase?.explanation ?? issue.subtitle ?? '')}
        </p>
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
      {(evidenceCase || contextEvidence) && (
        <MisuseEvidenceDetails
          evidenceCase={evidenceCase}
          contextEvidence={contextEvidence}
          locale={locale}
          t={t}
        />
      )}
      {showReviewDisclaimer && (
        <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
          {lifecycleHint ?? t('misuseStress.reviewDisclaimer') ?? REVIEW_HINT_DEFAULT}
        </p>
      )}
      {issue.recommendedAction && !compact && !embedded && (
        <p className="text-[10px] text-muted-foreground mt-1">
          {t('misuseStress.recommendedPrefix')}{' '}
          {sanitizeUserFacingIssueText(issue.recommendedAction)}
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
  title,
  emptyTitle,
  emptyDescription,
  compact = false,
  embedded = false,
  limit = 20,
}: MisuseCasesPanelProps) {
  const { t, locale } = useLanguage();
  const resolvedTitle = title ?? t('misuseStress.panel.defaultTitle');
  const [cases, setCases] = useState<MisuseCaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LoadErrorState | string | null>(null);

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
          setError(err instanceof Error ? err.message : 'load_failed');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, vehicleId, tripId, bookingId, customerId, limit]);

  const renderError = () => {
    if (!error) return null;
    if (error === 'load_failed') return t('misuseStress.error.loadFailed');
    return error;
  };

  if (!orgId) {
    return (
      <EmptyMisuseState
        title={resolvedTitle}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        embedded={embedded}
        t={t}
      />
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border surface-premium p-4 text-xs text-muted-foreground">
        {t('misuseStress.panel.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border surface-premium p-4 text-xs text-muted-foreground">
        {renderError()}
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <EmptyMisuseState
        title={resolvedTitle}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        embedded={embedded}
        t={t}
      />
    );
  }

  const issues = normalizedCases(cases, { vehicleId, tripId, bookingId, customerId });
  if (issues.length === 0) {
    return (
      <EmptyMisuseState
        title={resolvedTitle}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        embedded={embedded}
        t={t}
      />
    );
  }
  const rawById = new Map(cases.map((c) => [c.id, c]));
  const criticalCount = issues.filter((issue) => issue.severity === 'critical' || issue.domain === 'damage').length;
  const summaryLine =
    issues.length === 1
      ? t('misuseStress.summary.countOne')
      : t('misuseStress.summary.countMany', { count: issues.length });

  return (
    <div
      className={
        embedded
          ? 'space-y-2'
          : 'rounded-lg border border-border surface-premium'
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
          {resolvedTitle}
        </h3>
        <p className="text-[10px] text-muted-foreground">
          {summaryLine}
          {criticalCount > 0
            ? t('misuseStress.summary.damageRelated', { count: criticalCount })
            : ''}
        </p>
      </div>
      <div className={embedded ? 'space-y-2' : 'divide-y divide-border'}>
        {issues.map((issue) =>
          issueForCase(issue, rawById.get(issue.primarySource.sourceId ?? ''), compact, embedded, locale, t),
        )}
      </div>
    </div>
  );
}
