import { FolderOpen } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { StatusChip } from '../../../components/patterns';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../../components/ui/sheet';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type {
  FleetHealthServiceVehicleCaseItem,
  FleetHealthServiceVehicleTaskItem,
} from './fleet-health-service.view-model';
import { fhs } from './fleet-health-service-shell';

interface FleetHealthServiceCaseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceCase: FleetHealthServiceVehicleCaseItem | null;
  tasks: FleetHealthServiceVehicleTaskItem[];
  onOpenTask?: (taskId: string) => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export function FleetHealthServiceCaseDrawer({
  open,
  onOpenChange,
  serviceCase,
  tasks,
  onOpenTask,
  returnFocusRef,
}: FleetHealthServiceCaseDrawerProps) {
  const { t } = useLanguage();
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !open) {
      returnFocusRef?.current?.focus();
    }
    wasOpen.current = open;
  }, [open, returnFocusRef]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md"
        aria-describedby={serviceCase ? 'fhs-case-drawer-desc' : undefined}
      >
        <SheetHeader className="border-b border-border/40 pb-3">
          <SheetTitle className="flex items-center gap-2 text-left text-[15px]">
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {serviceCase?.title ?? t('fleetHealthService.a11y.serviceCaseDrawer')}
          </SheetTitle>
          {serviceCase ? (
            <SheetDescription id="fhs-case-drawer-desc" className="text-left text-[12px]">
              {t('fleetHealthService.overview.caseSource')}: {serviceCase.sourceLabel}
            </SheetDescription>
          ) : null}
        </SheetHeader>

        {serviceCase ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone="info" className="text-[10px]">
                {serviceCase.statusLabel}
              </StatusChip>
            </div>

            <section aria-labelledby="fhs-case-linked-tasks-heading" className="space-y-2">
              <h3
                id="fhs-case-linked-tasks-heading"
                className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {t('fleetHealthService.a11y.linkedTasks')}
              </h3>
              {tasks.length === 0 ? (
                <p className={cn(fhs.meta, 'text-[11px]')}>
                  {t('fleetHealthService.overview.emptyTitle')}
                </p>
              ) : (
                <ul className="space-y-2">
                  {tasks.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => onOpenTask?.(task.id)}
                        className={cn(
                          fhs.touchTarget,
                          'h-auto w-full justify-between gap-2 rounded-lg border border-border/40 px-3 py-2.5 text-left hover:bg-muted/20',
                        )}
                        aria-label={t('fleetHealthService.a11y.openTask', { title: task.title })}
                      >
                        <span className="min-w-0">
                          <span className="block text-[12px] font-semibold text-foreground">
                            {task.title}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {task.statusLabel}
                            {task.dueLabel ? ` · ${task.dueLabel}` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
