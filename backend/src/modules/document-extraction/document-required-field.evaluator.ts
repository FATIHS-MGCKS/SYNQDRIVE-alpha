import type { DocumentEntityType } from '@prisma/client';
import type {
  ConditionalFieldRule,
  DocumentRequiredFieldProfile,
  EntityRequirementRule,
  RequiredFieldCondition,
  RequiredFieldEvaluationContext,
  RequiredFieldProfileEvaluation,
  RequiredFieldStage,
  RequiredFieldStageEvaluation,
} from './document-required-field.registry.types';
import { DOCUMENT_REQUIRED_FIELD_REGISTRY_VERSION } from './document-required-field.registry.types';

export function normalizeRegistryDocumentSubtype(
  subtype: string | null | undefined,
): string | null {
  if (!subtype?.trim()) return null;
  return subtype.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function hasConfirmedFieldValue(data: Record<string, unknown>, fieldKey: string): boolean {
  if (!fieldKey.includes('.')) {
    const value = data[fieldKey];
    return value != null && value !== '';
  }

  const [parent, child] = fieldKey.split('.');
  const parentValue = data[parent];
  if (parentValue == null || typeof parentValue !== 'object') return false;
  const nested = (parentValue as Record<string, unknown>)[child];
  return nested != null && nested !== '';
}

function readFieldValue(data: Record<string, unknown>, fieldKey: string): unknown {
  if (!fieldKey.includes('.')) return data[fieldKey];
  const [parent, child] = fieldKey.split('.');
  const parentValue = data[parent];
  if (parentValue == null || typeof parentValue !== 'object') return undefined;
  return (parentValue as Record<string, unknown>)[child];
}

export function evaluateRequiredFieldCondition(
  condition: RequiredFieldCondition,
  data: Record<string, unknown>,
): boolean {
  switch (condition.kind) {
    case 'fieldPresent':
      return hasConfirmedFieldValue(data, condition.fieldKey);
    case 'anyFieldPresent':
      return condition.fieldKeys.some((fieldKey) => hasConfirmedFieldValue(data, fieldKey));
    case 'allFieldsPresent':
      return condition.fieldKeys.every((fieldKey) => hasConfirmedFieldValue(data, fieldKey));
    case 'whenEquals':
      return String(readFieldValue(data, condition.fieldKey) ?? '') === String(condition.equals);
    case 'nestedAnyPresent': {
      const parent = data[condition.parentKey];
      if (parent == null || typeof parent !== 'object') return false;
      const record = parent as Record<string, unknown>;
      return condition.childKeys.some((child) => {
        const value = record[child];
        return value != null && value !== '';
      });
    }
    case 'anyOfConditions':
      return condition.conditions.some((nested) =>
        evaluateRequiredFieldCondition(nested, data),
      );
    default:
      return false;
  }
}

function listStageFieldKeys(
  profile: DocumentRequiredFieldProfile,
  stage: RequiredFieldStage,
): string[] {
  switch (stage) {
    case 'review':
      return profile.requiredForReview;
    case 'draft':
      return profile.requiredForDraft;
    case 'apply':
      return profile.requiredForApply;
    default:
      return [];
  }
}

function evaluateConditionalRules(
  profile: DocumentRequiredFieldProfile,
  stage: RequiredFieldStage,
  data: Record<string, unknown>,
): { missingRuleIds: string[] } {
  const missingRuleIds: string[] = [];

  for (const rule of profile.conditionalFields) {
    if (!rule.stages.includes(stage)) continue;
    if (!evaluateRequiredFieldCondition(rule.require, data)) {
      missingRuleIds.push(rule.id);
    }
  }

  return { missingRuleIds };
}

function evaluateEntityRequirements(
  rules: EntityRequirementRule[],
  stage: RequiredFieldStage,
  entityLinks: RequiredFieldEvaluationContext['entityLinks'],
): DocumentEntityType[] {
  const missing: DocumentEntityType[] = [];

  for (const rule of rules) {
    if (!rule.stages.includes(stage)) continue;
    if (!rule.confirmationRequired) continue;

    const linked = entityLinks.some(
      (link) =>
        String(link.entityType).toUpperCase() === rule.entityType && link.entityId?.trim(),
    );
    if (!linked) {
      missing.push(rule.entityType);
    }
  }

  return missing;
}

export function evaluateRequiredFieldStage(
  profile: DocumentRequiredFieldProfile,
  stage: RequiredFieldStage,
  context: RequiredFieldEvaluationContext,
): RequiredFieldStageEvaluation {
  const data = context.confirmedData;
  const requiredKeys = listStageFieldKeys(profile, stage);
  const missingFieldKeys = requiredKeys.filter((fieldKey) => !hasConfirmedFieldValue(data, fieldKey));
  const satisfiedFieldKeys = [
    ...requiredKeys.filter((fieldKey) => hasConfirmedFieldValue(data, fieldKey)),
    ...profile.optionalFields.filter((fieldKey) => hasConfirmedFieldValue(data, fieldKey)),
  ];

  const conditional = evaluateConditionalRules(profile, stage, data);

  return {
    missingFieldKeys,
    missingConditionalRuleIds: conditional.missingRuleIds,
    missingEntityTypes: evaluateEntityRequirements(
      profile.entityRequirements,
      stage,
      context.entityLinks,
    ),
    satisfiedFieldKeys: [...new Set(satisfiedFieldKeys)].sort(),
  };
}

export function evaluateRequiredFieldProfile(
  profile: DocumentRequiredFieldProfile,
  context: RequiredFieldEvaluationContext,
): RequiredFieldProfileEvaluation {
  return {
    profileKey: profile.profileKey,
    registryVersion: DOCUMENT_REQUIRED_FIELD_REGISTRY_VERSION,
    byStage: {
      review: evaluateRequiredFieldStage(profile, 'review', context),
      draft: evaluateRequiredFieldStage(profile, 'draft', context),
      apply: evaluateRequiredFieldStage(profile, 'apply', context),
    },
  };
}

export function listAllMissingFieldKeysForStage(
  evaluation: RequiredFieldStageEvaluation,
): string[] {
  return [...new Set(evaluation.missingFieldKeys)].sort();
}

export function isStageReady(
  profile: DocumentRequiredFieldProfile,
  stage: RequiredFieldStage,
  context: RequiredFieldEvaluationContext,
): boolean {
  const result = evaluateRequiredFieldStage(profile, stage, context);
  return (
    result.missingFieldKeys.length === 0 &&
    result.missingConditionalRuleIds.length === 0 &&
    result.missingEntityTypes.length === 0
  );
}

export function conditionalRuleToMissingFieldKeys(rule: ConditionalFieldRule): string[] {
  switch (rule.require.kind) {
    case 'fieldPresent':
      return [rule.require.fieldKey];
    case 'anyFieldPresent':
      return rule.require.fieldKeys;
    case 'allFieldsPresent':
      return rule.require.fieldKeys;
    case 'nestedAnyPresent': {
      const require = rule.require;
      return require.childKeys.map((child) => `${require.parentKey}.${child}`);
    }
    case 'whenEquals':
      return [rule.require.fieldKey];
    case 'anyOfConditions':
      return rule.require.conditions.flatMap((nested) => {
        if (nested.kind === 'fieldPresent') return [nested.fieldKey];
        if (nested.kind === 'anyFieldPresent') return nested.fieldKeys;
        if (nested.kind === 'nestedAnyPresent') {
          return nested.childKeys.map((child) => `${nested.parentKey}.${child}`);
        }
        return [];
      });
    default:
      return [];
  }
}
