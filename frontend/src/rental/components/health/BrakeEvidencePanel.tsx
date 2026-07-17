import type { BrakeHealthSummary } from '../../lib/api';
import { StatusDot } from '../../components/patterns';
import {
  brakeActiveDataQuality,
  brakeActiveSafety,
  brakeComponentEvidenceClassLabel,
  brakeComponentLabel,
  brakeComponentLines,
  brakeComponentRemainingLabel,
  brakeComponentValueLabel,
  brakeOverviewLabel,
  brakeRemainingKmLabel,
  brakeStructuredActions,
  brakeUiStatusLabel,
  type BrakeUiLocale,
} from '../lib/brake-health-evidence-ui';
import { segmentFromHealthState } from '../lib/health-segment-display';

export interface BrakeEvidencePanelProps {
  summary: BrakeHealthSummary | null | undefined;
  locale?: BrakeUiLocale;
  compact?: boolean;
  showActions?: boolean;
  onAction?: (code: string) => void;
  className?: string;
}

function formatDate(iso: string | null | undefined, locale: BrakeUiLocale): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB');
  } catch {
    return '—';
  }
}

function conditionTone(condition: string): string {
  switch (condition) {
    case 'GOOD':
      return 'sq-chip-success';
    case 'WATCH':
      return 'sq-chip-watch';
    case 'WARNING':
      return 'sq-chip-warning';
    case 'CRITICAL':
      return 'sq-chip-critical';
    default:
      return 'sq-chip-nodata';
  }
}

export function BrakeEvidencePanel({
  summary,
  locale = 'de',
  compact = false,
  showActions = true,
  onAction,
  className = '',
}: BrakeEvidencePanelProps) {
  const components = brakeComponentLines(summary);
  const dataQuality = brakeActiveDataQuality(summary, locale);
  const safety = brakeActiveSafety(summary, locale);
  const actions = brakeStructuredActions(summary, locale);
  const overview = brakeOverviewLabel(summary, locale);
  const statusLabel = brakeUiStatusLabel(summary, locale);
  const remaining = brakeRemainingKmLabel(summary, locale);
  const cond = summary?.overallCondition ?? 'UNKNOWN';
  const segment = segmentFromHealthState(cond);

  if (!summary) {
    return (
      <div className={`rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground ${className}`}>
        {locale === 'de' ? 'Keine Bremsdaten verfügbar.' : 'No brake data available.'}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`} data-testid="brake-evidence-panel">
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${conditionTone(cond)}`}>
            {statusLabel}
          </span>
          <span className="text-xs font-medium text-foreground">{overview}</span>
        </div>
        <p className="text-sm font-semibold text-foreground tabular-nums">
          {locale === 'de' ? 'Restlaufzeit' : 'Remaining life'}: {remaining}
        </p>
        {!compact && summary.evidencePresentation?.modelVersion && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {locale === 'de' ? 'Modell' : 'Model'}: {summary.evidencePresentation.modelVersion}
          </p>
        )}
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          {locale === 'de' ? 'Komponenten' : 'Components'}
        </h3>
        <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {components.map((line) => (
            <article
              key={line.component}
              className={`rounded-xl border p-3 ${
                line.isLimiting ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-muted/20'
              }`}
              aria-label={brakeComponentLabel(line, locale)}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-[11px] font-semibold text-foreground">
                  {brakeComponentLabel(line, locale)}
                  {line.isLimiting && (
                    <span className="ml-1 text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      ({locale === 'de' ? 'limitierend' : 'limiting'})
                    </span>
                  )}
                </p>
                <StatusDot tone={segment.tone} aria-hidden />
              </div>
              <p className="text-sm font-bold text-foreground">{brakeComponentValueLabel(line, locale)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {brakeComponentEvidenceClassLabel(line, locale)}
                {' · '}
                {locale === 'de' ? line.sourceLabelDe : line.sourceLabelEn}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {locale === 'de' ? 'Rest' : 'Remaining'}: {brakeComponentRemainingLabel(line, locale)}
              </p>
              {!compact && (
                <dl className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
                  <div className="flex justify-between gap-2">
                    <dt>{locale === 'de' ? 'Mindestdicke' : 'Min thickness'}</dt>
                    <dd className="text-foreground font-medium tabular-nums">
                      {line.minimumThicknessMm != null ? `${line.minimumThicknessMm} mm` : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>{locale === 'de' ? 'Letzte Messung' : 'Last measurement'}</dt>
                    <dd className="text-foreground">
                      {line.lastMeasurementMm != null
                        ? `${line.lastMeasurementMm.toFixed(1)} mm (${formatDate(line.lastMeasurementAt, locale)})`
                        : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>{locale === 'de' ? 'Letzte Installation' : 'Last installation'}</dt>
                    <dd className="text-foreground">{formatDate(line.lastInstallationAt, locale)}</dd>
                  </div>
                </dl>
              )}
            </article>
          ))}
        </div>
      </div>

      {dataQuality.length > 0 && (
        <section aria-label={locale === 'de' ? 'Datenqualität' : 'Data quality'}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            {locale === 'de' ? 'Datenqualität' : 'Data quality'}
          </h3>
          <ul className="space-y-1.5">
            {dataQuality.map((item) => (
              <li key={item.code} className="rounded-lg sq-tone-info px-3 py-2 text-[11px] text-foreground">
                <span className="font-semibold">{item.label}</span>
                {item.detail && <p className="text-muted-foreground mt-0.5">{item.detail}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {safety.length > 0 && (
        <section aria-label={locale === 'de' ? 'Sicherheit' : 'Safety'}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            {locale === 'de' ? 'Sicherheit' : 'Safety'}
          </h3>
          <ul className="space-y-1.5">
            {safety.map((item) => (
              <li
                key={item.code}
                className={`rounded-lg px-3 py-2 text-[11px] ${
                  item.severity === 'critical'
                    ? 'sq-tone-critical'
                    : item.severity === 'warning'
                      ? 'sq-tone-watch'
                      : 'sq-tone-info'
                }`}
              >
                <span className="font-semibold text-foreground">{item.label}</span>
                {item.detail && <p className="text-muted-foreground mt-0.5">{item.detail}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {showActions && actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={action.code}
              type="button"
              onClick={() => onAction?.(action.code)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold sq-tone-ai hover:opacity-90 transition-opacity"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
