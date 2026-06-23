import { useMemo, useState } from 'react';
import { EmptyState, SkeletonCard, StatusChip } from '../../../components/patterns';
import type { ApiTask, Vendor } from '../../../lib/api';
import {
  groupTasksByScheduleBucket,
  SCHEDULE_BUCKET_LABEL,
  SCHEDULE_BUCKET_ORDER,
  SCHEDULE_BUCKET_TONE,
  selectScheduleTasks,
} from '../../lib/service-schedule.utils';
import { buildVehicleLabel } from '../../lib/service-task-semantics';
import { sc } from './service-center-ui';
import { ServiceScheduleRow } from './ServiceScheduleRow';
import { useServiceTaskLookups } from './useServiceTaskLookups';
import { VehicleTaskDetailDrawer } from '../tasks/VehicleTaskDetailDrawer';

interface ServiceSchedulePanelProps {
  tasks: ApiTask[];
  vendors: Vendor[];
  loading?: boolean;
  onSelectTask?: (taskId: string) => void;
}

export function ServiceSchedulePanel({
  tasks,
  vendors,
  loading,
  onSelectTask,
}: ServiceSchedulePanelProps) {
  const lookups = useServiceTaskLookups(vendors);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const scheduled = useMemo(() => selectScheduleTasks(tasks), [tasks]);
  const groups = useMemo(() => groupTasksByScheduleBucket(scheduled), [scheduled]);
  const withDue = useMemo(() => scheduled.filter((t) => t.dueDate), [scheduled]);
  const withoutDue = useMemo(() => scheduled.filter((t) => !t.dueDate), [scheduled]);

  const openTask = (taskId: string) => {
    if (onSelectTask) {
      onSelectTask(taskId);
      return;
    }
    setSelectedTaskId(taskId);
    setDrawerOpen(true);
  };

  const visibleBuckets = SCHEDULE_BUCKET_ORDER.filter((b) => {
    if (b === 'no_due') return withoutDue.length > 0;
    return (groups.get(b)?.length ?? 0) > 0;
  });

  return (
    <div className={sc.panel}>
      <p className={sc.sectionEyebrow}>Fälligkeitsplan</p>
      <h3 className={`${sc.sectionTitle} mb-1`}>Anstehende Wartung & Service</h3>
      <p className="text-[11px] text-muted-foreground mb-4 max-w-2xl leading-relaxed">
        Gruppiert nach <strong className="font-semibold text-foreground/80">Fälligkeitsdatum</strong> offener
        Aufgaben — kein separater Werkstatt-Kalender. Exakte Termine erscheinen nur, wenn sie in der Aufgabe
        hinterlegt sind.
      </p>

      {loading && scheduled.length === 0 ? (
        <div className="space-y-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : withDue.length === 0 && withoutDue.length === 0 ? (
        <EmptyState
          title="Keine anstehenden Aufgaben"
          description="Offene Service-, Reparatur- und Inspektionsaufgaben mit Fälligkeit erscheinen hier."
        />
      ) : (
        <div className="space-y-5">
          {visibleBuckets.map((bucket) => {
            const bucketTasks =
              bucket === 'no_due' ? withoutDue : (groups.get(bucket) ?? []);
            if (!bucketTasks.length) return null;
            return (
              <section key={bucket}>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-[11px] font-semibold text-foreground">
                    {SCHEDULE_BUCKET_LABEL[bucket]}
                  </h4>
                  <StatusChip tone={SCHEDULE_BUCKET_TONE[bucket]}>{bucketTasks.length}</StatusChip>
                </div>
                <div className="space-y-2">
                  {bucketTasks.map((task) => (
                    <ServiceScheduleRow
                      key={task.id}
                      task={task}
                      vehicleLabel={buildVehicleLabel(lookups.resolveVehicle(task))}
                      vendorName={lookups.resolveVendorName(task)}
                      assigneeName={lookups.resolveAssigneeName(task)}
                      onOpen={openTask}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <VehicleTaskDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        orgId={lookups.orgId}
        taskId={selectedTaskId}
        vehicle={
          selectedTaskId
            ? lookups.resolveVehicle(
                scheduled.find((t) => t.id === selectedTaskId) ?? ({ vehicleId: null } as ApiTask),
              )
            : null
        }
        orgMembers={lookups.orgMembers}
        onTaskUpdated={() => undefined}
      />
    </div>
  );
}
