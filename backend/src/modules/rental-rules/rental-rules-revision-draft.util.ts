import type { RentalRuleRevisionScopeType } from '@prisma/client';
import { canonicalizeRuleFields } from './rental-rules-revision.util';
import type { NormalizedRentalRulesDocument } from './rental-rules-revision.types';
import type { RentalRuleFieldSet } from './rental-rules.types';

export function mergeRulePatchIntoDocument(
  base: NormalizedRentalRulesDocument,
  patch: Partial<RentalRuleFieldSet> & { isActive?: boolean },
): NormalizedRentalRulesDocument {
  const nextRules = { ...base.rules };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'isActive') continue;
    if (value !== undefined) {
      (nextRules as Record<string, unknown>)[key] = value;
    }
  }

  const nextScopeMeta = { ...base.scopeMeta };
  if (patch.isActive !== undefined) {
    nextScopeMeta.isActive = patch.isActive;
  }

  return {
    rules: canonicalizeRuleFields(nextRules as Partial<RentalRuleFieldSet>),
    scopeMeta: nextScopeMeta,
  };
}

export function mergeScopeMetaPatch(
  base: NormalizedRentalRulesDocument,
  patch: Record<string, string | number | boolean | null | undefined>,
): NormalizedRentalRulesDocument {
  const nextScopeMeta = { ...base.scopeMeta };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      nextScopeMeta[key] = value;
    }
  }
  return {
    rules: base.rules,
    scopeMeta: nextScopeMeta,
  };
}

export function buildEmptyNormalizedDocument(
  scopeType: RentalRuleRevisionScopeType,
  scopeId: string,
): NormalizedRentalRulesDocument {
  const scopeMeta: Record<string, string | number | boolean | null> = {};
  switch (scopeType) {
    case 'ORGANIZATION':
      scopeMeta.isActive = true;
      break;
    case 'CATEGORY':
      scopeMeta.name = '';
      scopeMeta.status = 'DRAFT';
      scopeMeta.isActive = false;
      scopeMeta.type = null;
      break;
    case 'VEHICLE':
      scopeMeta.vehicleId = scopeId;
      break;
    default:
      break;
  }
  return {
    rules: canonicalizeRuleFields({}),
    scopeMeta,
  };
}
