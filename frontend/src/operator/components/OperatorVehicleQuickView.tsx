import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarPlus,
  Disc3,
  ListTodo,
  Loader2,
  Plus,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { PriorityBadge, SkeletonRows, StatusChip } from '../../components/patterns';
import { formatDamageType } from '../../rental/lib/damage.types';
import { resolveFleetVehicleDisplayState } from '../../rental/lib/fleetVehicleDisplay';
import { VehicleOperationalStatusCallout } from '../../rental/components/fleet/VehicleOperationalStatusCallout';
import { useOperatorHandover } from '../handover/OperatorHandoverProvider';
import { useOperatorDamageCapture } from '../damages/OperatorDamageCaptureProvider';
import { useOperatorVehicleQuickViewData } from '../hooks/useOperatorVehicleQuickViewData';
import {
  formatModuleRow,
  formatOperatorDateTime,
  HEALTH_MODULE_LABELS,
  RENTAL_HEALTH_STATE_LABELS,
} from '../lib/operatorVehicleQuickView.utils';
import { toHandoverBookingSeed } from '../lib/operatorData';
import { OperatorGlassCard } from './OperatorGlassCard';
import { useOperatorShell } from '../context/OperatorShellContext';
import type { ApiTask } from '../../lib/api';
import { taskStatusLabelDe, taskStatusTone } from '../../rental/lib/task-detail.utils';

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
    return (
      <OperatorGlassCard className="p-4">
        <p className="text-sm text-muted-foreground">Fahrzeug nicht gefunden.</p>
      </OperatorGlassCard>
    );
  }

  const vehicle = data.vehicle;
  const label = [vehicle.model, vehicle.license].filter(Boolean).join(' · ');
  const fleetDisplay = resolveFleetVehicleDisplayState(vehicle, {
    rentalHealth: data.health,
    locale: 'de',
  });
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
      {/* Hero */}
      <OperatorGlassCard className="overflow-hidden p-0">
        <div className="bg-gradient-to-br from-[color:var(--brand-soft)]/80 to-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-display text-2xl font-bold tracking-tight text-foreground">
                {vehicle.license || '—'}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{vehicle.model}</p>
              {vehicle.station && (
                <p className="mt-1 truncate text-xs text-muted-foreground">{vehicle.station}</p>
              )}
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="sq-press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {snapshot && (
              <StatusChip tone={snapshot.primaryTone} dot>
                {snapshot.primaryLabel}
              </StatusChip>
            )}
            <StatusChip tone={fleetDisplay.statusBadge.tone}>
              {fleetDisplay.statusBadge.label}
            </StatusChip>
            {vehicle.cleaningStatus === 'Needs Cleaning' && (
              <StatusChip tone="watch">Reinigung offen</StatusChip>
            )}
          </div>

          {fleetDisplay.statusBadge.showUnreliableCallout ? (
            <div className="mt-3">
              <VehicleOperationalStatusCallout
                vehicle={vehicle}
                statusBadge={fleetDisplay.statusBadge}
                locale="de"
                onRefresh={() => void data.reloadDetails()}
                compact
              />
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Darf raus?
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              {data.healthLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : fleetDisplay.statusBadge.showUnreliableCallout ? (
                <span className="text-sm font-semibold text-muted-foreground">
                  {snapshot?.releaseLabel ?? 'Status nicht verfügbar'}
                </span>
              ) : (
                <>
                  <span
                    className={`text-xl font-bold ${
                      snapshot?.releaseTone === 'success'
                        ? 'text-[color:var(--status-success)]'
                        : snapshot?.releaseTone === 'critical'
                          ? 'text-[color:var(--status-critical)]'
                          : 'text-foreground'
                    }`}
                  >
                    {snapshot?.releaseLabel ?? '—'}
                  </span>
                  {data.health?.overall_state && (
                    <span className="text-xs text-muted-foreground">
                      Rental Health: {RENTAL_HEALTH_STATE_LABELS[data.health.overall_state]}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </OperatorGlassCard>

      {/* Quick actions */}
      <div className="grid gap-2">
        {pickupItem && (
          <button
            type="button"
            disabled={!data.pickupAction?.gate.allowed}
            onClick={openPickup}
            className="sq-press flex min-h-[52px] items-center gap-3 rounded-2xl border border-[color:var(--brand)]/30 bg-[color:var(--brand-soft)] px-4 text-left disabled:opacity-50"
          >
            <ArrowUpRight className="h-5 w-5 shrink-0 text-[color:var(--brand-ink)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Pickup starten</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {pickupItem.customerName}
                {!data.pickupAction?.gate.allowed && data.pickupAction?.gate.reason
                  ? ` · ${data.pickupAction.gate.reason}`
                  : ''}
              </span>
            </span>
          </button>
        )}
        {returnItem && (
          <button
            type="button"
            disabled={!data.returnAction?.gate.allowed}
            onClick={openReturn}
            className="sq-press flex min-h-[52px] items-center gap-3 rounded-2xl border border-border/60 surface-premium px-4 text-left disabled:opacity-50"
          >
            <ArrowDownLeft className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Return starten</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {returnItem.customerName}
                {!data.returnAction?.gate.allowed && data.returnAction?.gate.reason
                  ? ` · ${data.returnAction.gate.reason}`
                  : ''}
              </span>
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            openSheet({
              type: 'booking-create',
              prefillVehicleId: vehicle.id,
            })
          }
          className="sq-press flex min-h-[52px] items-center gap-3 rounded-2xl border border-border/60 surface-premium px-4 text-left"
        >
          <CalendarPlus className="h-5 w-5 shrink-0 text-[color:var(--brand-ink)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Buchung für dieses Fahrzeug</span>
            <span className="block truncate text-[11px] text-muted-foreground">{label}</span>
          </span>
        </button>
      </div>

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

      {/* Tasks */}
      <SectionCard
        title="Offene Aufgaben"
        action={
          <button
            type="button"
            onClick={() =>
              openSheet({
                type: 'task-create',
                vehicleId,
                vehicleLabel: label,
                bookingId: data.bookingContext?.bookingId ?? undefined,
                onSuccess: () => void data.reloadDetails(),
              })
            }
            className="sq-press inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-[10px] font-semibold"
          >
            <Plus className="h-3 w-3" />
            Neu
          </button>
        }
      >
        {data.extraTasksLoading && data.allOpenTasks.length === 0 ? (
          <SkeletonRows rows={2} />
        ) : data.allOpenTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine offenen Aufgaben.</p>
        ) : (
          <div className="space-y-2">
            {data.allOpenTasks.slice(0, 6).map((t) => (
              <OperatorTaskQuickRow
                key={t.id}
                task={t}
                onOpen={() =>
                  openSheet({
                    type: 'task-detail',
                    taskId: t.id,
                    task: t,
                    onUpdated: () => void data.reloadDetails(),
                  })
                }
              />
            ))}
          </div>
        )}
      </SectionCard>

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
              value={
                data.tireSummary.displayTreadMm != null
                  ? `${data.tireSummary.displayTreadMm.toFixed(1)} mm`
                  : data.tireSummary.lowestTreadMm != null
                    ? `${data.tireSummary.lowestTreadMm.toFixed(1)} mm`
                    : '—'
              }
            />
            <InfoTile
              label="Status"
              value={data.tireSummary.overallStatus ?? data.tireSummary.healthStatus ?? '—'}
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

function OperatorTaskQuickRow({ task, onOpen }: { task: ApiTask; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="sq-press w-full rounded-xl border border-border/50 px-3 py-2 text-left"
    >
      <p className="text-sm font-semibold text-foreground">{task.title}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <StatusChip tone={taskStatusTone(task.status, task.isOverdue)} dot>
          {task.isOverdue ? 'Überfällig' : taskStatusLabelDe(task.status)}
        </StatusChip>
        <PriorityBadge priority={task.priority} />
      </div>
    </button>
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
