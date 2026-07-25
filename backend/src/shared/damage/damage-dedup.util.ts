/**
 * Shared damage deduplication — same semantics as document extraction apply.
 */

export interface DamageDedupCandidate {
  id: string;
  damageType: string;
  severity: string;
  description: string | null;
  locationLabel: string | null;
  status?: string;
}

export interface DamageDedupPayload {
  damageType: string;
  severity: string;
  description?: string | null;
  locationLabel?: string | null;
}

function normalizeAreaToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function areasFromLabel(label: string | null | undefined): string[] {
  if (!label?.trim()) return [];
  return label.split(',').map((part) => part.trim()).filter(Boolean);
}

function areasOverlap(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const rightSet = new Set(right.map(normalizeAreaToken));
  return left.some((area) => rightSet.has(normalizeAreaToken(area)));
}

export function isDuplicateDamageCandidate(
  existing: DamageDedupCandidate,
  candidate: DamageDedupPayload,
  candidateAreas: string[],
): boolean {
  const existingAreas = areasFromLabel(existing.locationLabel);
  const sameType = existing.damageType === candidate.damageType;
  const sameSeverity = existing.severity === candidate.severity;
  const overlappingArea = areasOverlap(existingAreas, candidateAreas);
  const sameDescription =
    existing.description != null &&
    candidate.description != null &&
    normalizeAreaToken(existing.description) === normalizeAreaToken(candidate.description);

  return (
    (sameType && overlappingArea) ||
    (overlappingArea && sameDescription) ||
    (sameType && sameSeverity && overlappingArea)
  );
}

export function findDuplicateDamageCandidate(
  existingDamages: DamageDedupCandidate[],
  candidate: DamageDedupPayload,
  candidateAreas: string[],
): DamageDedupCandidate | null {
  const active = existingDamages.filter(
    (row) => row.status !== 'REPAIRED' && row.status !== 'ARCHIVED',
  );
  return (
    active.find((row) => isDuplicateDamageCandidate(row, candidate, candidateAreas)) ?? null
  );
}
