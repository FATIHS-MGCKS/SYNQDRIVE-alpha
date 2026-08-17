/**
 * E6B Strengths & Weaknesses — renders canonical E4 detection outputs ONLY. No
 * client re-ranking/re-scoring/threshold derivation, no association→causation
 * upgrade. Empty states are qualified: an empty PARTIAL result never claims a full
 * "nothing found" verdict; only a fully AVAILABLE empty result uses strong wording.
 */
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { EvaluationsAsyncResult } from '../../lib/evaluations/evaluations-request';
import type {
  EvaluationsStrengthSection,
  EvaluationsWeaknessSection,
  E4StrengthResult,
  E4WeaknessResult,
} from '../../lib/evaluations/evaluations-canonical.types';
import { EvaluationsSectionShell } from './EvaluationsSectionShell';
import { MetricStatusBadge } from './MetricStatusBadge';

type Kind = 'strengths' | 'weaknesses';

function CoverageNote({ skippedCount }: { skippedCount: number }) {
  const { t } = useLanguage();
  if (skippedCount <= 0) return null;
  return (
    <p className="text-[11px] sq-tone-warning rounded-md px-2 py-1 inline-flex">
      {t('evaluations.coverage.partial')} {t('evaluations.skipped', { count: skippedCount })}
    </p>
  );
}

function FindingRow({ item }: { item: E4StrengthResult | E4WeaknessResult }) {
  const severity = (item as E4WeaknessResult).severity;
  return (
    <li className="rounded-lg border border-[var(--border)] p-2 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-medium break-words">{item.dimension}</p>
        <p className="text-[11px] text-[var(--muted-foreground)]">
          {item.evidence.metricId ?? '—'} · n={item.evidence.sampleSize} · {item.evidenceKind}
        </p>
      </div>
      {severity ? (
        <span className="text-[11px] font-medium sq-tone-neutral rounded-md px-1.5 py-0.5 shrink-0">
          {severity}
        </span>
      ) : null}
    </li>
  );
}

function Panel({
  kind,
  section,
}: {
  kind: Kind;
  section: EvaluationsStrengthSection | EvaluationsWeaknessSection;
}) {
  const { t } = useLanguage();
  const items =
    kind === 'strengths'
      ? (section as EvaluationsStrengthSection).strengths
      : (section as EvaluationsWeaknessSection).weaknesses;
  const isFullyAvailable = section.status === 'AVAILABLE' && section.skippedDimensions.length === 0;
  const emptyKey: TranslationKey =
    kind === 'strengths'
      ? isFullyAvailable
        ? 'evaluations.strengths.emptyAvailable'
        : 'evaluations.strengths.emptyPartial'
      : isFullyAvailable
        ? 'evaluations.weaknesses.emptyAvailable'
        : 'evaluations.weaknesses.emptyPartial';
  const anchorId = kind === 'strengths' ? 'evaluations-section-strengths' : 'evaluations-section-weaknesses';
  return (
    <div id={anchorId} className="scroll-mt-24 flex flex-col gap-2" data-testid={`evaluations-${kind}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold">{t(`evaluations.section.${kind}` as TranslationKey)}</h3>
        <MetricStatusBadge status={section.status} />
      </div>
      <CoverageNote skippedCount={section.skippedDimensions.length} />
      {items.length === 0 ? (
        <p className="text-xs text-[var(--muted-foreground)]" data-testid={`evaluations-${kind}-empty`}>
          {t(emptyKey)}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item, i) => (
            <FindingRow key={`${item.ruleId}-${i}`} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function StrengthWeaknessSection({
  strengths,
  weaknesses,
}: {
  strengths: EvaluationsAsyncResult<EvaluationsStrengthSection>;
  weaknesses: EvaluationsAsyncResult<EvaluationsWeaknessSection>;
}) {
  return (
    <EvaluationsSectionShell
      titleKey="evaluations.section.strengths"
      async={strengths}
      testId="evaluations-sw"
    >
      {(strengthData) => (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Panel kind="strengths" section={strengthData} />
          {weaknesses.phase === 'SETTLED' && weaknesses.result.state === 'AVAILABLE' ? (
            <Panel kind="weaknesses" section={weaknesses.result.data} />
          ) : null}
        </div>
      )}
    </EvaluationsSectionShell>
  );
}
