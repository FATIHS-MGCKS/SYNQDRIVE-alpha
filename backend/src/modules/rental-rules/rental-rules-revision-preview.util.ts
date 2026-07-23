import { RENTAL_RULE_FIELD_KEYS, type RentalRuleFieldKey } from './rental-rules.types';
import type { NormalizedRentalRulesDocument } from './rental-rules-revision.types';

export type RentalRuleRevisionPreviewMode = 'active' | 'draft' | 'diff';

export interface RentalRuleFieldDiff {
  field: RentalRuleFieldKey;
  active: unknown;
  draft: unknown;
  changed: boolean;
}

export interface RentalRuleScopeMetaDiff {
  key: string;
  active: unknown;
  draft: unknown;
  changed: boolean;
}

export interface RentalRuleRevisionPreviewResult {
  mode: RentalRuleRevisionPreviewMode;
  active: NormalizedRentalRulesDocument | null;
  draft: NormalizedRentalRulesDocument | null;
  ruleDiffs: RentalRuleFieldDiff[];
  scopeMetaDiffs: RentalRuleScopeMetaDiff[];
  hasChanges: boolean;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function buildRentalRuleRevisionPreview(input: {
  mode: RentalRuleRevisionPreviewMode;
  active: NormalizedRentalRulesDocument | null;
  draft: NormalizedRentalRulesDocument | null;
}): RentalRuleRevisionPreviewResult {
  const ruleDiffs: RentalRuleFieldDiff[] = RENTAL_RULE_FIELD_KEYS.map((field) => {
    const activeValue = input.active?.rules[field] ?? null;
    const draftValue = input.draft?.rules[field] ?? null;
    return {
      field,
      active: activeValue,
      draft: draftValue,
      changed: !valuesEqual(activeValue, draftValue),
    };
  });

  const metaKeys = new Set([
    ...Object.keys(input.active?.scopeMeta ?? {}),
    ...Object.keys(input.draft?.scopeMeta ?? {}),
  ]);
  const scopeMetaDiffs: RentalRuleScopeMetaDiff[] = [...metaKeys].sort().map((key) => {
    const activeValue = input.active?.scopeMeta[key] ?? null;
    const draftValue = input.draft?.scopeMeta[key] ?? null;
    return {
      key,
      active: activeValue,
      draft: draftValue,
      changed: !valuesEqual(activeValue, draftValue),
    };
  });

  const hasChanges =
    ruleDiffs.some((row) => row.changed) || scopeMetaDiffs.some((row) => row.changed);

  return {
    mode: input.mode,
    active: input.mode === 'draft' ? null : input.active,
    draft: input.mode === 'active' ? null : input.draft,
    ruleDiffs: input.mode === 'diff' ? ruleDiffs : [],
    scopeMetaDiffs: input.mode === 'diff' ? scopeMetaDiffs : [],
    hasChanges,
  };
}
