import { SkeletonRows } from '../../components/patterns';
import { useOperatorHandover } from '../handover/OperatorHandoverProvider';
import { useOperatorDamageCapture } from '../damages/OperatorDamageCaptureProvider';
import { useOperatorVehicleQuickViewData } from '../hooks/useOperatorVehicleQuickViewData';
import { formatOperatorDateTime } from '../lib/operatorVehicleQuickView.utils';
import { toHandoverBookingSeed } from '../lib/operatorData';
import { OperatorVehicleQuickViewBookingContext } from './OperatorVehicleQuickViewBookingContext';
import { OperatorVehicleQuickViewActiveDamages } from './OperatorVehicleQuickViewActiveDamages';
import { OperatorVehicleQuickViewRentalHealth } from './OperatorVehicleQuickViewRentalHealth';
import { OperatorVehicleQuickViewTireProfile } from './OperatorVehicleQuickViewTireProfile';
import { OperatorGlassCard } from './OperatorGlassCard';
import { OperatorVehicleQuickViewHeader } from './OperatorVehicleQuickViewHeader';
import { OperatorVehicleQuickViewQuickActions } from './OperatorVehicleQuickViewQuickActions';
import { OperatorVehicleQuickViewTasks } from './OperatorVehicleQuickViewTasks';
import { OperatorVehicleQuickViewToolActions } from './OperatorVehicleQuickViewToolActions';
import { useOperatorShell } from '../context/OperatorShellContext';

interface OperatorVehicleQuickViewProps {
  vehicleId: string;
  onClose?: () => void;
}

function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <OperatorGlassCard className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </OperatorGlassCard>
  );
}

