import { cn } from '../../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { RentalRuleSource } from './rental-rules.types';
import { formatRuleValue, labelRuleField, labelRuleSource } from './rental-rules.utils';
import type { RentalRuleFieldKey, RentalRuleFieldScope } from './rental-rule-field-state.util';
import { describeFieldImpact } from './rental-rule-field-state.util';
import { RentalRuleSourceBadge } from '../../shared/rental-requirements-ui';

interface RentalRuleFieldRowProps {
  field: RentalRuleFieldKey;
  scope: RentalRuleFieldScope;
  children: React.ReactNode;
  effectiveValue?: unknown;
  effectiveSource?: RentalRuleSource | null;
  effectiveSourceName?: string | null;
  inheritedValue?: unknown;
  draftValue?: unknown;
  previousStored?: unknown;
  nextStored?: unknown;
  currency?: string;
  className?: string;
}

export function RentalRuleFieldRow({
  field,
  scope,
  children,
  effectiveValue,
  effectiveSource,
  effectiveSourceName,
  inheritedValue,
  draftValue,
  previousStored,
  nextStored,
  currency = 'EUR',
  className,
}: RentalRuleFieldRowProps) {
  const { t } = useLanguage();
  const impact =
    previousStored !== undefined && nextStored !== undefined
      ? describeFieldImpact({
          scope,
          field,
          previousStored,
          nextStored,
          inheritedValue: inheritedValue ?? null,
        })
      : null;

  const impactLabel =
    impact === 'inherits'
      ? t('rentalRules.workflow.impact.inherits')
      : impact === 'cleared'
        ? t('rentalRules.workflow.impact.cleared')
        : impact === 'set'
          ? t('rentalRules.workflow.impact.set')
          : impact === 'changed'
            ? t('rentalRules.workflow.impact.changed')
            : null;

  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-background/50 p-3 space-y-3',
        impact && impact !== 'unchanged' && 'border-l-[3px] border-l-brand/40',
        className,
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-foreground">{labelRuleField(field)}</p>
          {impactLabel ? (
            <p className="mt-0.5 text-[11px] text-brand" aria-live="polite">
              {impactLabel}
            </p>
          ) : null}
        </div>
        {effectiveSource ? (
          <RentalRuleSourceBadge
            source={effectiveSource}
            sourceName={effectiveSourceName ?? null}
            className="shrink-0"
          />
        ) : null}
      </div>

      <dl className="grid gap-2 text-[11px] sm:grid-cols-2">
        <div className="rounded-lg bg-muted/20 px-2.5 py-2">
          <dt className="text-muted-foreground">{t('rentalRules.workflow.meta.effective')}</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {formatRuleValue(field, effectiveValue, currency)}
          </dd>
        </div>
        <div className="rounded-lg bg-muted/20 px-2.5 py-2">
          <dt className="text-muted-foreground">{t('rentalRules.workflow.meta.inherited')}</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {formatRuleValue(field, inheritedValue, currency)}
          </dd>
        </div>
        {draftValue !== undefined ? (
          <div className="rounded-lg bg-muted/20 px-2.5 py-2 sm:col-span-2">
            <dt className="text-muted-foreground">{t('rentalRules.workflow.meta.draft')}</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {formatRuleValue(field, draftValue, currency)}
            </dd>
          </div>
        ) : null}
        {effectiveSource ? (
          <div className="rounded-lg bg-muted/20 px-2.5 py-2 sm:col-span-2">
            <dt className="text-muted-foreground">{t('rentalRules.workflow.meta.source')}</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {labelRuleSource(effectiveSource, effectiveSourceName ?? null)}
            </dd>
          </div>
        ) : null}
      </dl>

      {children}
    </div>
  );
}
