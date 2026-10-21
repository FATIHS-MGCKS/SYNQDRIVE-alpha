export type OnboardingPowertrainClass =
  | 'ICE'
  | 'BEV'
  | 'HYBRID'
  | 'PLUGIN_HYBRID'
  | 'OTHER'
  | 'UNKNOWN';

export function classifyPowertrainFromFuelType(
  fuelType: string | null | undefined,
): OnboardingPowertrainClass {
  if (!fuelType?.trim()) return 'UNKNOWN';
  const key = fuelType.trim().toUpperCase().replace(/-/g, '_').replace(/\s+/g, '');
  if (key === 'ELECTRIC' || key === 'EV' || key === 'BEV') return 'BEV';
  if (key === 'PLUGIN_HYBRID' || key === 'PHEV' || key === 'PLUGINHYBRID') return 'PLUGIN_HYBRID';
  if (key === 'HYBRID') return 'HYBRID';
  if (key === 'GASOLINE' || key === 'DIESEL' || key === 'PETROL' || key === 'GAS') return 'ICE';
  if (key === 'OTHER') return 'OTHER';
  return 'UNKNOWN';
}
