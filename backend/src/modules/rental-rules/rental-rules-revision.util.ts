import { createHash } from 'crypto';
import type { RentalRuleRevisionScopeType } from '@prisma/client';
import { extractRuleFields } from './rental-rules.mapper';
import { RENTAL_RULE_FIELD_KEYS, type RentalRuleFieldKey, type RentalRuleFieldSet } from './rental-rules.types';
import type { NormalizedRentalRulesDocument } from './rental-rules-revision.types';

type RuleRow = Partial<RentalRuleFieldSet> & Record<string, unknown>;

function sortObjectKeys<T extends Record<string, string | number | boolean | null>>(
  input: T,
): T {
  return Object.keys(input)
    .sort()
    .reduce((acc, key) => {
      acc[key as keyof T] = input[key as keyof T];
      return acc;
    }, {} as T);
}

export function canonicalizeRuleFields(
  fields: Partial<RentalRuleFieldSet>,
): Record<RentalRuleFieldKey, RentalRuleFieldSet[RentalRuleFieldKey]> {
  const canonical = {} as Record<RentalRuleFieldKey, RentalRuleFieldSet[RentalRuleFieldKey]>;
  for (const key of RENTAL_RULE_FIELD_KEYS) {
    canonical[key] = fields[key] ?? null;
  }
  return canonical;
}

export function buildScopeMeta(
  scopeType: RentalRuleRevisionScopeType,
  row: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  switch (scopeType) {
    case 'ORGANIZATION':
      return sortObjectKeys({
        isActive: typeof row.isActive === 'boolean' ? row.isActive : null,
      });
    case 'CATEGORY':
      return sortObjectKeys({
        name: typeof row.name === 'string' ? row.name : null,
        status: typeof row.status === 'string' ? row.status : null,
        isActive: typeof row.isActive === 'boolean' ? row.isActive : null,
        type: typeof row.type === 'string' ? row.type : null,
        description: typeof row.description === 'string' ? row.description : row.description === null ? null : null,
        color: typeof row.color === 'string' ? row.color : row.color === null ? null : null,
        icon: typeof row.icon === 'string' ? row.icon : row.icon === null ? null : null,
      });
    case 'VEHICLE':
      return sortObjectKeys({
        vehicleId: typeof row.vehicleId === 'string' ? row.vehicleId : null,
      });
    default:
      return {};
  }
}

export function buildNormalizedRentalRulesDocument(input: {
  scopeType: RentalRuleRevisionScopeType;
  row: Record<string, unknown>;
}): NormalizedRentalRulesDocument {
  return {
    rules: canonicalizeRuleFields(extractRuleFields(input.row as RuleRow)),
    scopeMeta: buildScopeMeta(input.scopeType, input.row),
  };
}

export function stableStringifyNormalizedRules(document: NormalizedRentalRulesDocument): string {
  const payload = {
    rules: canonicalizeRuleFields(document.rules as Partial<RentalRuleFieldSet>),
    scopeMeta: sortObjectKeys(document.scopeMeta),
  };
  return JSON.stringify(payload);
}

export function computeRentalRulesHash(document: NormalizedRentalRulesDocument): string {
  return createHash('sha256').update(stableStringifyNormalizedRules(document)).digest('hex');
}

export function buildRentalRuleRevisionSnapshot(input: {
  scopeType: RentalRuleRevisionScopeType;
  row: Record<string, unknown>;
}) {
  const normalizedRules = buildNormalizedRentalRulesDocument(input);
  return {
    normalizedRules,
    rulesHash: computeRentalRulesHash(normalizedRules),
  };
}
