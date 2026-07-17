import type {
  RentalHealthModule,
  BrakeRentalHealthReadModel,
  VehicleHealthResponse,
} from '../../lib/api';

export function isBrakeRentalHardBlockedFromHealth(
  health: VehicleHealthResponse | null | undefined,
): boolean {
  const model = health?.modules?.brakes?.brake_read_model;
  if (!model) return false;
  return (
    model.rentalBlockingEvidence?.action === 'HARD_BLOCK' &&
    model.activeReviewOverride == null
  );
}

export function getBrakeRentalReadModel(
  brakes: RentalHealthModule | undefined,
): BrakeRentalHealthReadModel | null {
  return brakes?.brake_read_model ?? null;
}

export function brakeEvidenceTypeLabel(
  brakes: RentalHealthModule | undefined,
): string {
  const model = getBrakeRentalReadModel(brakes);
  if (!model) return 'Unbekannt';
  switch (model.evidenceType) {
    case 'measured':
      return 'Gemessen';
    case 'estimated':
      return 'Geschätzt';
    case 'document':
      return 'Dokumentiert';
    case 'sensor':
      return 'Sensor';
    default:
      return 'Unbekannt';
  }
}

export function brakeReviewRequirementLabel(
  model: BrakeRentalHealthReadModel | null,
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

export function summarizeBrakeRentalHealthForUi(
  health: VehicleHealthResponse | null | undefined,
): {
  blocked: boolean;
  reviewLabel: string | null;
  evidenceLabel: string;
  reasonCodes: string[];
  blockingMessage: string | null;
  rentalDecision: string | null;
} {
  const brakes = health?.modules?.brakes;
  const model = getBrakeRentalReadModel(brakes);
  return {
    blocked: isBrakeRentalHardBlockedFromHealth(health),
    reviewLabel: brakeReviewRequirementLabel(model),
    evidenceLabel: brakeEvidenceTypeLabel(brakes),
    reasonCodes: model?.structuredReasonCodes ?? [],
    blockingMessage: model?.rentalBlockingEvidence?.message ?? null,
    rentalDecision: model?.rentalDecision ?? null,
  };
}
