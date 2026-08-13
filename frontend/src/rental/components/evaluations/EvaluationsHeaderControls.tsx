/**
 * E6B global analytics controls. The period selector governs ONLY the E4/E5
 * analytics sections (never E3 Finance, which is fixed MTD). Options come from the
 * canonical E1 period model. No client date arithmetic. Station scope is presented
 * read-only here (server is the scope authority); a richer station picker is E6D.
 */
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { EvaluationsPeriodType } from '../../lib/evaluations/evaluations-request';

const EVALUATIONS_PERIOD_OPTIONS: readonly EvaluationsPeriodType[] = [
  'MTD',
  'MONTH',
  'QUARTER',
  'YEAR',
  'ROLLING_7_DAYS',
  'ROLLING_30_DAYS',
];

export function EvaluationsHeaderControls({
  periodType,
  onPeriodChange,
  stationScopeLabel,
}: {
  periodType: EvaluationsPeriodType;
  onPeriodChange: (p: EvaluationsPeriodType) => void;
  stationScopeLabel: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="evaluations-controls">
      <label className="flex flex-col gap-1 text-[11px] font-medium text-[var(--muted-foreground)]">
        {t('evaluations.period.label')}
        <select
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
          value={periodType}
          onChange={(e) => onPeriodChange(e.target.value as EvaluationsPeriodType)}
          data-testid="evaluations-period-select"
          aria-label={t('evaluations.period.label')}
        >
          {EVALUATIONS_PERIOD_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {t(`evaluations.period.${p}` as TranslationKey)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-1 text-[11px] font-medium text-[var(--muted-foreground)]">
        {t('evaluations.station.scope')}
        <span
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
          data-testid="evaluations-station-scope"
        >
          {stationScopeLabel}
        </span>
      </div>
      <p className="text-[11px] text-[var(--muted-foreground)] max-w-xs">{t('evaluations.period.note')}</p>
    </div>
  );
}
