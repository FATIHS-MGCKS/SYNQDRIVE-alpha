import { Building2 } from 'lucide-react';
import type { Vendor } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import type { FleetHealthServiceViewModel } from './fleet-health-service.view-model';
import { FleetHealthServiceCasesPanel } from './FleetHealthServiceCasesPanel';
import { FleetHealthServiceSchedulePanel } from './FleetHealthServiceSchedulePanel';
import { FleetHealthServiceTasksPanel } from './FleetHealthServiceTasksPanel';
import { FleetHealthServiceWorkSubTabBar } from './FleetHealthServiceWorkSubTabBar';
import type { FleetHealthServiceWorkView } from './fleet-health-service-work-area';
import { fhs } from './fleet-health-service-shell';

interface FleetHealthServiceWorkPanelProps {
  activeView: FleetHealthServiceWorkView;
  onViewChange: (view: FleetHealthServiceWorkView) => void;
  vm: FleetHealthServiceViewModel;
  vendors: Vendor[];
  serviceCasesError?: string | null;
  focusTaskId?: string | null;
  onReload?: () => void;
  onOpenGlobalTasks?: (taskId: string) => void;
  onOpenVendors?: () => void;
}

export function FleetHealthServiceWorkPanel({
  activeView,
  onViewChange,
  vm,
  vendors,
  serviceCasesError,
  focusTaskId,
  onReload,
  onOpenGlobalTasks,
  onOpenVendors,
}: FleetHealthServiceWorkPanelProps) {
  return (
    <div className="space-y-3">
      <div className={fhs.panel}>
        <div className={fhs.panelBody}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <FleetHealthServiceWorkSubTabBar activeView={activeView} onViewChange={onViewChange} />
            </div>
            {onOpenVendors ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 self-end sm:self-auto"
                onClick={onOpenVendors}
              >
                <Building2 className="h-3.5 w-3.5" />
                Partner verwalten
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {activeView === 'tasks' ? (
        <FleetHealthServiceTasksPanel
          tasks={vm.allTasks}
          vendors={vendors}
          loading={vm.serviceLoading}
          error={vm.serviceError}
          onReload={onReload}
          onOpenGlobalTasks={onOpenGlobalTasks}
          focusTaskId={focusTaskId}
          compact
        />
      ) : null}

      {activeView === 'service-cases' ? (
        <FleetHealthServiceCasesPanel
          caseLayer={vm.caseLayer}
          loading={vm.serviceLoading}
          error={serviceCasesError}
          onReload={onReload}
        />
      ) : null}

      {activeView === 'due-dates' ? (
        <FleetHealthServiceSchedulePanel
          tasks={vm.allTasks}
          vendors={vendors}
          loading={vm.serviceLoading}
          onSelectTask={onOpenGlobalTasks}
          compact
        />
      ) : null}
    </div>
  );
}
