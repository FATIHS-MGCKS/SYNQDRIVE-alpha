import { useEffect, useState } from 'react';
import type { ApiTask, Vendor } from '../../../lib/api';
import { ServiceTasksPanel } from '../service-center/ServiceTasksPanel';
import type { ServiceTaskFilter } from '../service-center/service-center.types';
import { fhs } from './fleet-health-service-shell';
import { DashboardSectionLabel } from '../dashboard/dashboardShell';

interface FleetHealthServiceTasksPanelProps {
  tasks: ApiTask[];
  vendors: Vendor[];
  loading?: boolean;
  error?: string | null;
  onReload?: () => void;
  onOpenGlobalTasks?: (taskId: string) => void;
  focusTaskId?: string | null;
  initialTaskFilter?: ServiceTaskFilter;
}

export function FleetHealthServiceTasksPanel({
  tasks,
  vendors,
  loading,
  error,
  onReload,
  onOpenGlobalTasks,
  focusTaskId,
  initialTaskFilter,
}: FleetHealthServiceTasksPanelProps) {
  const [filter, setFilter] = useState<ServiceTaskFilter>(initialTaskFilter ?? 'all');

  useEffect(() => {
    if (initialTaskFilter) setFilter(initialTaskFilter);
  }, [initialTaskFilter]);

  return (
    <div className="space-y-3">
      <div className={fhs.panel}>
        <div className={fhs.panelBody}>
          <DashboardSectionLabel className="mb-1">Aufgaben</DashboardSectionLabel>
          <p className="text-[12px] text-muted-foreground mb-3">
            Offene Service- und Wartungsaufgaben — Abarbeitung, keine erneute Health-Diagnose.
          </p>
        </div>
      </div>
      <ServiceTasksPanel
        tasks={tasks}
        vendors={vendors}
        loading={loading}
        error={error}
        filter={filter}
        onFilterChange={setFilter}
        onOpenGlobalTasks={onOpenGlobalTasks}
        onReload={onReload}
        focusTaskId={focusTaskId}
      />
    </div>
  );
}
