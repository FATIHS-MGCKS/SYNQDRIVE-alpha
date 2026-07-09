import { useMemo } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Car,
  Disc3,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { StatusChip } from '../../components/patterns';
import type { VehicleData } from '../../rental/data/vehicles';
import type { VehicleHealthResponse } from '../../lib/api';
import { useFleetVehicles } from '../../rental/FleetContext';
import { useOperatorDamageCapture } from '../damages/OperatorDamageCaptureProvider';
import { useOperatorHandover } from '../handover/OperatorHandoverProvider';
import { useOperatorData } from '../context/OperatorDataContext';
import { useOperatorShell } from '../context/OperatorShellContext';
import {
  deriveOperatorVehicleStatusSnapshot,
  isHealthKnownForVehicle,
} from '../lib/operatorVehicleQuickView.utils';
import { mapPickupRow, mapReturnRow, toHandoverBookingSeed } from '../lib/operatorData';
import { deriveVehicleOperatorStatuses } from '../lib/operatorStatus';
import { OperatorGlassCard } from './OperatorGlassCard';
import { OperatorStatusRow } from './OperatorStatusChip';

interface Props {
  vehicle: VehicleData;
  health?: VehicleHealthResponse | null;
  openTaskCount?: number;
  onOpenVehicle: () => void;
}

export function OperatorScanVehicleCard({
  vehicle,
  health,
  openTaskCount = 0,
  onOpenVehicle,
}: Props) {
  const { openSheet } = useOperatorShell();
  const { openHandover } = useOperatorHandover();
  const { openDamageCapture } = useOperatorDamageCapture();
  const { pickups, returns } = useOperatorData();
  const { healthMap, healthLoading, healthError } = useFleetVehicles();

  const healthKnown = isHealthKnownForVehicle(
    vehicle.id,
    healthMap,
    healthLoading,
    healthError,
  );
  const snapshot = deriveOperatorVehicleStatusSnapshot(vehicle, health ?? null, healthKnown);
  const badges = deriveVehicleOperatorStatuses(vehicle, health ?? undefined, openTaskCount);
  const label = [vehicle.model, vehicle.license].filter(Boolean).join(' · ');

  const pickupItem = useMemo(() => {
    const row = pickups.find((p) => String(p.vehicleId) === vehicle.id);
    if (!row) return null;
    const nowMs = row.startDate ? new Date(row.startDate).getTime() : 0;
    return mapPickupRow(row, healthMap, 'de', nowMs);
  }, [pickups, vehicle.id, healthMap]);

  const returnItem = useMemo(() => {
    const row = returns.find((r) => String(r.vehicleId) === vehicle.id);
    if (!row) return null;
    const nowMs = row.endDate ? new Date(row.endDate).getTime() : 0;
    return mapReturnRow(row, 'de', nowMs);
  }, [returns, vehicle.id]);

  const bookingHint =
    pickupItem && !pickupItem.isDone
      ? `Pickup heute · ${pickupItem.customerName}`
      : returnItem && !returnItem.isDone
        ? `Return heute · ${returnItem.customerName}`
        : null;

  return (
    <OperatorGlassCard className="overflow-hidden p-0">
      <button
        type="button"
        onClick={onOpenVehicle}
        className="sq-press w-full px-4 py-3 text-left"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]">
            <Car className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <p className="text-base font-bold text-foreground">{vehicle.license || '—'}</p>
            <p className="truncate text-sm text-muted-foreground">{vehicle.model}</p>
            {vehicle.station && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{vehicle.station}</p>
            )}
            {bookingHint && (
              <p className="mt-1 text-xs font-medium text-[color:var(--brand-ink)]">{bookingHint}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {snapshot && (
                <StatusChip tone={snapshot.releaseTone} dot>
                  {snapshot.releaseLabel}
                </StatusChip>
              )}
              <OperatorStatusRow badges={badges} />
            </div>
          </span>
        </div>
      </button>

      <div className="grid grid-cols-2 gap-px border-t border-border/50 bg-border/50 sm:grid-cols-3">
        <ScanAction label="Fahrzeug" onClick={onOpenVehicle} />
        {pickupItem && !pickupItem.isDone && (
          <ScanAction
            label="Pickup"
            icon={<ArrowUpRight className="h-4 w-4" />}
            disabled={!pickupItem.pickupGate.allowed}
            title={pickupItem.pickupGate.reason}
            onClick={() =>
              openHandover({
                bookingId: pickupItem.bookingId,
                kind: 'PICKUP',
                booking: toHandoverBookingSeed(pickupItem),
              })
            }
          />
        )}
        {returnItem && !returnItem.isDone && (
          <ScanAction
            label="Return"
            icon={<ArrowDownLeft className="h-4 w-4" />}
            disabled={!returnItem.returnGate.allowed}
            title={returnItem.returnGate.reason}
            onClick={() =>
              openHandover({
                bookingId: returnItem.bookingId,
                kind: 'RETURN',
                booking: toHandoverBookingSeed(returnItem),
              })
            }
          />
        )}
        <ScanAction
          label="Schaden"
          icon={<ShieldAlert className="h-4 w-4" />}
          onClick={() =>
            openDamageCapture({
              vehicleId: vehicle.id,
              vehicleName: vehicle.model,
              plate: vehicle.license,
              bookingId: pickupItem?.bookingId ?? returnItem?.bookingId,
              skipVehicleConfirm: true,
            })
          }
        />
        <ScanAction
          label="AI Upload"
          icon={<Sparkles className="h-4 w-4" />}
          onClick={() =>
            openSheet({
              type: 'ai-upload',
              vehicleId: vehicle.id,
              vehicleLabel: label,
              bookingId: pickupItem?.bookingId ?? returnItem?.bookingId,
              contextMode: 'vehicle',
            })
          }
        />
        <ScanAction
          label="Reifen"
          icon={<Disc3 className="h-4 w-4" />}
          onClick={() =>
            openSheet({
              type: 'tire-measure',
              vehicleId: vehicle.id,
              vehicleLabel: label,
              bookingId: pickupItem?.bookingId ?? returnItem?.bookingId,
            })
          }
        />
      </div>
    </OperatorGlassCard>
  );
}

function ScanAction({
  label,
  icon,
  onClick,
  disabled,
  title,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="sq-press flex min-h-[48px] flex-col items-center justify-center gap-1 surface-premium px-2 py-2 text-[11px] font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-45"
    >
      {icon}
      {label}
    </button>
  );
}
