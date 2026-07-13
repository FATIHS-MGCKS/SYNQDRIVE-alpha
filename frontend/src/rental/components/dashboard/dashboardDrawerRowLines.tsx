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

/** Single row: customer then BNR directly adjacent on the left. */
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
    <span className={cn('inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 text-[10.5px] leading-snug text-muted-foreground', className)}>
      {customer ? (
        <span className="shrink-0">
          {de ? 'Kunde:' : 'Customer:'} {customer}
        </span>
      ) : null}
      {bnr ? <span className="shrink-0 whitespace-nowrap tabular-nums">{bnr}</span> : null}
    </span>
  );
}

export interface DrawerVehiclePlateModelRowProps {
  plate: string;
  model?: string;
  className?: string;
}

export function DrawerVehiclePlateModelRow({ plate, model, className }: DrawerVehiclePlateModelRowProps) {
  return (
    <p className={cn('whitespace-nowrap text-[10.5px] leading-snug', className)}>
      <span className="font-bold tabular-nums tracking-[-0.01em] text-foreground">{plate}</span>
      {model ? <span className="text-muted-foreground"> {model}</span> : null}
    </p>
  );
}

export const drawerRowActionWidthClassName = 'w-[8.5rem]';

export const drawerRowActionStackClassName =
  'flex shrink-0 flex-col items-stretch gap-1 self-end';
