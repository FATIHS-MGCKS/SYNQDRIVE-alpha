import type {
  RentalHealthModule,
  TireRentalHealthReadModel,
  VehicleHealthResponse,
} from '../../lib/api';

/** Whether rental health exposes evidence-based tire hard block. */
export function isTireRentalHardBlockedFromHealth(
  health: VehicleHealthResponse | null | undefined,
): boolean {
  const model = health?.modules?.tires?.tire_read_model;
  if (!model) return false;
  return (
    model.rentalBlockingEvidence?.action === 'HARD_BLOCK' &&
    model.activeReviewOverride == null
  );
}

export function getTireRentalReadModel(
  tires: RentalHealthModule | undefined,
): TireRentalHealthReadModel | null {
  return tires?.tire_read_model ?? null;
}

export function tireEvidenceTypeLabel(
  tires: RentalHealthModule | undefined,
): string {
  const model = getTireRentalReadModel(tires);
  if (!model) return 'Unbekannt';
  switch (model.evidenceType) {
    case 'measured':
      return 'Gemessen';
    case 'estimated':
      return 'Geschätzt';
    case 'provider':
      return 'Fahrzeugsignal';
    default:
      return 'Unbekannt';
  }
}

export function tireReviewRequirementLabel(
  model: TireRentalHealthReadModel | null,
): string | null {
  if (!model) return null;
  switch (model.reviewRequirement) {
    case 'MEASUREMENT_REQUIRED':
      return 'Messung erforderlich';
    case 'REVIEW_REQUIRED':
      return 'Prüfung erforderlich';
    default:
      return null;
  }
}

export function summarizeTireRentalHealthForUi(
  health: VehicleHealthResponse | null | undefined,
): {
  blocked: boolean;
  reviewLabel: string | null;
  evidenceLabel: string;
  reasonCodes: string[];
  blockingMessage: string | null;
} {
  const tires = health?.modules?.tires;
  const model = getTireRentalReadModel(tires);
  return {
    blocked: isTireRentalHardBlockedFromHealth(health),
    reviewLabel: tireReviewRequirementLabel(model),
    evidenceLabel: tireEvidenceTypeLabel(tires),
    reasonCodes: model?.structuredReasonCodes ?? [],
    blockingMessage: model?.rentalBlockingEvidence?.message ?? null,
  };
}
