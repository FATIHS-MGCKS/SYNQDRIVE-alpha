import type { HandoverDialogKind } from '../components/handover/HandoverProtocolDialog';

export interface HandoverVehicleTelemetryLike {
  isElectric?: boolean;
  odometerKm?: number | null;
  odometer?: number | null;
  fuelPercent?: number | null;
  evSoc?: number | null;
  fuel?: number | null;
}

export interface HandoverTelemetryPrefill {
  odometerKm: string;
  fuelPercent: number;
  fuelFull: boolean;
  odometerFromTelemetry: boolean;
  fuelFromTelemetry: boolean;
}

export function resolveVehicleOdometerKm(
  vehicle: HandoverVehicleTelemetryLike | null | undefined,
): number | null {
  if (!vehicle) return null;
  if (vehicle.odometerKm != null && Number.isFinite(vehicle.odometerKm) && vehicle.odometerKm > 0) {
    return Math.round(vehicle.odometerKm);
  }
  if (vehicle.odometer != null && Number.isFinite(vehicle.odometer) && vehicle.odometer > 0) {
    return Math.round(vehicle.odometer);
  }
  return null;
}

export function resolveVehicleFuelState(
  vehicle: HandoverVehicleTelemetryLike | null | undefined,
): { fuelPercent: number; fuelFull: boolean; fromTelemetry: boolean } {
  const isElectric = Boolean(vehicle?.isElectric);
  let raw: number | null = null;

  if (isElectric) {
    raw = vehicle?.evSoc ?? null;
  } else {
    raw = vehicle?.fuelPercent ?? vehicle?.fuel ?? null;
  }

  if (raw == null || !Number.isFinite(raw)) {
    return { fuelPercent: 100, fuelFull: true, fromTelemetry: false };
  }

  const clamped = Math.max(0, Math.min(100, Math.round(raw)));
  return { fuelPercent: clamped, fuelFull: clamped >= 98, fromTelemetry: true };
}

export function buildHandoverTelemetryPrefill(input: {
  kind: HandoverDialogKind;
  vehicle: HandoverVehicleTelemetryLike | null | undefined;
  pickupOdometerKm?: number | null;
}): HandoverTelemetryPrefill {
  const liveOdo = resolveVehicleOdometerKm(input.vehicle);
  const pickupKm =
    input.pickupOdometerKm != null && Number.isFinite(input.pickupOdometerKm)
      ? Math.round(input.pickupOdometerKm)
      : null;

  let resolvedOdo: number | null = null;
  if (input.kind === 'RETURN') {
    if (pickupKm != null && liveOdo != null) resolvedOdo = Math.max(pickupKm, liveOdo);
    else resolvedOdo = liveOdo ?? pickupKm;
  } else {
    resolvedOdo = liveOdo;
  }

  const fuel = resolveVehicleFuelState(input.vehicle);

  return {
    odometerKm: resolvedOdo != null ? String(resolvedOdo) : '',
    fuelPercent: fuel.fuelPercent,
    fuelFull: fuel.fuelFull,
    odometerFromTelemetry: liveOdo != null,
    fuelFromTelemetry: fuel.fromTelemetry,
  };
}

export function mapTelemetryApiToHandoverVehicle(
  row: Record<string, unknown> | null | undefined,
  fleetVehicle: HandoverVehicleTelemetryLike | null,
): HandoverVehicleTelemetryLike {
  const isElectric = Boolean(
    fleetVehicle?.isElectric ??
      (typeof row?.fuelType === 'string' && row.fuelType.toLowerCase().includes('electric')),
  );

  const odometerKm =
    typeof row?.odometerKm === 'number'
      ? row.odometerKm
      : typeof row?.odometer === 'number' && row.odometer > 0
        ? row.odometer
        : null;

  const fuelPercent =
    typeof row?.fuelPercent === 'number'
      ? row.fuelPercent
      : typeof row?.fuel === 'number' && !isElectric
        ? row.fuel
        : null;

  const evSoc =
    typeof row?.evSoc === 'number'
      ? row.evSoc
      : typeof row?.battery === 'number' && isElectric
        ? row.battery
        : null;

  return {
    isElectric,
    odometerKm,
    fuelPercent,
    evSoc,
    odometer: typeof row?.odometer === 'number' ? row.odometer : null,
    fuel: typeof row?.fuel === 'number' ? row.fuel : null,
  };
}
