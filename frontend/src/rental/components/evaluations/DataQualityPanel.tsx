/**
 * E6C Detailed Data Quality panel — renders the canonical E5 `EvaluationsQualityReport`
 * verbatim. Display-only: NO global quality score, NO average/weakest-dimension
 * derivation, NO status upgrade, NO remediation/recommendation. The five E5 dimension
 * states use their OWN vocabulary (never mapped onto E1 metric status). Pipeline
 * freshness (`section.freshness`) and business-event recency (`section.businessEventRecency`)
 * are rendered as SEPARATE, explicitly-labelled concepts and are never conflated.
 * Lineage `sourceRef` is shown verbatim as an opaque technical reference — never joined
 * to a person/customer/invoice/vehicle and never reconstructed into a record id.
 */
import { useLanguage } from '../../i18n/LanguageContext';
import type { Locale } from '../../i18n/LanguageContext';
import type { EvaluationsAsyncResult } from '../../lib/evaluations/evaluations-request';
import type {
  EvaluationsQualityReport,
  E5SectionQuality,
  E5DimensionState,
  EvaluationsDataCoverage,
  EvaluationsSourceFreshness,
  E5BusinessEventRecency,
  E5LineageRef,
} from '../../lib/evaluations/evaluations-canonical.types';
import { EvaluationsSectionShell } from './EvaluationsSectionShell';
import { MetricStatusBadge } from './MetricStatusBadge';
import {
  E5_QUALITY_DIMENSIONS,
  dimensionLabelKey,
  dimensionStateLabelKey,
  dimensionStateTone,
  freshnessStateLabelKey,
  freshnessStateTone,
  toneClassName,
} from './evaluations-presentation';

