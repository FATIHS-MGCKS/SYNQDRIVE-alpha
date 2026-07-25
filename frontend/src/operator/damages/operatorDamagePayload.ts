import type {
  CreateVehicleDamageInput,
  DamageLocationView,
  DamageRentalImpact,
  DamageSeverity,
} from '../../rental/lib/damage.types';
import { DESCRIPTION_MAX_LENGTH } from '../../rental/lib/damage.types';
import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import type { OperatorDamageCaptureSource } from '../lib/operatorData.types';

export type OperatorDamageCaptureStep = 'vehicle' | 'photos' | 'details' | 'review';

export const OPERATOR_DAMAGE_CAPTURE_STEPS: OperatorDamageCaptureStep[] = [
  'vehicle',
  'photos',
  'details',
  'review',
];

export interface OperatorDamageLocationChip {
  id: string;
  label: string;
  locationView: DamageLocationView;
  defaultLocationLabel?: string;
  suggestDamageType?: string;
}

export const OPERATOR_DAMAGE_LOCATION_CHIPS: OperatorDamageLocationChip[] = [
  { id: 'front', label: 'Front', locationView: 'FRONT' },
  { id: 'rear', label: 'Heck', locationView: 'REAR' },
  { id: 'left', label: 'Links', locationView: 'LEFT' },
  { id: 'right', label: 'Rechts', locationView: 'RIGHT' },
  { id: 'roof', label: 'Dach', locationView: 'ROOF' },
  {
    id: 'interior',
    label: 'Innenraum',
    locationView: 'UNKNOWN',
    defaultLocationLabel: 'Innenraum',
    suggestDamageType: 'INTERIOR_DAMAGE',
  },
  {
    id: 'tire',
    label: 'Reifen/Felge',
    locationView: 'UNKNOWN',
    defaultLocationLabel: 'Reifen/Felge',
    suggestDamageType: 'TIRE_DAMAGE',
  },
];

export interface OperatorDamageFormState {
  damageType: string;
  severity: DamageSeverity;
  rentalImpact: DamageRentalImpact;
  description: string;
  locationChipId: string | null;
  locationView: DamageLocationView;
  locationLabel: string;
}

export const DEFAULT_OPERATOR_DAMAGE_FORM: OperatorDamageFormState = {
  damageType: 'SCRATCH',
  severity: 'MODERATE',
  rentalImpact: 'WATCH',
  description: '',
  locationChipId: null,
  locationView: 'UNKNOWN',
  locationLabel: '',
};

export function resolveOperatorDamageSource(
  explicit?: OperatorDamageCaptureSource,
  handoverKind?: HandoverDialogKind,
): OperatorDamageCaptureSource {
  if (explicit) return explicit;
  if (handoverKind === 'PICKUP') return 'pickup';
  if (handoverKind === 'RETURN') return 'return';
  return 'operator_inspection';
}

/** @deprecated use resolveOperatorDamageSource — kept for legacy payload builder tests */
export function resolveDamageSource(
  explicit?: OperatorDamageCaptureSource,
  handoverKind?: HandoverDialogKind,
): OperatorDamageCaptureSource {
  return resolveOperatorDamageSource(explicit, handoverKind);
}

export function applyLocationChip(
  form: OperatorDamageFormState,
  chip: OperatorDamageLocationChip,
): OperatorDamageFormState {
  const next: OperatorDamageFormState = {
    ...form,
    locationChipId: chip.id,
    locationView: chip.locationView,
    locationLabel: chip.defaultLocationLabel ?? form.locationLabel,
  };
  if (chip.suggestDamageType && form.damageType === 'SCRATCH') {
    next.damageType = chip.suggestDamageType;
  }
  return next;
}

export function validateOperatorDamageStep(
  step: OperatorDamageCaptureStep,
  form: OperatorDamageFormState,
  photoCount: number,
): string | null {
  if (step === 'photos' && photoCount === 0) {
    return 'Mindestens ein Foto aufnehmen oder hochladen.';
  }
  if (step === 'details') {
    if (!form.damageType) return 'Schadenstyp wählen.';
    if (!form.severity) return 'Schweregrad wählen.';
    if (form.description.length > DESCRIPTION_MAX_LENGTH) {
      return `Beschreibung max. ${DESCRIPTION_MAX_LENGTH} Zeichen.`;
    }
  }
  return null;
}

export function buildOperatorDamageCaptureBody(
  form: OperatorDamageFormState,
  ctx: {
    captureKey: string;
    source: OperatorDamageCaptureSource;
    bookingId?: string;
    customerId?: string;
    reportedBy?: string;
    images: { imageData: string; caption?: string }[];
  },
) {
  const locationLabel = form.locationLabel.trim() || undefined;
  return {
    captureKey: ctx.captureKey,
    source: ctx.source,
    damageType: form.damageType,
    severity: form.severity,
    rentalImpact: form.rentalImpact,
    description: form.description.trim() || undefined,
    locationView: form.locationView,
    locationLabel,
    bookingId: ctx.bookingId,
    customerId: ctx.customerId,
    reportedBy: ctx.reportedBy,
    images: ctx.images,
  };
}

export function buildOperatorDamagePayload(
  form: OperatorDamageFormState,
  ctx: {
    source: OperatorDamageCaptureSource;
    bookingId?: string;
    customerId?: string;
    reportedBy?: string;
    images: { imageData: string; caption?: string }[];
  },
): CreateVehicleDamageInput {
  const locationLabel = form.locationLabel.trim() || undefined;
  const canonicalSource =
    ctx.source === 'pickup'
      ? 'PICKUP_HANDOVER'
      : ctx.source === 'return'
        ? 'RETURN_HANDOVER'
        : ctx.source === 'manual'
          ? 'MANUAL'
          : 'INSPECTION';
  return {
    damageType: form.damageType,
    severity: form.severity,
    rentalImpact: form.rentalImpact,
    source: canonicalSource,
    description: form.description.trim() || undefined,
    locationView: form.locationView,
    locationLabel,
    bookingId: ctx.bookingId,
    customerId: ctx.customerId,
    reportedBy: ctx.reportedBy,
    ...(ctx.images.length ? { images: ctx.images } : {}),
  };
}
