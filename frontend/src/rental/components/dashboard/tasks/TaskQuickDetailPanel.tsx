import { memo } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../components/ui/utils';
import type { ApiTask } from '../../../../lib/api';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { VehicleData } from '../../../data/vehicles';
import { resolvePrimaryLinkedObjectLabel } from '../../../lib/task-list.utils';
import { NOTIFICATION_PANEL_TYPO } from '../notifications/notificationPanelTypography';

export interface TaskQuickDetailPanelProps {
  task: ApiTask;
  vehicleById: Map<string, VehicleData>;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onOpenTask: () => void;
}

export const TaskQuickDetailPanel = memo(function TaskQuickDetailPanel({
  task,
  vehicleById,
  t,
  onOpenTask,
}: TaskQuickDetailPanelProps) {
  const vehicle = task.vehicleId ? vehicleById.get(task.vehicleId) : undefined;
  const linked = resolvePrimaryLinkedObjectLabel(task, vehicle
    ? { id: vehicle.id, license: vehicle.license, model: vehicle.model }
    : undefined);
  const linkedLine = [linked.primary, linked.secondary].filter((part) => part && part !== '—').join(' · ');
  const description = task.description?.trim();

  return (
    <div className="border-t border-border/25 px-3 py-3 sm:px-3.5">
      <div className="space-y-2">
        {description ? (
          <p className={cn(NOTIFICATION_PANEL_TYPO.childDescription, 'line-clamp-4 text-pretty')}>
            {description}
          </p>
        ) : null}

        {linkedLine ? (
          <p className={NOTIFICATION_PANEL_TYPO.meta}>
            <span className="text-muted-foreground">{t('dashboardTasksOverview.linkedObject')}: </span>
            <span className="text-foreground/90">{linkedLine}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-9 gap-1.5"
          onClick={onOpenTask}
        >
          {t('dashboardTasksOverview.openTask')}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
});
