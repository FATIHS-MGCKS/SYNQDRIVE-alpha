import { Building2 } from 'lucide-react';
import type { ApiServiceCase, ApiTask, Vendor } from '../../../lib/api';
import type { ServiceTaskAdvancedFilters } from '../../lib/service-task-filters';
import { Button } from '../../../components/ui/button';
import type { ServiceTaskFilter } from '../service-center/service-center.types';
import { FleetHealthServiceCasesPanel } from './FleetHealthServiceCasesPanel';
import { FleetHealthServiceSchedulePanel } from './FleetHealthServiceSchedulePanel';
import { FleetHealthServiceTasksPanel } from './FleetHealthServiceTasksPanel';
import { FleetHealthServiceWorkSubTabBar } from './FleetHealthServiceWorkSubTabBar';
import type { FleetHealthServiceWorkView } from './fleet-health-service-work-area';
import { fhs } from './fleet-health-service-shell';

interface FleetHealthServiceWorkPanelProps {
  activeView: FleetHealthServiceWorkView;
  onViewChange: (view: FleetHealthServiceWorkView) => void;
  vendors: Vendor[];
  tasks: ApiTask[];
  tasksLoading?: boolean;
  tasksError?: string | null;
  taskFilter: ServiceTaskFilter;
  onTaskFilterChange: (filter: ServiceTaskFilter) => void;
  initialAdvancedFilters?: Partial<ServiceTaskAdvancedFilters>;
  serviceCases: ApiServiceCase[];
  serviceCasesDataReady: boolean;
  serviceCasesError?: string | null;
  serviceCasesLoading?: boolean;
  focusTaskId?: string | null;
  onReload?: () => void;
  onOpenGlobalTasks?: (taskId: string) => void;
  onOpenVendors?: () => void;
}

export function FleetHealthServiceWorkPanel({
  activeView,
  onViewChange,
  vendors,
  tasks,
  tasksLoading,
  tasksError,
  taskFilter,
  onTaskFilterChange,
  initialAdvancedFilters,
  serviceCases,
  serviceCasesDataReady,
  serviceCasesError,
  serviceCasesLoading,
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
          tasks={tasks}
          vendors={vendors}
          loading={tasksLoading}
          error={tasksError}
          filter={taskFilter}
          onFilterChange={onTaskFilterChange}
          initialAdvancedFilters={initialAdvancedFilters}
          onReload={onReload}
          onOpenGlobalTasks={onOpenGlobalTasks}
          focusTaskId={focusTaskId}
          compact
        />
      ) : null}

      {activeView === 'service-cases' ? (
        <FleetHealthServiceCasesPanel
          serviceCases={serviceCases}
          vendors={vendors}
          dataReady={serviceCasesDataReady}
          loading={serviceCasesLoading}
          error={serviceCasesError}
          onReload={onReload}
          onOpenTask={onOpenGlobalTasks}
        />
      ) : null}

      {activeView === 'due-dates' ? (
        <FleetHealthServiceSchedulePanel
          tasks={tasks}
          vendors={vendors}
          loading={tasksLoading}
          onSelectTask={onOpenGlobalTasks}
          compact
        />
      ) : null}
    </div>
  );
}
