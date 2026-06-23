import { useMemo } from 'react';
import type { ApiTask } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import { formatTaskDueDate } from '../../lib/task-display.utils';
import { groupTasksByDueDate } from './service-center.utils';
import { sc } from './service-center-ui';
import { buildVehicleLabel, taskTypeLabel } from '../../lib/service-task-semantics';

interface ServiceTasksCalendarProps {
  tasks: ApiTask[];
  resolveVehicle: (task: ApiTask) => VehicleData | null;
  onOpen: (taskId: string) => void;
}

export function ServiceTasksCalendar({
  tasks,
  resolveVehicle,
  onOpen,
}: ServiceTasksCalendarProps) {
  const withDue = useMemo(
    () => tasks.filter((t) => t.dueDate && t.status !== 'CANCELLED'),
    [tasks],
  );
  const groups = useMemo(() => groupTasksByDueDate(withDue), [withDue]);

  if (withDue.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground text-center py-8">
        Keine Aufgaben mit Fälligkeitsdatum für die Kalenderansicht.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([day, dayTasks]) => (
        <section key={day} className={sc.panel}>
          <h4 className="text-[11px] font-semibold text-foreground mb-2">{day}</h4>
          <div className="space-y-1.5">
            {dayTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onOpen(task.id)}
                className="w-full text-left rounded-lg border border-border/40 px-2.5 py-2 hover:bg-muted/25"
              >
                <p className="text-[11px] font-medium">{task.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  {buildVehicleLabel(resolveVehicle(task))} · {taskTypeLabel(task)}
                  {task.dueDate ? ` · ${formatTaskDueDate(task.dueDate)}` : ''}
                </p>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