export function OperatorVehicleQuickView({ vehicleId, onClose }: OperatorVehicleQuickViewProps) {
  const { openSheet } = useOperatorShell();
  const { openHandover } = useOperatorHandover();
  const { openDamageCapture } = useOperatorDamageCapture();
  const data = useOperatorVehicleQuickViewData(vehicleId);

  if (!data.vehicle) {
    return <OperatorVehicleQuickViewHeader vehicle={null} snapshot={null} health={null} healthLoading={false} onReloadDetails={() => {}} />;
  }

  const vehicle = data.vehicle;
  const label = [vehicle.model, vehicle.license].filter(Boolean).join(' · ');
  const snapshot = data.statusSnapshot;
  const pickupItem = data.toPickupHandoverItem();
  const returnItem = data.toReturnHandoverItem();

  const openPickup = () => {
    if (!pickupItem) return;
    openHandover({
      bookingId: pickupItem.bookingId,
      kind: 'PICKUP',
      booking: toHandoverBookingSeed(pickupItem),
    });
  };

  const openReturn = () => {
    if (!returnItem) return;
    openHandover({
      bookingId: returnItem.bookingId,
      kind: 'RETURN',
      booking: toHandoverBookingSeed(returnItem),
    });
  };

  return (
    <div className="space-y-4 pb-4">
      <OperatorVehicleQuickViewHeader
        vehicle={vehicle}
        snapshot={snapshot}
        health={data.health}
        healthLoading={data.healthLoading}
        onClose={onClose}
        onReloadDetails={() => void data.reloadDetails()}
      />

      <OperatorVehicleQuickViewQuickActions
        pickupVisible={Boolean(pickupItem)}
        pickupDisabled={!data.pickupAction?.gate.allowed}
        pickupCustomerName={pickupItem?.customerName ?? ''}
        pickupGate={data.pickupAction?.gate ?? null}
        returnVisible={Boolean(returnItem)}
        returnDisabled={!data.returnAction?.gate.allowed}
        returnCustomerName={returnItem?.customerName ?? ''}
        returnGate={data.returnAction?.gate ?? null}
        vehicleLabel={label}
        onPickup={openPickup}
        onReturn={openReturn}
        onCreateBooking={() =>
          openSheet({
            type: 'booking-create',
            prefillVehicleId: vehicle.id,
          })
        }
      />

      {data.bookingContext && (
        <OperatorVehicleQuickViewBookingContext
          kind={data.bookingContext.kind}
          customerName={data.bookingContext.customerName}
          when={data.bookingContext.when}
          station={data.bookingContext.station}
        />
      )}

      {/* Blockers */}
      {(data.health?.rental_blocked ||
        (snapshot?.contradictions.length ?? 0) > 0 ||
        data.healthError) && (
        <SectionCard title="Blocker & Hinweise">
          {data.healthError && (
            <p className="text-xs text-[color:var(--status-critical)]">
              Rental Health nicht geladen: {data.healthError}
            </p>
          )}
          {data.health?.blocking_reasons?.map((r) => (
            <p key={r} className="text-sm text-foreground">
              · {r}
            </p>
          ))}
          {snapshot?.contradictions.map((c) => (
            <p key={c} className="text-xs text-[color:var(--status-watch)]">
              · {c}
            </p>
          ))}
        </SectionCard>
      )}

      <OperatorVehicleQuickViewRentalHealth
        health={data.health}
        healthLoading={data.healthLoading}
      />

      <OperatorVehicleQuickViewActiveDamages
        damages={data.damages}
        damagesLoading={data.damagesLoading}
      />

      <OperatorVehicleQuickViewTasks
        tasks={data.allOpenTasks}
        loading={data.extraTasksLoading}
        onCreateTask={() =>
          openSheet({
            type: 'task-create',
            vehicleId,
            vehicleLabel: label,
            bookingId: data.bookingContext?.bookingId ?? undefined,
            onSuccess: () => void data.reloadDetails(),
          })
        }
        onOpenTask={(task) =>
          openSheet({
            type: 'task-detail',
            taskId: task.id,
            task,
            onUpdated: () => void data.reloadDetails(),
          })
        }
      />

      <OperatorVehicleQuickViewTireProfile
        tireSummary={data.tireSummary}
        tireLoading={data.tireLoading}
        onMeasure={() =>
          openSheet({
            type: 'tire-measure',
            vehicleId,
            vehicleLabel: label,
            bookingId: data.bookingContext?.bookingId ?? undefined,
            onSuccess: () => void data.reloadDetails(),
          })
        }
      />

      {/* Documents */}
      {(data.documentsLoading || data.documents.length > 0) && (
        <SectionCard title="AI Uploads / Dokumente">
          {data.documentsLoading ? (
            <SkeletonRows rows={2} />
          ) : (
            <div className="space-y-2">
              {data.documents.map((doc) => (
                <div key={doc.id} className="rounded-xl border border-border/50 px-3 py-2 text-xs">
                  <p className="font-semibold text-foreground">
                    {doc.documentType} · {doc.status}
                  </p>
                  <p className="text-muted-foreground">
                    {doc.sourceFileName ?? '—'} · {formatOperatorDateTime(doc.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      <OperatorVehicleQuickViewToolActions
        onDamageCapture={() =>
          openDamageCapture({
            vehicleId,
            vehicleName: vehicle.model,
            plate: vehicle.license,
            bookingId: data.bookingContext?.bookingId ?? undefined,
            skipVehicleConfirm: true,
          })
        }
        onAiUpload={() =>
          openSheet({
            type: 'ai-upload',
            vehicleId,
            vehicleLabel: label,
            bookingId: data.bookingContext?.bookingId ?? undefined,
            contextMode: 'vehicle',
          })
        }
        onTireMeasure={() =>
          openSheet({
            type: 'tire-measure',
            vehicleId,
            vehicleLabel: label,
            onSuccess: () => void data.reloadDetails(),
          })
        }
        onTaskCreate={() =>
          openSheet({
            type: 'task-create',
            vehicleId,
            vehicleLabel: label,
            bookingId: data.bookingContext?.bookingId ?? undefined,
            onSuccess: () => void data.reloadDetails(),
          })
        }
      />
    </div>
  );
}
