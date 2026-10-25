import type { TranslationKey } from '../../i18n/translations/en';

export type MotionPhysicsEvidenceTierUi = 'ESTIMATED' | 'CONFIRMED' | 'VERIFIED' | null;

export type ConnectedVehicleTechnicalSpecsView = {
  make: string;
  model: string;
  year: number | null;
  fuelType: string;
  curbWeightKg: number | null;
  systemMotorPowerKw: number | null;
  accel0To100S: number | null;
  variantAssumption: string | null;
};

export function motionPhysicsEvidenceTierLabelKey(
  tier: MotionPhysicsEvidenceTierUi,
): TranslationKey {
  if (tier === 'VERIFIED') return 'master.motionPhysics.evidence.verified';
  if (tier === 'CONFIRMED') return 'master.motionPhysics.evidence.confirmed';
  if (tier === 'ESTIMATED') return 'master.motionPhysics.evidence.estimated';
  return 'master.cv.technicalSpecs.noReference';
}

export function formatSpecsNumber(value: number | null | undefined, suffix = ''): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value}${suffix}`;
}

export function buildTechnicalSpecsView(input: {
  make?: string | null;
  model?: string | null;
  year?: number | null;
  fuelType?: string | null;
  curbWeight?: string | number | null;
  systemMotorPowerKw?: string | number | null;
  accel0To100S?: string | number | null;
  variantAssumption?: string | null;
  motionReference?: {
    curbMassKg?: number | null;
    systemMotorPowerKw?: number | null;
    accel0To100S?: number | null;
    variantAssumption?: string | null;
  } | null;
}): ConnectedVehicleTechnicalSpecsView {
  const parseNum = (raw: string | number | null | undefined): number | null => {
    if (raw == null || raw === '') return null;
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  const ref = input.motionReference;
  const curbFromVehicle = parseNum(input.curbWeight);
  const curbFromRef = ref?.curbMassKg ?? null;

  return {
    make: input.make?.trim() || '—',
    model: input.model?.trim() || '—',
    year: input.year ?? null,
    fuelType: input.fuelType?.trim() || '—',
    curbWeightKg: curbFromVehicle ?? curbFromRef,
    systemMotorPowerKw:
      parseNum(input.systemMotorPowerKw) ?? ref?.systemMotorPowerKw ?? null,
    accel0To100S: parseNum(input.accel0To100S) ?? ref?.accel0To100S ?? null,
    variantAssumption:
      input.variantAssumption?.trim() || ref?.variantAssumption?.trim() || null,
  };
}
