
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { ApiTask, VehicleExteriorEffectiveImageDto, VehicleExteriorViewKey } from '../../lib/api';
import {
  ErrorState,
  SkeletonMetricGrid,
  SkeletonRows,
} from '../../components/patterns';
import { useRentalOrg } from '../RentalContext';
import { useVehicleDamages } from '../hooks/useVehicleDamages';
import { useVehicleDamageActions } from '../hooks/useVehicleDamageActions';
import type { CreateVehicleDamageInput, DamageResponse } from '../lib/damage.types';
import { formatDamageType, isActiveDamage } from '../lib/damage.types';
import { derivePickupContext } from '../lib/damage-pickup-context';
import { canCreateRepairTaskForDamage } from '../lib/damage-repair-task';
import { useDamageHandoverRefs } from '../hooks/useDamageHandoverRefs';
import { deriveControlStats, type DamageQueueFilter } from './damages/damage-control.utils';
import { DamageControlSummary } from './damages/DamageControlSummary';
import { DamageInsightsSection } from './damages/DamageInsightsSection';
import { DamageEvidenceCanvas } from './damages/DamageEvidenceCanvas';
import { DamageWorkQueue } from './damages/DamageWorkQueue';
import { DamageDetailDrawer } from './damages/DamageDetailDrawer';
import { CreateDamageDialog } from './damages/CreateDamageDialog';
import { CreateRepairTaskDialog } from './damages/CreateRepairTaskDialog';
import { MarkRepairedDialog } from './damages/MarkRepairedDialog';
import { DamageAiIntakeDialog } from './damages/DamageAiIntakeDialog';
import { isDamageAiIntakeEnabled } from '../lib/damage-ai-intake';

interface DamagesViewProps {
  isDarkMode?: boolean;
  vehicleId?: string;
  onOpenVehicleTasks?: (taskId?: string) => void;
}

type DamageLocationViewAfterCreate = 'FRONT' | 'LEFT' | 'RIGHT' | 'REAR' | 'ROOF';

