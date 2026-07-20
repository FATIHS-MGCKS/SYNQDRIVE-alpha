import { useState } from 'react';
import type { ApiTask, Vendor } from '../../../lib/api';
import type { ServiceTaskAdvancedFilters } from '../../lib/service-task-filters';
import { ServiceTasksPanel } from '../service-center/ServiceTasksPanel';
import type { ServiceTaskFilter } from '../service-center/service-center.types';
import { fhs } from './fleet-health-service-shell';
import { DashboardSectionLabel } from '../dashboard/dashboardShell';

interface FleetHealthServiceTasksPanelProps {
  tasks: ApiTask[];
  vendors: Vendor[];
  loading?: boolean;
  error?: string | null;
  filter?: ServiceTaskFilter;
  onFilterChange?: (filter: ServiceTaskFilter) => void;
  initialAdvancedFilters?: Partial<ServiceTaskAdvancedFilters>;
  onReload?: () => void;
  onOpenGlobalTasks?: (taskId: string) => void;
  focusTaskId?: string | null;
  compact?: boolean;
}

export function FleetHealthServiceTasksPanel({
  tasks,
  vendors,
  loading,
  error,
  filter: filterProp,
  onFilterChange,
  initialAdvancedFilters,
  onReload,
  onOpenGlobalTasks,
  focusTaskId,
  compact = false,
}: FleetHealthServiceTasksPanelProps) {
  const [internalFilter, setInternalFilter] = useState<ServiceTaskFilter>('all');
  const filter = filterProp ?? internalFilter;
  const handleFilterChange = onFilterChange ?? setInternalFilter;

  return (
    <div className="space-y-3">
      {!compact ? (
        <div className={fhs.panel}>
          <div className={fhs.panelBody}>
            <DashboardSectionLabel className="mb-1">Aufgaben</DashboardSectionLabel>
            <p className="text-[12px] text-muted-foreground mb-3">
              Offene Service- und Wartungsaufgaben — Abarbeitung, keine erneute Health-Diagnose.
            </p>
          </div>
        </div>
      ) : null}
      <ServiceTasksPanel
        tasks={tasks}
        vendors={vendors}
        loading={loading}
        error={error}
        filter={filter}
        onFilterChange={handleFilterChange}
        initialAdvancedFilters={initialAdvancedFilters}
        onOpenGlobalTasks={onOpenGlobalTasks}
        onReload={onReload}
        focusTaskId={focusTaskId}
      />
    </div>
  );
}
