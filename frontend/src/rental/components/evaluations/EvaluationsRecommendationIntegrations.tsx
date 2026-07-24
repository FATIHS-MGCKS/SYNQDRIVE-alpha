import { ExternalLink, Link2, Loader2 } from 'lucide-react';
import type {
  EvaluationsRecommendationIntegrationAction,
  EvaluationsRecommendationIntegrationDescriptor,
} from '@synq/evaluations-insights/evaluations-recommendation-integrations';
import type { EvaluationsRecommendationRecord } from '@synq/evaluations-insights/evaluations-recommendations';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { useRentalEntityNavigation } from '../../context/RentalEntityNavigationContext';
import type { EvaluationsDataQualityNavigationOptions } from '../../lib/evaluations-data-quality-navigation';
import { executeRecommendationIntegrationNavigation } from '../../lib/evaluations-recommendation-integrations-navigation';
import { useEvaluationsRecommendationIntegrations } from '../../hooks/useEvaluationsRecommendationIntegrations';
import { useRentalOrg } from '../../RentalContext';
import { canManageEvaluationsRecommendations } from '@synq/evaluations-insights/evaluations-recommendations';
import { cn } from '../../../components/ui/utils';
import { EVALUATIONS_TOUCH_TARGET_CLASS } from './evaluations-responsive.constants';

const ACTION_LABELS: Record<EvaluationsRecommendationIntegrationAction, TranslationKey> = {
  CREATE_TASK: 'evaluations.integrations.action.CREATE_TASK',
  OPEN_SERVICE_CASE: 'evaluations.integrations.action.OPEN_SERVICE_CASE',
  OPEN_VEHICLE: 'evaluations.integrations.action.OPEN_VEHICLE',
  OPEN_BOOKING: 'evaluations.integrations.action.OPEN_BOOKING',
  OPEN_CUSTOMER: 'evaluations.integrations.action.OPEN_CUSTOMER',
  OPEN_INVOICE: 'evaluations.integrations.action.OPEN_INVOICE',
  START_WORKFLOW: 'evaluations.integrations.action.START_WORKFLOW',
  ASSIGN_OWNER: 'evaluations.integrations.action.ASSIGN_OWNER',
  CREATE_REMINDER: 'evaluations.integrations.action.CREATE_REMINDER',
  OPEN_SETTINGS_INTEGRATIONS: 'evaluations.integrations.action.OPEN_SETTINGS_INTEGRATIONS',
};

interface EvaluationsRecommendationIntegrationsProps {
  recommendation: EvaluationsRecommendationRecord;
  onNavigate?: (view: string, options?: EvaluationsDataQualityNavigationOptions) => void;
  onOpenTask?: (taskId: string) => void;
  onOpenServiceCase?: (serviceCaseId: string, vehicleId?: string) => void;
}

function integrationDisabled(descriptor: EvaluationsRecommendationIntegrationDescriptor, canManage: boolean) {
  if (descriptor.state === 'UNAVAILABLE') return true;
  if (descriptor.mode === 'execute' && !canManage) return true;
  return descriptor.state === 'DUPLICATE' || descriptor.state === 'FORBIDDEN';
}

export function EvaluationsRecommendationIntegrations({
  recommendation,
  onNavigate,
  onOpenTask,
  onOpenServiceCase,
}: EvaluationsRecommendationIntegrationsProps) {
  const { t } = useLanguage();
  const { orgId, userRole, hasPermission } = useRentalOrg();
  const navigation = useRentalEntityNavigation();
  const canManage = canManageEvaluationsRecommendations({ userRole, hasPermission });
  const { items, loading, error, pendingAction, execute } = useEvaluationsRecommendationIntegrations(
    orgId,
    recommendation.id,
  );

  const handleClick = async (descriptor: EvaluationsRecommendationIntegrationDescriptor) => {
    if (integrationDisabled(descriptor, canManage)) return;

    if (descriptor.mode === 'navigate') {
      executeRecommendationIntegrationNavigation(descriptor, navigation, onNavigate);
      return;
    }

    try {
      const result = await execute(descriptor.action);
      if (result && 'taskId' in result && result.taskId && onOpenTask) {
        onOpenTask(result.taskId);
      }
      if (
        result &&
        'serviceCaseId' in result &&
        result.serviceCaseId &&
        onOpenServiceCase
      ) {
        onOpenServiceCase(result.serviceCaseId, 'vehicleId' in result ? result.vehicleId : undefined);
      }
      if (result && 'action' in result && result.action === 'START_WORKFLOW' && onNavigate) {
        onNavigate('workflow-automation');
      }
    } catch {
      /* surfaced via hook error */
    }
  };

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {t('evaluations.integrations.loading')}
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="eval-rec-integrations-title" data-testid="evaluations-recommendation-integrations">
      <h3
        id="eval-rec-integrations-title"
        className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        <Link2 className="h-3.5 w-3.5" aria-hidden />
        {t('evaluations.integrations.title')}
      </h3>

      {error ? (
        <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-600 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {items.map((descriptor) => {
          const disabled = integrationDisabled(descriptor, canManage);
          const label = t(ACTION_LABELS[descriptor.action]);
          const entityLabel = descriptor.entity?.label ?? descriptor.entity?.entityId;
          const stateHint =
            descriptor.state === 'DUPLICATE'
              ? t('evaluations.integrations.state.duplicate')
              : descriptor.state === 'FORBIDDEN'
                ? t('evaluations.integrations.state.forbidden')
                : descriptor.state === 'UNAVAILABLE'
                  ? t('evaluations.integrations.state.unavailable')
                  : null;

          return (
            <li key={`${descriptor.action}:${descriptor.entity?.entityId ?? 'global'}`}>
              <button
                type="button"
                disabled={disabled || pendingAction === descriptor.action}
                onClick={() => void handleClick(descriptor)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-left text-[11px] font-medium transition-colors',
                  disabled ? 'opacity-50' : 'hover:bg-muted/30',
                  EVALUATIONS_TOUCH_TARGET_CLASS,
                )}
                aria-label={entityLabel ? `${label} — ${entityLabel}` : label}
              >
                <span className="min-w-0">
                  <span className="block text-foreground">{label}</span>
                  {entityLabel ? (
                    <span className="block truncate text-[10px] text-muted-foreground">{entityLabel}</span>
                  ) : null}
                  {stateHint ? (
                    <span className="block text-[10px] text-muted-foreground">{stateHint}</span>
                  ) : null}
                </span>
                {descriptor.mode === 'navigate' ? (
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                ) : pendingAction === descriptor.action ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
