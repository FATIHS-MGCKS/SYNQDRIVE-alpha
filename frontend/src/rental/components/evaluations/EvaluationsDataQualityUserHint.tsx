import { AlertCircle, Info } from 'lucide-react';
import type { EvaluationsDataQualityUserHintModel } from '@synq/evaluations-insights/evaluations-data-quality-panel.contract';
import { useLanguage } from '../../i18n/LanguageContext';
import { cn } from '../../../components/ui/utils';

interface EvaluationsDataQualityUserHintProps {
  hint: EvaluationsDataQualityUserHintModel;
  className?: string;
}

export function EvaluationsDataQualityUserHint({ hint, className }: EvaluationsDataQualityUserHintProps) {
  const { t } = useLanguage();
  if (!hint.visible) return null;

  const toneClass =
    hint.severity === 'critical'
      ? 'sq-tone-critical'
      : hint.severity === 'watch'
        ? 'sq-tone-warning'
        : 'sq-tone-info';

  const Icon = hint.severity === 'info' ? Info : AlertCircle;

  return (
    <div
      role="status"
      className={cn('rounded-xl px-3 py-2.5 flex items-start gap-2 text-xs font-medium', toneClass, className)}
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
      <p>{t(`evaluations.dataQuality.userHint.${hint.messageKey}`)}</p>
    </div>
  );
}
