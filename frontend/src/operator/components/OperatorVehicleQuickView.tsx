import {
  Disc3,
  ListTodo,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { SkeletonRows, StatusChip } from '../../components/patterns';
import { formatDamageType } from '../../rental/lib/damage.types';
import { useOperatorHandover } from '../handover/OperatorHandoverProvider';
import { useOperatorDamageCapture } from '../damages/OperatorDamageCaptureProvider';
import { useOperatorVehicleQuickViewData } from '../hooks/useOperatorVehicleQuickViewData';
import {
  formatModuleRow,
  formatOperatorDateTime,
  HEALTH_MODULE_LABELS,
  RENTAL_HEALTH_STATE_LABELS,
} from '../lib/operatorVehicleQuickView.utils';
import {
  tireDefaultAssumptionWarning,
  tireLowestTreadLabel,
  tireRemainingKmLabel,
  tireUiStatusLabel,
} from '../../rental/lib/tire-health-detail-ui';
import { toHandoverBookingSeed } from '../lib/operatorData';
import { OperatorGlassCard } from './OperatorGlassCard';
import { OperatorVehicleQuickViewHeader } from './OperatorVehicleQuickViewHeader';
import { OperatorVehicleQuickViewQuickActions } from './OperatorVehicleQuickViewQuickActions';
import { OperatorVehicleQuickViewTasks } from './OperatorVehicleQuickViewTasks';
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

      {/* Booking */}
      {data.bookingContext && (
        <SectionCard title="Buchung">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{data.bookingContext.label}</p>
            <p className="text-sm text-foreground">{data.bookingContext.customerName}</p>
            <p className="text-xs text-muted-foreground">
              {formatOperatorDateTime(data.bookingContext.when)}
              {data.bookingContext.station ? ` · ${data.bookingContext.station}` : ''}
            </p>
          </div>
        </SectionCard>
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

      {/* Rental health modules */}
      <SectionCard title="Rental Health">
        {data.healthLoading ? (
          <SkeletonRows rows={4} />
        ) : !data.health ? (
          <p className="text-sm text-muted-foreground">Status nicht verfügbar.</p>
        ) : (
          <div className="space-y-2">
            {(Object.keys(HEALTH_MODULE_LABELS) as Array<keyof typeof HEALTH_MODULE_LABELS>).map(
              (key) => {
                const mod = data.health!.modules[key];
                const row = formatModuleRow(mod);
                return (
                  <div
                    key={key}
                    className="flex items-start justify-between gap-2 rounded-xl border border-border/40 bg-muted/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">
                        {HEALTH_MODULE_LABELS[key]}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{row.reason}</p>
                    </div>
                    <StatusChip tone={row.tone} className="shrink-0">
                      {row.stateLabel}
                      {row.stale ? ' · stale' : ''}
                    </StatusChip>
                  </div>
                );
              },
            )}
          </div>
        )}
      </SectionCard>

      {/* Damages */}
      <SectionCard title="Aktive Schäden">
        {data.damagesLoading ? (
          <SkeletonRows rows={2} />
        ) : data.damages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine aktiven Schäden.</p>
        ) : (
          <div className="space-y-2">
            {data.damages.slice(0, 5).map((d) => (
              <div key={d.id} className="rounded-xl border border-border/50 px-3 py-2">
                <p className="text-sm font-semibold">
                  {formatDamageType(d.damageType)} · {d.severity}
                </p>
                {d.locationLabel && (
                  <p className="text-xs text-muted-foreground">{d.locationLabel}</p>
                )}
                {d.rentalImpact && d.rentalImpact !== 'NONE' && (
                  <StatusChip tone="watch" className="mt-1">
                    {d.rentalImpact}
                  </StatusChip>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

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

      {/* Tire */}
      <SectionCard
        title="Reifenprofil"
        action={
          <button
            type="button"
            onClick={() =>
              openSheet({
                type: 'tire-measure',
                vehicleId,
                vehicleLabel: label,
                bookingId: data.bookingContext?.bookingId ?? undefined,
                onSuccess: () => void data.reloadDetails(),
              })
            }
            className="text-xs font-semibold text-[color:var(--brand-ink)]"
          >
            Messung eintragen
          </button>
        }
      >
        {data.tireLoading ? (
          <SkeletonRows rows={1} />
        ) : !data.tireSummary ? (
          <p className="text-sm text-muted-foreground">Keine Reifendaten.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <InfoTile
              label="Letzte Messung"
              value={formatOperatorDateTime(
                data.tireSummary.lastMeasurementAt ?? data.tireSummary.latestMeasurementAt,
              )}
            />
            <InfoTile
              label="Profil (min.)"
              value={tireLowestTreadLabel(data.tireSummary)}
            />
            <InfoTile
              label="Status"
              value={tireUiStatusLabel(data.tireSummary)}
            />
            <InfoTile
              label="Restlaufzeit"
              value={tireRemainingKmLabel(data.tireSummary)}
            />
            <InfoTile
              label="Modus"
              value={data.tireSummary.displayMode ?? data.tireSummary.measurementState ?? '—'}
            />
          </div>
        )}
      </SectionCard>

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

      {/* Tool actions */}
      <div className="grid gap-2">
        <ActionButton
          icon={<ShieldAlert className="h-4 w-4" />}
          title="Schaden aufnehmen"
          subtitle="Foto, Typ & Position"
          highlight
          onClick={() =>
            openDamageCapture({
              vehicleId,
              vehicleName: vehicle.model,
              plate: vehicle.license,
              bookingId: data.bookingContext?.bookingId ?? undefined,
              skipVehicleConfirm: true,
            })
          }
        />
        <ActionButton
          icon={<Sparkles className="h-4 w-4" />}
          title="AI Upload"
          subtitle="Dokument scannen & bestätigen"
          onClick={() =>
            openSheet({
              type: 'ai-upload',
              vehicleId,
              vehicleLabel: label,
              bookingId: data.bookingContext?.bookingId ?? undefined,
              contextMode: 'vehicle',
            })
          }
        />
        <ActionButton
          icon={<Disc3 className="h-4 w-4" />}
          title="Reifenprofil messen"
          subtitle="Profiltiefe erfassen"
          onClick={() =>
            openSheet({
              type: 'tire-measure',
              vehicleId,
              vehicleLabel: label,
              onSuccess: () => void data.reloadDetails(),
            })
          }
        />
        <ActionButton
          icon={<ListTodo className="h-4 w-4" />}
          title="Aufgabe erstellen"
          subtitle="Operative Aufgabe am Fahrzeug"
          onClick={() =>
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
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value}</p>
    </div>
  );
}

function ActionButton({
  icon,
  title,
  subtitle,
  onClick,
  highlight,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`sq-press flex min-h-[48px] items-center gap-3 rounded-xl border px-4 text-left ${
        highlight
          ? 'border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)]/50'
          : 'border-border/60 surface-premium'
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
          highlight
            ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="text-[11px] text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}