function fmtTimestamp(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso; // show verbatim if not parseable
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function DimensionBadge({ state }: { state: E5DimensionState }) {
  const { t } = useLanguage();
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${toneClassName(dimensionStateTone(state))}`}
      data-testid={`evaluations-quality-dimstate-${state}`}
      role="status"
    >
      {t(dimensionStateLabelKey(state))}
    </span>
  );
}

function Unavailable() {
  const { t } = useLanguage();
  return <span className="text-[var(--muted-foreground)]">{t('evaluations.quality.unavailableForScope')}</span>;
}

function PipelineFreshness({ freshness }: { freshness: EvaluationsSourceFreshness | null }) {
  const { t, locale } = useLanguage();
  return (
    <div data-testid="evaluations-quality-pipeline-freshness">
      <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
        {t('evaluations.quality.pipelineFreshness')}
      </p>
      {freshness === null ? (
        <Unavailable />
      ) : (
        <div className="flex flex-col gap-0.5">
          <span
            className={`inline-flex w-fit items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${toneClassName(freshnessStateTone(freshness.state))}`}
            data-testid={`evaluations-quality-freshness-${freshness.state}`}
            role="status"
          >
            {t(freshnessStateLabelKey(freshness.state))}
          </span>
          <span className="text-[11px] text-[var(--muted-foreground)]">
            {t('evaluations.quality.lastImport')}:{' '}
            {fmtTimestamp(freshness.lastSuccessfulImportAt, locale) ?? t('evaluations.value.unavailable')}
          </span>
        </div>
      )}
    </div>
  );
}

function BusinessRecency({ recency }: { recency: E5BusinessEventRecency | null }) {
  const { t, locale } = useLanguage();
  return (
    <div data-testid="evaluations-quality-business-recency">
      <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
        {t('evaluations.quality.businessRecency')}
      </p>
      {/* Business-event activity is NOT pipeline freshness — never rendered as FRESH/STALE. */}
      {recency === null ? (
        <Unavailable />
      ) : (
        <span className="text-[11px] tabular-nums">
          {t('evaluations.quality.newest')}: {fmtTimestamp(recency.newestAt, locale) ?? t('evaluations.value.unavailable')}
          {' · '}
          {t('evaluations.quality.oldest')}: {fmtTimestamp(recency.oldestAt, locale) ?? t('evaluations.value.unavailable')}
        </span>
      )}
    </div>
  );
}

function Coverage({ coverage }: { coverage: EvaluationsDataCoverage | null }) {
  const { t, locale } = useLanguage();
  const unavailable = t('evaluations.value.unavailable');
  return (
    <div data-testid="evaluations-quality-coverage">
      <p className="text-[11px] font-medium text-[var(--muted-foreground)]">{t('evaluations.quality.coverage')}</p>
      {coverage === null ? (
        <Unavailable />
      ) : (
        <span className="text-[11px] tabular-nums">
          {/* ratio is server-supplied; Intl percent is presentation-only. null → unavailable, never 0. */}
          {coverage.ratio !== null
            ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(coverage.ratio)
            : unavailable}
          {' · '}
          {coverage.availableRecords ?? unavailable}/{coverage.expectedRecords ?? unavailable}
        </span>
      )}
    </div>
  );
}

function Lineage({ lineage }: { lineage: readonly E5LineageRef[] }) {
  const { t, locale } = useLanguage();
  if (lineage.length === 0) {
    return (
      <div data-testid="evaluations-quality-lineage">
        <p className="text-[11px] font-medium text-[var(--muted-foreground)]">{t('evaluations.quality.lineage')}</p>
        <Unavailable />
      </div>
    );
  }
  return (
    <details data-testid="evaluations-quality-lineage">
      <summary className="text-[11px] font-medium text-[var(--muted-foreground)] cursor-pointer">
        {t('evaluations.quality.lineage')} ({lineage.length})
      </summary>
      <ul className="flex flex-col gap-1 mt-1">
        {/* Server order preserved; sourceRef shown verbatim as an opaque technical ref. */}
        {lineage.map((ref, i) => (
          <li key={`${ref.sourceCategory}-${i}`} className="text-[11px] text-[var(--muted-foreground)] break-words">
            <span className="font-medium">{ref.sourceCategory}</span>
            {' · '}
            {fmtTimestamp(ref.effectiveTimestamp, locale) ?? t('evaluations.value.unavailable')}
            {' · '}
            <code className="opacity-70">{ref.sourceRef}</code>
            {ref.reason ? ` · ${ref.reason}` : ''}
          </li>
        ))}
      </ul>
    </details>
  );
}

function SectionCard({ section }: { section: E5SectionQuality }) {
  const { t } = useLanguage();
  return (
    <div
      className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 flex flex-col gap-2 min-w-0"
      data-testid={`evaluations-quality-section-${section.section}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-xs font-semibold break-words">{section.section}</h3>
        <MetricStatusBadge status={section.status} />
      </div>

      {/* Five E5 dimensions, each with its own state vocabulary. */}
      <div className="flex flex-wrap gap-1.5">
        {E5_QUALITY_DIMENSIONS.map((dim) => (
          <span
            key={dim}
            className="inline-flex items-center gap-1 text-[11px]"
            data-testid={`evaluations-quality-dimension-${dim}`}
          >
            <span className="text-[var(--muted-foreground)]">{t(dimensionLabelKey(dim))}:</span>
            <DimensionBadge state={section.dimensions[dim]} />
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <PipelineFreshness freshness={section.freshness} />
        <BusinessRecency recency={section.businessEventRecency} />
        <Coverage coverage={section.coverage} />
        <div>
          <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
            {t('evaluations.quality.requiredSources')}
          </p>
          {section.requiredSourceClasses.length > 0 ? (
            <span className="text-[11px] break-words">{section.requiredSourceClasses.join(', ')}</span>
          ) : (
            <Unavailable />
          )}
        </div>
      </div>

      <Lineage lineage={section.lineage} />
      {section.reason ? (
        <p className="text-[11px] text-[var(--muted-foreground)]">{section.reason}</p>
      ) : null}
    </div>
  );
}

export function DataQualityPanel({
  quality,
}: {
  quality: EvaluationsAsyncResult<EvaluationsQualityReport>;
}) {
  const { t } = useLanguage();
  return (
    <EvaluationsSectionShell
      titleKey="evaluations.section.dataQuality"
      async={quality}
      testId="evaluations-data-quality"
    >
      {(report) => (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 flex-wrap" data-testid="evaluations-quality-overall">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{t('evaluations.quality.overall')}</span>
              <MetricStatusBadge status={report.overall.status} />
              <span className="text-[11px] text-[var(--muted-foreground)]">
                {report.overall.complete ? t('evaluations.quality.complete') : t('evaluations.quality.incomplete')}
              </span>
            </div>
            <span className="text-[11px] text-[var(--muted-foreground)]">
              {t('evaluations.quality.calculationVersion')}: <code>{report.calculationVersion}</code>
            </span>
          </div>
          {report.overall.reason ? (
            <p className="text-[11px] text-[var(--muted-foreground)]">{report.overall.reason}</p>
          ) : null}

          {report.sections.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]" data-testid="evaluations-quality-empty">
              {t('evaluations.quality.unavailableForScope')}
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {report.sections.map((s) => (
                <SectionCard key={s.section} section={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </EvaluationsSectionShell>
  );
}
