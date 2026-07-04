import type { ApiTask, Vendor } from '../../../lib/api';
import { ServiceSchedulePanel } from '../service-center/ServiceSchedulePanel';
import { DashboardSectionLabel } from '../dashboard/dashboardShell';
import { fhs } from './fleet-health-service-shell';

interface FleetHealthServiceSchedulePanelProps {
  tasks: ApiTask[];
  vendors: Vendor[];
  loading?: boolean;
  onSelectTask?: (taskId: string) => void;
}

export function FleetHealthServiceSchedulePanel({
  tasks,
  vendors,
  loading,
  onSelectTask,
}: FleetHealthServiceSchedulePanelProps) {
  return (
    <div className="space-y-3">
      <div className={fhs.panel}>
        <div className={fhs.panelBody}>
          <DashboardSectionLabel className="mb-1">Termine</DashboardSectionLabel>
          <p className="text-[12px] text-muted-foreground">
            Wartung, HU/TÜV, BOKraft und Werkstatttermine aus offenen Aufgaben — nur echte
            Fälligkeiten.
          </p>
        </div>
      </div>
      <ServiceSchedulePanel
        tasks={tasks}
        vendors={vendors}
        loading={loading}
        onSelectTask={onSelectTask}
      />
    </div>
  );
}
