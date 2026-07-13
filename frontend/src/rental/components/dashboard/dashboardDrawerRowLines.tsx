import { cn } from '../../../components/ui/utils';
import type { VehicleData } from '../../data/vehicles';
import { getShortModel } from '../../data/vehicles';
import type { VehicleRuntimeState } from './runtime';

export function parseDrawerCustomerName(subtitle: string | undefined): string | undefined {
  if (!subtitle?.trim()) return undefined;
  const match = subtitle.trim().match(/^(?:Kunde|Customer):\s*(.+)$/i);
  return (match?.[1] ?? subtitle).trim() || undefined;
}

export function formatDrawerBnrLabel(bookingRef: string | undefined): string | undefined {
  const ref = bookingRef?.trim();
  return ref ? `BNR: ${ref}` : undefined;
}

function fleetVehicleTitle(v: VehicleData): string {
  const model = typeof v.model === 'string' ? v.model : '';
  const shortModel = model ? getShortModel(model) : '';
  return [v.make, shortModel, v.year].filter(Boolean).join(' ') || model || '';
}

function runtimeVehicleModelLine(state: VehicleRuntimeState): string | undefined {
  const license = (state.license ?? '').trim();
  let remainder = state.displayName.trim();
  if (license) {
    const licensePrefix = new RegExp(`^${license.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(·|-)?\\s*`, 'i');
    remainder = remainder.replace(licensePrefix, '').trim();
  }
  return remainder || undefined;
}

export function normalizeDrawerMetaKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function drawerVehicleMetaKey(vehicleLine: { plate: string; model?: string } | null): string {
  if (!vehicleLine) return '';
  return normalizeDrawerMetaKey(
    [vehicleLine.plate, vehicleLine.model].filter(Boolean).join(' · '),
  );
}

export function resolveDrawerVehiclePlateModel(input: {
  vehicle?: VehicleData;
  runtimeState?: VehicleRuntimeState;
  metaFallback?: string;
}): { plate: string; model?: string } | null {
  if (input.vehicle?.license?.trim()) {
    const model = fleetVehicleTitle(input.vehicle);
    return {
      plate: input.vehicle.license.trim(),
      ...(model ? { model } : {}),
    };
  }

  if (input.runtimeState?.license?.trim()) {
    const model = runtimeVehicleModelLine(input.runtimeState);
    return {
      plate: input.runtimeState.license.trim(),
      ...(model ? { model } : {}),
    };
  }

  const meta = input.metaFallback?.trim();
  if (!meta) return null;

  const separator = meta.includes(' · ') ? ' · ' : meta.includes(' - ') ? ' - ' : null;
  if (separator) {
    const [plate, ...rest] = meta.split(separator);
    const model = rest.join(separator).trim();
    return {
      plate: plate.trim(),
      ...(model ? { model } : {}),
    };
  }

  return { plate: meta };
}

export interface DrawerCustomerBnrRowProps {
  subtitle?: string;
  customerName?: string;
  bookingRef?: string;
  de: boolean;
  className?: string;
}

/** Single row: customer left, abbreviated booking ref right. */
export function DrawerCustomerBnrRow({
  subtitle,
  customerName,
  bookingRef,
  de,
  className,
}: DrawerCustomerBnrRowProps) {
  const customer = customerName ?? parseDrawerCustomerName(subtitle);
  const bnr = formatDrawerBnrLabel(bookingRef);
  if (!customer && !bnr) return null;

  return (
    <div className={cn('flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground', className)}>
      {customer ? (
        <p className="min-w-0 truncate">
          {de ? 'Kunde:' : 'Customer:'} {customer}
        </p>
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      {bnr ? <p className="shrink-0 whitespace-nowrap tabular-nums">{bnr}</p> : null}
    </div>
  );
}

export interface DrawerVehiclePlateModelRowProps {
  plate: string;
  model?: string;
  className?: string;
}

export function DrawerVehiclePlateModelRow({ plate, model, className }: DrawerVehiclePlateModelRowProps) {
  return (
    <p className={cn('flex min-w-0 items-baseline gap-1.5 text-[10.5px]', className)}>
      <span className="shrink-0 font-bold tabular-nums tracking-[-0.01em] text-foreground">{plate}</span>
      {model ? <span className="truncate text-muted-foreground">{model}</span> : null}
    </p>
  );
}

export const drawerRowActionStackClassName = 'mt-auto flex w-[8.5rem] flex-col items-stretch gap-1';
