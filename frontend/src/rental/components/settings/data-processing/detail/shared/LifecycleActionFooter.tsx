import { Loader2 } from 'lucide-react';
import type { LifecycleActionKind } from '../../../../../lib/data-processing-lifecycle.types';
import { LIFECYCLE_ACTION_MATRIX } from '../../../../../lib/data-processing-lifecycle.types';
import { useLanguage } from '../../../../../i18n/LanguageContext';

interface Props {
  actions: LifecycleActionKind[];
  loadingAction?: LifecycleActionKind | null;
  onAction: (action: LifecycleActionKind) => void;
  readOnly?: boolean;
}

export function LifecycleActionFooter({ actions, loadingAction, onAction, readOnly }: Props) {
  const { t } = useLanguage();

  if (readOnly || actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('dataProcessing.detail.actions.aria')}>
      {actions.map((action) => {
        const def = LIFECYCLE_ACTION_MATRIX[action];
        const isCritical = def.tone === 'critical';
        const isLoading = loadingAction === action;

        return (
          <button
            key={action}
            type="button"
            disabled={Boolean(loadingAction)}
            onClick={() => onAction(action)}
            className={`px-3 py-2 text-xs font-semibold rounded-xl disabled:opacity-50 ${
              isCritical
                ? 'border border-destructive/40 text-destructive hover:bg-destructive/10'
                : def.tone === 'watch'
                  ? 'border border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10'
                  : 'sq-3d-btn sq-3d-btn--primary'
            }`}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t(def.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
