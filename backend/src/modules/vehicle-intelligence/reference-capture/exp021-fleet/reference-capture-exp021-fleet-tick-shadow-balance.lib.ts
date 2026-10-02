import type { Exp021FleetOrderBalanceSnapshot } from './reference-capture-exp021-fleet.types';

export type Exp021FleetTickShadowBalance = {
  globalCounts: Record<string, number>;
  vehicleCounts: Record<string, Record<string, number>>;
};

export function createTickShadowBalance(): Exp021FleetTickShadowBalance {
  return { globalCounts: {}, vehicleCounts: {} };
}

export function mergeDurableAndTickShadowBalance(
  durable: Exp021FleetOrderBalanceSnapshot,
  shadow: Exp021FleetTickShadowBalance,
  vehicleId: string,
): Exp021FleetOrderBalanceSnapshot {
  const globalCounts = { ...durable.globalCounts };
  for (const [phaseOrderKey, count] of Object.entries(shadow.globalCounts)) {
    globalCounts[phaseOrderKey] = (globalCounts[phaseOrderKey] ?? 0) + count;
  }

  const vehicleCounts = { ...durable.vehicleCounts };
  for (const [phaseOrderKey, count] of Object.entries(shadow.vehicleCounts[vehicleId] ?? {})) {
    vehicleCounts[phaseOrderKey] = (vehicleCounts[phaseOrderKey] ?? 0) + count;
  }

  return { globalCounts, vehicleCounts };
}

export function recordTickShadowProposal(
  shadow: Exp021FleetTickShadowBalance,
  vehicleId: string,
  phaseOrderKey: string,
): void {
  shadow.globalCounts[phaseOrderKey] = (shadow.globalCounts[phaseOrderKey] ?? 0) + 1;
  const vehicleMap = shadow.vehicleCounts[vehicleId] ?? {};
  vehicleMap[phaseOrderKey] = (vehicleMap[phaseOrderKey] ?? 0) + 1;
  shadow.vehicleCounts[vehicleId] = vehicleMap;
}
