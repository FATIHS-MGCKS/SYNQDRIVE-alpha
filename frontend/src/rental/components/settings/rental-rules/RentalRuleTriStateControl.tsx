import { useId } from 'react';
import { cn } from '../../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { RentalRuleFieldScope } from './rental-rule-field-state.util';
import { allowsInherit } from './rental-rule-field-state.util';

type TriStateValue = 'inherit' | 'own' | 'none' | 'required' | 'not_required';

interface RentalRuleTriStateControlProps {
  fieldId: string;
  label: string;
  scope: RentalRuleFieldScope;
  kind: 'scalar' | 'boolean';
  value: TriStateValue;
  onChange: (value: TriStateValue) => void;
  disabled?: boolean;
  className?: string;
}

export function RentalRuleTriStateControl({
  fieldId,
  label,
  scope,
  kind,
  value,
  onChange,
  disabled,
  className,
}: RentalRuleTriStateControlProps) {
  const { t } = useLanguage();
  const groupId = useId();
  const canInherit = allowsInherit(scope);

  const options: Array<{ id: TriStateValue; label: string }> =
    kind === 'boolean'
      ? [
          ...(canInherit
            ? [{ id: 'inherit' as const, label: t('rentalRules.workflow.triState.inherit') }]
            : []),
          { id: 'required', label: t('rentalRules.workflow.triState.required') },
          { id: 'not_required', label: t('rentalRules.workflow.triState.notRequired') },
        ]
      : [
          ...(canInherit
            ? [{ id: 'inherit' as const, label: t('rentalRules.workflow.triState.inherit') }]
            : []),
          { id: 'own', label: t('rentalRules.workflow.triState.ownValue') },
          { id: 'none', label: t('rentalRules.workflow.triState.noRequirement') },
        ];

  return (
    <div
      role="radiogroup"
      aria-labelledby={`${groupId}-label`}
      className={cn('flex flex-wrap gap-1', className)}
    >
      <span id={`${groupId}-label`} className="sr-only">
        {label}
      </span>
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            id={`${fieldId}-${option.id}`}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={cn(
              'min-h-8 rounded-lg border px-2.5 text-[11px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-1',
              selected
                ? 'border-brand/50 bg-brand/10 text-foreground'
                : 'border-border/70 bg-background text-muted-foreground hover:bg-muted/30',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
