import { useMemo, useState } from 'react';
import type { ApiServiceCase, ApiTask, Vendor } from '../../../lib/api';
import { EmptyState, SkeletonCard, StatusChip } from '../../../components/patterns';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import { buildVehicleLabel } from '../../lib/service-task-semantics';
import { useServiceTaskLookups } from '../service-center/useServiceTaskLookups';
import { VehicleTaskDetailDrawer } from '../tasks/VehicleTaskDetailDrawer';
import { FleetHealthServiceCaseDetailDrawer } from './FleetHealthServiceCaseDetailDrawer';
import { FleetHealthServiceScheduleItemRow } from './FleetHealthServiceScheduleItemRow';
import { resolveServiceCaseVehicleDisplay } from './fleet-health-service-case-list';
import {
  buildFleetScheduleItems,
  FLEET_SCHEDULE_BUCKET_LABEL,
  FLEET_SCHEDULE_BUCKET_ORDER,
  FLEET_SCHEDULE_BUCKET_TONE,
  groupFleetScheduleItems,
} from './fleet-health-service-schedule.utils';
import { useOrganizationTimeZone } from './useOrganizationTimeZone';
import { DashboardSectionLabel } from '../dashboard/dashboardShell';
import { fhs } from './fleet-health-service-shell';

interface FleetHealthServiceSchedulePanelProps {
  tasks: ApiTask[];
  serviceCases: ApiServiceCase[];
  vendors: Vendor[];
  loading?: boolean;
  onSelectTask?: (taskId: string) => void;
  onSelectServiceCase?: (serviceCaseId: string) => void;
  compact?: boolean;
}

export function FleetHealthServiceSchedulePanel({
  tasks,
  serviceCases,
  vendors,
  loading,
  onSelectTask,
  onSelectServiceCase,
  compact = false,
}: FleetHealthServiceSchedulePanelProps) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const timeZone = useOrganizationTimeZone(orgId);
  const lookups = useServiceTaskLookups(vendors);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseDrawerOpen, setCaseDrawerOpen] = useState(false);

  const items = useMemo(
    () => buildFleetScheduleItems({ tasks, serviceCases, timeZone }),
    [tasks, serviceCases, timeZone],
  );
  const groups = useMemo(() => groupFleetScheduleItems(items), [items]);

  const visibleBuckets = FLEET_SCHEDULE_BUCKET_ORDER.filter(
    (bucket) => (groups.get(bucket)?.length ?? 0) > 0,
  );

  const resolveVehicleLabel = (vehicleId: string | null | undefined) => {
    if (!vehicleId) return '—';
    const vehicle = fleetVehicles.find((entry) => entry.id === vehicleId);
    if (!vehicle) return resolveServiceCaseVehicleDisplay(null).vehicleName;
    return buildVehicleLabel(vehicle);
  };

  const resolveVendorName = (vendorId: string | null | undefined) => {
    if (!vendorId) return null;
    return vendors.find((vendor) => vendor.id === vendorId)?.name ?? null;
  };

  const openTask = (taskId: string) => {
    if (onSelectTask) {
      onSelectTask(taskId);
      return;
    }
    setSelectedTaskId(taskId);
    setTaskDrawerOpen(true);
  };

  const openServiceCase = (caseId: string) => {
    if (onSelectServiceCase) {
      onSelectServiceCase(caseId);
      return;
    }
    setSelectedCaseId(caseId);
    setCaseDrawerOpen(true);
  };

  return (
    <div className="space-y-3">
      {!compact ? (
        <div className={fhs.panel}>
          <div className={fhs.panelBody}>
            <DashboardSectionLabel className="mb-1">Termine</DashboardSectionLabel>
            <p className="text-[12px] text-muted-foreground">
              Aufgaben-Fälligkeiten, Werkstatttermine und erwartete Fertigstellungen aus API-Feldern —
              gruppiert nach {timeZone}.
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Fälligkeitsplan
          </p>
          <h3 className="text-[15px] font-semibold text-foreground mb-1">
            Aufgaben & Servicefälle
          </h3>
          <p className="text-[11px] text-muted-foreground max-w-2xl leading-relaxed">
            Getrennte Kennzeichnung für{' '}
            <strong className="font-semibold text-foreground/80">Aufgabe fällig</strong>,{' '}
            <strong className="font-semibold text-foreground/80">Werkstatttermin</strong> und{' '}
            <strong className="font-semibold text-foreground/80">erwartete Fertigstellung</strong>.
            Servicefall-Termine stammen aus <code className="text-[10px]">scheduledAt</code> /{' '}
            <code className="text-[10px]">expectedReadyAt</code>, nicht aus Titeln.
          </p>
        </div>

        {loading && items.length === 0 ? (
          <div className="space-y-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="Keine anstehenden Termine"
            description="Offene Aufgaben mit Fälligkeit und aktive Servicefälle mit Terminen erscheinen hier."
          />
        ) : (
          <div className="space-y-5">
            {visibleBuckets.map((bucket) => {
              const bucketItems = groups.get(bucket) ?? [];
              if (!bucketItems.length) return null;
              return (
                <section key={bucket}>
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-[11px] font-semibold text-foreground">
                      {FLEET_SCHEDULE_BUCKET_LABEL[bucket]}
                    </h4>
                    <StatusChip tone={FLEET_SCHEDULE_BUCKET_TONE[bucket]}>
                      {bucketItems.length}
                    </StatusChip>
                  </div>
                  <div className="space-y-2">
                    {bucketItems.map((item) => {
                      const vehicleId = item.task?.vehicleId ?? item.serviceCase?.vehicleId ?? null;
                      const vendorId = item.task?.vendorId ?? item.serviceCase?.vendorId ?? null;
                      return (
                        <FleetHealthServiceScheduleItemRow
                          key={item.id}
                          item={item}
                          vehicleLabel={resolveVehicleLabel(vehicleId)}
                          vendorName={resolveVendorName(vendorId)}
                          timeZone={timeZone}
                          onOpenTask={openTask}
                          onOpenServiceCase={openServiceCase}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <VehicleTaskDetailDrawer
        open={taskDrawerOpen}
        onOpenChange={setTaskDrawerOpen}
        orgId={lookups.orgId}
        taskId={selectedTaskId}
        vehicle={
          selectedTaskId
            ? lookups.resolveVehicle(
                tasks.find((entry) => entry.id === selectedTaskId) ?? ({ vehicleId: null } as ApiTask),
              )
            : null
        }
        orgMembers={lookups.orgMembers}
        onTaskUpdated={() => undefined}
      />

      <FleetHealthServiceCaseDetailDrawer
        open={caseDrawerOpen}
        onOpenChange={setCaseDrawerOpen}
        serviceCaseId={selectedCaseId}
        vendors={vendors}
        onOpenTask={openTask}
      />
    </div>
  );
}
