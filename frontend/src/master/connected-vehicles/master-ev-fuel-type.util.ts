/** Normalized electrified fuel labels for Master Connected Vehicles HV section. */
export function isMasterElectrifiedFuelType(fuelType: string | undefined | null): boolean {
  const fuel = String(fuelType ?? '').trim().toLowerCase();
  if (!fuel) return false;
  return (
    fuel === 'electric' ||
    fuel === 'electrical' ||
    fuel === 'ev' ||
    fuel.includes('plugin') ||
    fuel.includes('plug-in') ||
    fuel.includes('phev') ||
    fuel === 'hybrid' ||
    fuel.includes('hybrid')
  );
}
