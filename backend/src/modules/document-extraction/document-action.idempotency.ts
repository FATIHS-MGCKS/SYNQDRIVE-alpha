import { createHash } from 'crypto';
import type { DocumentActionRequirement } from '@prisma/client';
import type { DocumentActionIdempotencyIdentity } from './document-action.types';

function normalizePart(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Deterministic tenant-scoped idempotency key for one planned business action.
 */
export function buildDocumentActionIdempotencyKey(
  identity: DocumentActionIdempotencyIdentity,
): string {
  const parts = [
    identity.organizationId,
    identity.extractionId,
    identity.actionPlanId,
    identity.actionType,
    normalizePart(identity.sequence),
    normalizePart(identity.targetEntityType),
    normalizePart(identity.targetEntityId),
  ];

  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function isRequiredDocumentActionRequirement(
  requirement: DocumentActionRequirement,
): boolean {
  return requirement === 'REQUIRED' || requirement === 'BLOCKER';
}

export function isOptionalDocumentActionRequirement(
  requirement: DocumentActionRequirement,
): boolean {
  return requirement === 'OPTIONAL' || requirement === 'INFORMATIONAL';
}

export function partitionDocumentActionsByRequirement<
  T extends { requirement: DocumentActionRequirement },
>(actions: T[]): { required: T[]; optional: T[] } {
  const required: T[] = [];
  const optional: T[] = [];
  for (const action of actions) {
    if (isRequiredDocumentActionRequirement(action.requirement)) {
      required.push(action);
    } else {
      optional.push(action);
    }
  }
  return { required, optional };
}