export function DamagesView({ vehicleId, onOpenVehicleTasks }: DamagesViewProps) {
  const { orgId } = useRentalOrg();
  const { damages, stats, statsUnavailable, loading, error, reload } = useVehicleDamages(vehicleId);
  const actions = useVehicleDamageActions({ vehicleId, orgId, reload });

  const [queueFilter, setQueueFilter] = useState<DamageQueueFilter>('open');
  const [selectedDamageId, setSelectedDamageId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [repairDialogOpen, setRepairDialogOpen] = useState(false);
  const [repairTarget, setRepairTarget] = useState<DamageResponse | null>(null);
  const [repairTaskDialogOpen, setRepairTaskDialogOpen] = useState(false);
  const [repairTaskTarget, setRepairTaskTarget] = useState<DamageResponse | null>(null);
  const [aiIntakeOpen, setAiIntakeOpen] = useState(false);
  const [linkedTask, setLinkedTask] = useState<ApiTask | null>(null);
  const [placingDamageId, setPlacingDamageId] = useState<string | null>(null);
  const [pendingPlaceView, setPendingPlaceView] = useState<DamageLocationViewAfterCreate | null>(null);

  const [activeView, setActiveView] = useState<VehicleExteriorViewKey>('FRONT');
  const [exteriorImages, setExteriorImages] = useState<Record<string, VehicleExteriorEffectiveImageDto>>({});
  const [exteriorImagesLoading, setExteriorImagesLoading] = useState(false);

  const controlStats = useMemo(() => deriveControlStats(damages, stats), [damages, stats]);

  const selectedDamage = useMemo(
    () => damages.find((d) => d.id === selectedDamageId) ?? null,
    [damages, selectedDamageId],
  );

  const handoverRefsByBooking = useDamageHandoverRefs(orgId, damages);

  const damagesById = useMemo(() => new Map(damages.map((d) => [d.id, d])), [damages]);

  const pickupContextForDamage = useCallback(
    (damage: DamageResponse | null) => {
      if (!damage) {
        return {
          context: 'NOT_APPLICABLE' as const,
          label: null,
          suggestedPickupDamageId: null,
          matchConfidence: 'none' as const,
          reason: 'No damage selected.',
        };
      }
      const handovers = damage.bookingId
        ? handoverRefsByBooking.get(damage.bookingId) ?? []
        : [];
      return derivePickupContext(damage, handovers, damagesById);
    },
    [handoverRefsByBooking, damagesById],
  );

  const selectedPickupContext = useMemo(
    () => pickupContextForDamage(selectedDamage),
    [pickupContextForDamage, selectedDamage],
  );

  const primaryBlockingDamage = useMemo(
    () =>
      damages.find(
        (d) =>
          isActiveDamage(d) &&
          canCreateRepairTaskForDamage(d) &&
          (d.rentalImpact === 'SAFETY_CRITICAL' || d.rentalImpact === 'BLOCK_RENTAL'),
      ) ?? null,
    [damages],
  );

  useEffect(() => {
    if (!orgId || !selectedDamage?.taskId || !drawerOpen) {
      setLinkedTask(null);
      return;
    }
    let cancelled = false;
    api.tasks
      .get(orgId, selectedDamage.taskId)
      .then((task) => {
        if (!cancelled) setLinkedTask(task);
      })
      .catch(() => {
        if (!cancelled) setLinkedTask(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, selectedDamage?.taskId, drawerOpen]);

  useEffect(() => {
    if (!vehicleId) {
      setExteriorImages({});
      return;
    }
    let cancelled = false;
    setExteriorImagesLoading(true);
    api.vehicles.exteriorImages
      .listEffective(vehicleId)
      .then((response) => {
        if (cancelled) return;
        const map: Record<string, VehicleExteriorEffectiveImageDto> = {};
        response.effective.forEach((r) => {
          map[r.view] = r;
        });
        setExteriorImages(map);
      })
      .catch(() => {
        if (!cancelled) setExteriorImages({});
      })
      .finally(() => {
        if (!cancelled) setExteriorImagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  const openDamage = useCallback((damage: DamageResponse) => {
    setSelectedDamageId(damage.id);
    setDrawerOpen(true);
    if (damage.locationView && damage.locationView !== 'UNKNOWN') {
      setActiveView(damage.locationView as VehicleExteriorViewKey);
    }
  }, []);

  const startPlacement = useCallback((damageId: string, view?: VehicleExteriorViewKey) => {
    setPlacingDamageId(damageId);
    setSelectedDamageId(damageId);
    if (view) setActiveView(view);
  }, []);

  const handleCreateDamage = useCallback(
    async (input: CreateVehicleDamageInput, options: { placeAfterCreate: boolean }) => {
      const created = await actions.createDamage(input);
      setQueueFilter('open');
      openDamage(created);

      if (
        options.placeAfterCreate &&
        input.locationView &&
        input.locationView !== 'UNKNOWN'
      ) {
        setPendingPlaceView(input.locationView as DamageLocationViewAfterCreate);
        startPlacement(created.id, input.locationView as VehicleExteriorViewKey);
        setDrawerOpen(false);
      }
    },
    [actions, openDamage, startPlacement],
  );

  const handleCanvasPlace = useCallback(
    async (damageId: string, x: number, y: number, view: VehicleExteriorViewKey) => {
      await actions.placeDamageOnCanvas(damageId, x, y, view);
      setPlacingDamageId(null);
      setPendingPlaceView(null);
      setSelectedDamageId(damageId);
      setDrawerOpen(true);
    },
    [actions],
  );

  const requestCreateRepairTask = useCallback((damage: DamageResponse) => {
    setRepairTaskTarget(damage);
    setRepairTaskDialogOpen(true);
  }, []);

  const confirmCreateRepairTask = useCallback(
    async (damage: DamageResponse, input: Parameters<typeof actions.createRepairTask>[1]) => {
      await actions.createRepairTask(damage, input);
      setRepairTaskTarget(null);
    },
    [actions],
  );

  const openLinkedTask = useCallback(
    (taskId: string) => {
      onOpenVehicleTasks?.(taskId);
    },
    [onOpenVehicleTasks],
  );

  const requestMarkRepaired = useCallback((damage: DamageResponse) => {
    setRepairTarget(damage);
    setRepairDialogOpen(true);
  }, []);

  const confirmMarkRepaired = useCallback(
    async (input: { repairCostCents?: number; note?: string }) => {
      if (!repairTarget) return;
      await actions.markRepaired(repairTarget.id, input);
      setDrawerOpen(false);
      setQueueFilter('repaired');
      setRepairTarget(null);
    },
    [actions, repairTarget],
  );

  const busy = actions.mutating;
  const damageAiIntakeEnabled = isDamageAiIntakeEnabled();

  const heatmapForActiveView = useMemo(
    () => stats?.insights?.heatmapByView?.[activeView] ?? [],
    [activeView, stats?.insights?.heatmapByView],
  );

  if (!vehicleId) {
    return (
      <div className="surface-premium rounded-2xl p-6">
        <p className="text-[12px] text-muted-foreground">Select a vehicle to open the damage control center.</p>
      </div>
    );
  }

  if (error && !loading) {
    return (
      <ErrorState
        title="Damage control center unavailable"
        description={error}
        onRetry={() => void reload()}
        retryLabel="Retry"
        className="surface-premium rounded-2xl shadow-[var(--shadow-1)]"
      />
    );
  }

  if (loading && damages.length === 0) {
    return (
      <div className="space-y-4">
        <SkeletonMetricGrid count={7} />
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-3">
          <div className="surface-premium rounded-2xl p-4">
            <SkeletonRows rows={10} />
          </div>
          <div className="surface-premium rounded-2xl p-4">
            <SkeletonRows rows={8} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1400px]">
      <DamageControlSummary
        stats={controlStats}
        showRepairTaskCta={Boolean(primaryBlockingDamage)}
        createRepairTaskBusy={actions.mutatingAction === 'createTask'}
        onCreateRepairTask={
          primaryBlockingDamage
            ? () => requestCreateRepairTask(primaryBlockingDamage)
            : undefined
        }
      />

      <DamageInsightsSection insights={stats?.insights} statsUnavailable={statsUnavailable} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-3 items-start">
        <DamageEvidenceCanvas
          vehicleId={vehicleId}
          activeView={activeView}
          onViewChange={setActiveView}
          exteriorImages={exteriorImages}
          exteriorLoading={exteriorImagesLoading}
          damages={damages}
          selectedDamageId={selectedDamageId}
          placingDamageId={placingDamageId}
          placeBusy={actions.mutatingAction === 'place'}
          onSelectDamage={openDamage}
          onPlaceClick={(id) => startPlacement(id)}
          onCanvasPlace={handleCanvasPlace}
          onCancelPlace={() => {
            setPlacingDamageId(null);
            setPendingPlaceView(null);
          }}
          heatmapCells={heatmapForActiveView}
        />

        <DamageWorkQueue
          damages={damages}
          filter={queueFilter}
          onFilterChange={setQueueFilter}
          selectedDamageId={selectedDamageId}
          onSelectDamage={openDamage}
          onQuickRepair={requestMarkRepaired}
          onQuickCreateTask={requestCreateRepairTask}
          pickupContextForDamage={pickupContextForDamage}
          onAddDamage={() => setCreateOpen(true)}
          onAnalyzeExteriorPhotos={() => setAiIntakeOpen(true)}
          analyzeExteriorPhotosEnabled={damageAiIntakeEnabled}
          analyzeExteriorPhotosDisabledReason="Exterior photo analysis requires VITE_DAMAGE_AI_INTAKE_ENABLED and a deployed vision backend. Use AI Upload (DAMAGE documents) for damage reports."
        />
      </div>

      {pendingPlaceView && placingDamageId && (
        <p className="text-[11px] text-muted-foreground px-1">
          Placement mode active for {pendingPlaceView} view. Select the matching tab if needed, then click the vehicle photo.
        </p>
      )}

      <DamageDetailDrawer
        open={drawerOpen}
        damage={selectedDamage}
        onOpenChange={setDrawerOpen}
        busy={busy}
        linkedTask={
          linkedTask
            ? { id: linkedTask.id, title: linkedTask.title, status: linkedTask.status }
            : null
        }
        pickupContext={selectedPickupContext}
        onAddPhoto={async (damage, file, caption) => {
          await actions.addPhoto(damage.id, file, caption);
        }}
        onPlace={(d) => {
          startPlacement(d.id, d.locationView !== 'UNKNOWN' ? (d.locationView as VehicleExteriorViewKey) : activeView);
          setDrawerOpen(false);
        }}
        onMarkInRepair={async (d) => {
          await actions.markInRepair(d.id);
        }}
        onRequestMarkRepaired={requestMarkRepaired}
        onArchive={async (d) => {
          await actions.archiveDamage(d.id);
        }}
        onRequestCreateRepairTask={requestCreateRepairTask}
        onOpenLinkedTask={onOpenVehicleTasks ? openLinkedTask : undefined}
        onUpdateLiability={async (d, input) => {
          await actions.updateLiability(d.id, input);
        }}
        onPrepareDepositHold={async (d, cents) => {
          await actions.prepareDepositHold(d.id, cents);
        }}
        onPrepareCustomerCharge={async (d, cents) => {
          await actions.prepareCustomerCharge(d.id, cents);
        }}
      />

      <CreateDamageDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        busy={actions.mutatingAction === 'create'}
        onSubmit={handleCreateDamage}
      />

      <MarkRepairedDialog
        open={repairDialogOpen}
        onOpenChange={setRepairDialogOpen}
        busy={actions.mutatingAction === 'markRepaired'}
        damageLabel={repairTarget ? formatDamageType(repairTarget.damageType) : undefined}
        onConfirm={confirmMarkRepaired}
      />

      <CreateRepairTaskDialog
        open={repairTaskDialogOpen}
        onOpenChange={setRepairTaskDialogOpen}
        damage={repairTaskTarget}
        busy={actions.mutatingAction === 'createTask'}
        onConfirm={confirmCreateRepairTask}
      />

      <DamageAiIntakeDialog
        open={aiIntakeOpen}
        onOpenChange={setAiIntakeOpen}
        vehicleId={vehicleId}
        onConfirmed={() => void reload()}
      />
    </div>
  );
}
