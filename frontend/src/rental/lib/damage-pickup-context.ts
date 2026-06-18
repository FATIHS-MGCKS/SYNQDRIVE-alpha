import type { DamageResponse } from './damage.types';

export type DamagePickupContext =
  | 'NOT_APPLICABLE'
  | 'PRE_EXISTING'
  | 'NEW_SINCE_PICKUP'
  | 'NEEDS_REVIEW';

export interface HandoverProtocolDamageRef {
  kind: 'PICKUP' | 'RETURN';
  damageIds: string[];
}

export interface PickupContextResult {
  context: DamagePickupContext;
  /** Operator-facing label for queue badges */
  label: string | null;
  /** Suggested pickup damage id when fuzzy match found — never auto-applied */
  suggestedPickupDamageId: string | null;
  matchConfidence: 'none' | 'low' | 'high';
  reason: string;
}

const COORD_DISTANCE_THRESHOLD = 12;

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function coordDistance(a: DamageResponse, b: DamageResponse): number | null {
  if (
    a.locationView === 'UNKNOWN' ||
    b.locationView === 'UNKNOWN' ||
    a.locationView !== b.locationView ||
    a.locationX == null ||
    a.locationY == null ||
    b.locationX == null ||
    b.locationY == null
  ) {
    return null;
  }
  const dx = a.locationX - b.locationX;
  const dy = a.locationY - b.locationY;
  return Math.sqrt(dx * dx + dy * dy);
}

function scorePickupMatch(candidate: DamageResponse, pickup: DamageResponse): number {
  let score = 0;
  if (candidate.damageType === pickup.damageType) score += 3;
  if (candidate.locationView !== 'UNKNOWN' && candidate.locationView === pickup.locationView) {
    score += 2;
  }
  const dist = coordDistance(candidate, pickup);
  if (dist != null && dist <= COORD_DISTANCE_THRESHOLD) score += 3;
  const candDesc = normalizeText(candidate.description);
  const pickDesc = normalizeText(pickup.description);
  if (candDesc && pickDesc && (candDesc.includes(pickDesc) || pickDesc.includes(candDesc))) {
    score += 1;
  }
  const candLabel = normalizeText(candidate.locationLabel);
  const pickLabel = normalizeText(pickup.locationLabel);
  if (candLabel && pickLabel && candLabel === pickLabel) score += 2;
  return score;
}

function findBestPickupMatch(
  damage: DamageResponse,
  pickupDamages: DamageResponse[],
): { id: string; score: number } | null {
  let best: { id: string; score: number } | null = null;
  for (const pickup of pickupDamages) {
    const score = scorePickupMatch(damage, pickup);
    if (!best || score > best.score) {
      best = { id: pickup.id, score };
    }
  }
  return best;
}

/**
 * Derives pickup/return context for a damage record.
 * Never auto-assigns liability — only classifies for operator review.
 */
export function derivePickupContext(
  damage: DamageResponse,
  handovers: HandoverProtocolDamageRef[],
  damagesById: Map<string, DamageResponse>,
): PickupContextResult {
  if (damage.source === 'PICKUP_HANDOVER') {
    return {
      context: 'PRE_EXISTING',
      label: 'Pre-existing',
      suggestedPickupDamageId: damage.id,
      matchConfidence: 'high',
      reason: 'Documented at pickup handover.',
    };
  }

  const pickupIds = new Set(
    handovers.filter((h) => h.kind === 'PICKUP').flatMap((h) => h.damageIds),
  );
  const returnIds = new Set(
    handovers.filter((h) => h.kind === 'RETURN').flatMap((h) => h.damageIds),
  );

  if (pickupIds.has(damage.id)) {
    return {
      context: 'PRE_EXISTING',
      label: 'Pre-existing',
      suggestedPickupDamageId: damage.id,
      matchConfidence: 'high',
      reason: 'Listed on pickup handover protocol.',
    };
  }

  if (damage.source !== 'RETURN_HANDOVER' && !returnIds.has(damage.id)) {
    return {
      context: 'NOT_APPLICABLE',
      label: null,
      suggestedPickupDamageId: null,
      matchConfidence: 'none',
      reason: 'Not linked to a return handover.',
    };
  }

  const pickupDamages = [...pickupIds]
    .map((id) => damagesById.get(id))
    .filter((d): d is DamageResponse => Boolean(d));

  const best = findBestPickupMatch(damage, pickupDamages);
  if (best && best.score >= 6) {
    return {
      context: 'NEEDS_REVIEW',
      label: 'Needs review',
      suggestedPickupDamageId: best.id,
      matchConfidence: 'high',
      reason: 'Possible match to a pickup damage — confirm with operator.',
    };
  }
  if (best && best.score >= 4) {
    return {
      context: 'NEEDS_REVIEW',
      label: 'Needs review',
      suggestedPickupDamageId: best.id,
      matchConfidence: 'low',
      reason: 'Weak match to pickup damage — operator review required.',
    };
  }

  return {
    context: 'NEW_SINCE_PICKUP',
    label: 'New since pickup',
    suggestedPickupDamageId: null,
    matchConfidence: 'none',
    reason: 'Documented at return and not linked to pickup protocol.',
  };
}

export function needsLiabilityReview(damage: DamageResponse): boolean {
  return (
    damage.liabilityStatus === 'NEEDS_REVIEW' ||
    damage.liabilityStatus === 'DISPUTED'
  );
}
