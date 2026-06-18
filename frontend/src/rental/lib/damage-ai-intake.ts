import type {
  CreateVehicleDamageInput,
  DamageEvidenceStatus,
  DamageLocationView,
  DamageRentalImpact,
  DamageSeverity,
} from './damage.types';

/** Minimum model confidence (0–1) below which UI shows “Low confidence”. */
export const AI_DAMAGE_LOW_CONFIDENCE_THRESHOLD = 0.55;

export const AI_DAMAGE_CONFIRMATION_WARNING =
  'Needs operator confirmation — suggestions are not saved until you confirm.';

/**
 * Feature gate — default off. Set `VITE_DAMAGE_AI_INTAKE_ENABLED=true` only when
 * the exterior analysis backend is deployed. No client-side fake suggestions.
 */
export function isDamageAiIntakeEnabled(): boolean {
  return import.meta.env.VITE_DAMAGE_AI_INTAKE_ENABLED === 'true';
}

export interface AiDamageImageRef {
  view: DamageLocationView;
  fileName?: string;
  /** Client preview URL or storage ref from analysis response */
  previewUrl?: string;
}

export interface AiDamageSuggestion {
  id: string;
  suggestedDamageType: string;
  suggestedSeverity: DamageSeverity;
  suggestedLocationView: DamageLocationView;
  suggestedLocationX: number | null;
  suggestedLocationY: number | null;
  suggestedLocationLabel: string | null;
  suggestedDescription: string | null;
  confidence: number;
  suggestedRentalImpact: DamageRentalImpact;
  suggestedEvidenceStatus: DamageEvidenceStatus;
  imageRefs: AiDamageImageRef[];
  warning: string;
}

export interface AnalyzeExteriorPhotosResponse {
  suggestions: AiDamageSuggestion[];
  warning: string;
}

export interface EditableAiDamageSuggestion extends AiDamageSuggestion {
  accepted: boolean;
  rejected: boolean;
}

export function isLowConfidenceSuggestion(confidence: number): boolean {
  return confidence < AI_DAMAGE_LOW_CONFIDENCE_THRESHOLD;
}

export function normalizeSuggestionCoords(
  x: number | null | undefined,
  y: number | null | undefined,
): { locationX: number | null; locationY: number | null } {
  const valid = (n: number | null | undefined) =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
  if (!valid(x) || !valid(y)) {
    return { locationX: null, locationY: null };
  }
  return {
    locationX: Math.round(x! * 10) / 10,
    locationY: Math.round(y! * 10) / 10,
  };
}

/** Maps an operator-confirmed suggestion to a real damage create payload. */
export function suggestionToCreateInput(
  suggestion: Pick<
    EditableAiDamageSuggestion,
    | 'suggestedDamageType'
    | 'suggestedSeverity'
    | 'suggestedLocationView'
    | 'suggestedLocationX'
    | 'suggestedLocationY'
    | 'suggestedLocationLabel'
    | 'suggestedDescription'
    | 'suggestedRentalImpact'
  >,
): CreateVehicleDamageInput {
  const { locationX, locationY } = normalizeSuggestionCoords(
    suggestion.suggestedLocationX,
    suggestion.suggestedLocationY,
  );
  const hasPin =
    suggestion.suggestedLocationView !== 'UNKNOWN' && locationX != null && locationY != null;

  return {
    damageType: suggestion.suggestedDamageType,
    severity: suggestion.suggestedSeverity,
    description: suggestion.suggestedDescription ?? undefined,
    locationView: hasPin ? suggestion.suggestedLocationView : 'UNKNOWN',
    locationX: hasPin ? locationX! : undefined,
    locationY: hasPin ? locationY! : undefined,
    locationLabel: suggestion.suggestedLocationLabel ?? undefined,
    rentalImpact: suggestion.suggestedRentalImpact,
    source: 'AI_UPLOAD',
    liabilityStatus: 'NEEDS_REVIEW',
  };
}

export function toEditableSuggestion(s: AiDamageSuggestion): EditableAiDamageSuggestion {
  return {
    ...s,
    accepted: true,
    rejected: false,
  };
}
