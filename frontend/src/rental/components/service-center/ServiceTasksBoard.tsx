import type { ApiTask } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import {
  boardColumnForTask,
  SERVICE_BOARD_COLUMNS,
  type ServiceBoardColumn,
} from '../../lib/service-task-semantics';
import { sc } from './service-center-ui';
import { ServiceTaskCard } from './ServiceTaskCard';

interface ServiceTasksBoardProps {
  tasks: ApiTask[];
  resolveVehicle: (task: ApiTask) => VehicleData | null;
  resolveVendorName: (task: ApiTask) => string | null;
  resolveAssigneeName: (task: ApiTask) => string | null;
  mutatingId: string | null;
  onOpen: (taskId: string) => void;
  onStart?: (task: ApiTask) => void;
  onWaiting?: (task: ApiTask) => void;
  onComplete?: (task: ApiTask) => void;
}

export function ServiceTasksBoard({
  tasks,
  resolveVehicle,
  resolveVendorName,
  resolveAssigneeName,
  mutatingId,
  onOpen,
  onStart,
  onWaiting,
  onComplete,
}: ServiceTasksBoardProps) {
  const byColumn = new Map<ServiceBoardColumn, ApiTask[]>();
  for (const col of SERVICE_BOARD_COLUMNS) {
    byColumn.set(col.id, []);
  }
  for (const task of tasks) {
    const col = boardColumnForTask(task);
    byColumn.get(col)?.push(task);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
      {SERVICE_BOARD_COLUMNS.map((col) => {
        const colTasks = byColumn.get(col.id) ?? [];
        return (
          <div
            key={col.id}
            className="min-w-[260px] max-w-[300px] flex-1 shrink-0 rounded-xl border border-border/45 bg-muted/15 p-2.5"
          >
            <div className="flex items-center justify-between mb-2 px-1">
              <h4 className="text-[11px] font-semibold text-foreground">{col.label}</h4>
              <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
                {colTasks.length}
              </span>
            </div>
            <div className="space-y-2 max-h-[min(60vh,520px)] overflow-y-auto">
              {colTasks.length === 0 ? (
                <p className="text-[10px] text-muted-foreground px-1 py-4 text-center">Leer</p>
              ) : (
                colTasks.map((task) => (
                  <ServiceTaskCard
                    key={task.id}
                    task={task}
                    vehicle={resolveVehicle(task)}
                    vendorName={resolveVendorName(task)}
                    assigneeName={resolveAssigneeName(task)}
                    compact
                    mutating={mutatingId === task.id}
                    onOpen={onOpen}
                    onStart={onStart}
                    onWaiting={onWaiting}
                    onComplete={onComplete}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
