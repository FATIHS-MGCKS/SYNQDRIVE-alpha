/**
 * E6B canonical status badge — one consistent status primitive for all Evaluations
 * surfaces. Renders a translated label + tone (icon+text, not color-only). It never
 * conflates canonical E1 metric statuses (AVAILABLE/PARTIAL/STALE/UNAVAILABLE/ERROR/
 * NOT_APPLICABLE) with transport states. Adapted from the historical #792 metric
 * state visual pattern, bound to canonical semantics.
 */
import { useLanguage } from '../../i18n/LanguageContext';
import type { EvaluationsMetricStatus } from '../../lib/evaluations/evaluations-canonical.types';
import { statusLabelKey, statusTone, toneClassName } from './evaluations-presentation';

export function MetricStatusBadge({
  status,
  className = '',
}: {
  status: EvaluationsMetricStatus;
  className?: string;
}) {
  const { t } = useLanguage();
  // AVAILABLE renders no badge (a healthy value speaks for itself); every
  // non-available status is surfaced explicitly so a caveat is never hidden.
  if (status === 'AVAILABLE') return null;
  const tone = statusTone(status);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${toneClassName(tone)} ${className}`}
      data-testid={`evaluations-status-${status}`}
      role="status"
    >
      {t(statusLabelKey(status))}
    </span>
  );
}
