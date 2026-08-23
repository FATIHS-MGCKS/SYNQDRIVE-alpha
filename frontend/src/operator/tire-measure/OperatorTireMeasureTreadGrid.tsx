import { useLanguage } from '../../i18n/LanguageContext';
import {
  OPERATOR_TIRE_MEASURE_WHEELS,
  operatorTireMeasurePlausibilityMessage,
  operatorTireMeasurePositionLong,
  operatorTireMeasurePositionShort,
} from '../lib/operator-tire-measure-i18n';
import type { OperatorTirePlausibilityWarning, OperatorTireTreadForm } from './operatorTireMeasure.types';
import { TREAD_MAX_MM, TREAD_MIN_MM } from './operatorTireMeasure.utils';

interface Props {
  tread: OperatorTireTreadForm;
  onChange: (tread: OperatorTireTreadForm) => void;
  warnings: OperatorTirePlausibilityWarning[];
}

export function OperatorTireMeasureTreadGrid({ tread, onChange, warnings }: Props) {
  const { t, locale } = useLanguage();

  const set = (key: keyof OperatorTireTreadForm, value: string) => {
    onChange({ ...tread, [key]: value });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('operator.tireMeasure.tread.hint')}</p>

      <div className="relative mx-auto max-w-md rounded-3xl border border-border/60 bg-muted/20 px-4 py-6">
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-px -translate-y-1/2 bg-border/40" />
        <div className="pointer-events-none absolute left-1/2 top-6 bottom-6 w-px -translate-x-1/2 bg-border/40" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-28 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-dashed border-border/50 bg-background/40" />

        <div className="relative grid grid-cols-2 gap-x-6 gap-y-10">
          {OPERATOR_TIRE_MEASURE_WHEELS.map(({ key, position }) => {
            const short = operatorTireMeasurePositionShort(locale, position);
            const long = operatorTireMeasurePositionLong(locale, position);
            return (
              <label key={key} className="block">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-lg font-bold tabular-nums text-foreground">{short}</span>
                  <span className="text-[10px] font-medium text-muted-foreground">{long}</span>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  className="h-14 w-full rounded-2xl border border-border surface-premium px-4 text-center text-xl font-semibold tabular-nums shadow-sm"
                  value={tread[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder="—"
                  aria-label={t('operator.tireMeasure.tread.ariaLabel', { position: long })}
                />
                <p className="mt-1 text-center text-[10px] text-muted-foreground">
                  {t('operator.tireMeasure.tread.unitMm')}
                </p>
              </label>
            );
          })}
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground">
        {t('operator.tireMeasure.tread.plausibilityBounds', {
          min: TREAD_MIN_MM,
          max: TREAD_MAX_MM,
        })}
      </p>

      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w) => (
            <div
              key={w.id}
              className="rounded-xl border border-[color:var(--status-watch)]/35 bg-[color:var(--status-watch)]/[0.06] px-3 py-2 text-xs text-foreground"
            >
              {operatorTireMeasurePlausibilityMessage(locale, w)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
