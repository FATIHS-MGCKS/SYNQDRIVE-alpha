/**
 * E6B section shell: consistent card + heading + canonical section status badge +
 * transport-aware body states (LOADING / IDLE / NOT_FOUND / UNAUTHORIZED / ERROR).
 * Sections render their canonical content via `children` only when SETTLED+AVAILABLE.
 * Loading/idle/error/unavailable are visually distinct — never collapsed, never a
 * false zero, never a legacy fallback.
 */
import type { ReactNode } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type {
  EvaluationsAsyncResult,
  EvaluationsCanonicalResult,
} from '../../lib/evaluations/evaluations-request';
import { MetricStatusBadge } from './MetricStatusBadge';
import type { EvaluationsMetricStatus } from '../../lib/evaluations/evaluations-canonical.types';

function TransportState({ result }: { result: EvaluationsCanonicalResult<unknown> }) {
  const { t } = useLanguage();
  const key: TranslationKey =
    result.state === 'UNAUTHORIZED'
      ? 'evaluations.availability.unauthorized'
      : result.state === 'NOT_FOUND' || result.state === 'FEATURE_DISABLED'
        ? 'evaluations.availability.notFound'
        : 'evaluations.availability.error';
  return (
    <p className="text-sm text-[var(--muted-foreground)]" role="status">
      {t(key)}
    </p>
  );
}

export function EvaluationsSectionShell<T>({
  titleKey,
  async,
  sectionStatus,
  children,
  headerExtra,
  testId,
}: {
  titleKey: TranslationKey;
  async: EvaluationsAsyncResult<T>;
  /** When the payload carries its own canonical section status, show its badge. */
  sectionStatus?: EvaluationsMetricStatus;
  children: (data: T) => ReactNode;
  headerExtra?: ReactNode;
  testId?: string;
}) {
  const { t } = useLanguage();
  return (
    <section
      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 flex flex-col gap-3"
      aria-labelledby={`${testId ?? titleKey}-heading`}
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 id={`${testId ?? titleKey}-heading`} className="text-sm font-semibold">
          {t(titleKey)}
        </h2>
        <div className="flex items-center gap-2">
          {sectionStatus ? <MetricStatusBadge status={sectionStatus} /> : null}
          {headerExtra}
        </div>
      </div>

      {async.phase === 'IDLE' ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t('evaluations.availability.idle')}</p>
      ) : async.phase === 'LOADING' ? (
        <div
          className="h-16 rounded-xl bg-[var(--muted)] animate-pulse"
          aria-label={t('evaluations.availability.loading')}
          role="status"
        />
      ) : async.result.state === 'AVAILABLE' ? (
        children(async.result.data)
      ) : (
        <TransportState result={async.result} />
      )}
    </section>
  );
}
