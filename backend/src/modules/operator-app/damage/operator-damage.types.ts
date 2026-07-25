import type { DamageLocationView, DamageRentalImpact, DamageSeverity } from '@prisma/client';

/** Operator-facing capture source — maps to canonical `DamageSource` server-side. */
export type OperatorDamageCaptureSource =
  | 'pickup'
  | 'return'
  | 'operator_inspection'
  | 'manual'
  | 'ai_suggestion';

export interface OperatorDamageImageInputDto {
  imageData: string;
  caption?: string;
}

export interface OperatorDamageCaptureRequestDto {
  captureKey: string;
  source: OperatorDamageCaptureSource;
  damageType: string;
  severity: DamageSeverity;
  rentalImpact?: DamageRentalImpact;
  description?: string;
  locationView?: DamageLocationView;
  locationX?: number;
  locationY?: number;
  locationLabel?: string;
  bookingId?: string;
  customerId?: string;
  stationId?: string;
  reportedBy?: string;
  images?: OperatorDamageImageInputDto[];
}

export interface OperatorDamageListItemDto {
  id: string;
  vehicleId: string;
  damageType: string;
  severity: string;
  status: string;
  source: string;
  operatorSource: OperatorDamageCaptureSource | null;
  description: string | null;
  locationView: string;
  locationLabel: string | null;
  rentalImpact: string;
  liabilityStatus: string;
  evidenceStatus: string;
  bookingId: string | null;
  customerId: string | null;
  handoverProtocolId: string | null;
  reportedBy: string | null;
  isFinal: boolean;
  isEditable: boolean;
  isKnownDamage: boolean;
  isAiSuggestion: boolean;
  imageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorDamageCaptureResultDto {
  damage: OperatorDamageListItemDto;
  deduplicated: boolean;
  idempotentReplay: boolean;
}

export interface OperatorDamageAiSuggestionDto {
  id: string;
  suggestionType: string;
  confidence: number | null;
  damageType: string | null;
  severity: string | null;
  locationLabel: string | null;
  description: string | null;
  verified: false;
  linkedDamageId: string | null;
}
