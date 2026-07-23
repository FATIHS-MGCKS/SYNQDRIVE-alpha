import type { RentalRuleRevisionScopeType } from '@prisma/client';
import type { EffectiveRentalRules, RentalRuleFieldKey, RentalRuleFieldSet, RentalRuleSource } from './rental-rules.types';
import { RENTAL_RULE_FIELD_KEYS } from './rental-rules.types';
import type { NormalizedRentalRulesDocument } from './rental-rules-revision.types';

export type RentalRuleRevisionChangeKind = 'added' | 'changed' | 'removed';

export interface RentalRuleRevisionFieldChange {
  field: RentalRuleFieldKey;
  kind: RentalRuleRevisionChangeKind;
  previousValue: unknown;
  newValue: unknown;
  previousSource: RentalRuleSource;
  newSource: RentalRuleSource;
}

export interface RentalRuleScopeMetaChange {
  key: string;
  kind: RentalRuleRevisionChangeKind;
  previousValue: unknown;
  newValue: unknown;
}

export interface RentalRuleEffectiveFieldImpact {
  field: RentalRuleFieldKey;
  kind: RentalRuleRevisionChangeKind;
  previousValue: unknown;
  newValue: unknown;
  previousSource: RentalRuleSource | null;
  newSource: RentalRuleSource | null;
  previousSourceName: string | null;
  newSourceName: string | null;
}

export interface RentalRuleVehicleEffectiveImpact {
  vehicleId: string;
  displayName: string;
  licensePlate: string | null;
  rentalCategoryId: string | null;
  rentalCategoryName: string | null;
  hasOverride: boolean;
  fieldChanges: RentalRuleEffectiveFieldImpact[];
}

export interface RentalRuleRevisionDiffResult {
  scopeType: RentalRuleRevisionScopeType;
  scopeId: string;
  scopeSource: RentalRuleSource;
  addedRules: RentalRuleRevisionFieldChange[];
  changedRules: RentalRuleRevisionFieldChange[];
  removedRules: RentalRuleRevisionFieldChange[];
  scopeMetaChanges: RentalRuleScopeMetaChange[];
  hasChanges: boolean;
}

function scopeTypeToSource(scopeType: RentalRuleRevisionScopeType): RentalRuleSource {
  switch (scopeType) {
    case 'ORGANIZATION':
      return 'ORGANIZATION_DEFAULT';
    case 'CATEGORY':
      return 'CATEGORY';
    case 'VEHICLE':
      return 'VEHICLE_OVERRIDE';
    default:
      return 'ORGANIZATION_DEFAULT';
  }
}

function isSet(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function classifyChange(previousValue: unknown, newValue: unknown): RentalRuleRevisionChangeKind | null {
  const had = isSet(previousValue);
  const has = isSet(newValue);
  if (!had && has) return 'added';
  if (had && !has) return 'removed';
  if (had && has && JSON.stringify(previousValue) !== JSON.stringify(newValue)) return 'changed';
  return null;
}

export function buildRentalRuleRevisionDiff(input: {
  scopeType: RentalRuleRevisionScopeType;
  scopeId: string;
  active: NormalizedRentalRulesDocument | null;
  draft: NormalizedRentalRulesDocument | null;
}): RentalRuleRevisionDiffResult {
  const scopeSource = scopeTypeToSource(input.scopeType);
  const activeRules = (input.active?.rules ?? {}) as Partial<
    Record<RentalRuleFieldKey, RentalRuleFieldSet[RentalRuleFieldKey]>
  >;
  const draftRules = (input.draft?.rules ?? {}) as Partial<
    Record<RentalRuleFieldKey, RentalRuleFieldSet[RentalRuleFieldKey]>
  >;

  const addedRules: RentalRuleRevisionFieldChange[] = [];
  const changedRules: RentalRuleRevisionFieldChange[] = [];
  const removedRules: RentalRuleRevisionFieldChange[] = [];

  for (const field of RENTAL_RULE_FIELD_KEYS) {
    const previousValue = activeRules[field] ?? null;
    const newValue = draftRules[field] ?? null;
    const kind = classifyChange(previousValue, newValue);
    if (!kind) continue;
    const row: RentalRuleRevisionFieldChange = {
      field,
      kind,
      previousValue,
      newValue,
      previousSource: scopeSource,
      newSource: scopeSource,
    };
    if (kind === 'added') addedRules.push(row);
    else if (kind === 'changed') changedRules.push(row);
    else removedRules.push(row);
  }

  const metaKeys = new Set([
    ...Object.keys(input.active?.scopeMeta ?? {}),
    ...Object.keys(input.draft?.scopeMeta ?? {}),
  ]);
  const scopeMetaChanges: RentalRuleScopeMetaChange[] = [];
  for (const key of [...metaKeys].sort()) {
    const previousValue = input.active?.scopeMeta[key] ?? null;
    const newValue = input.draft?.scopeMeta[key] ?? null;
    const kind = classifyChange(previousValue, newValue);
    if (!kind) continue;
    scopeMetaChanges.push({ key, kind, previousValue, newValue });
  }

  return {
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    scopeSource,
    addedRules,
    changedRules,
    removedRules,
    scopeMetaChanges,
    hasChanges:
      addedRules.length > 0 ||
      changedRules.length > 0 ||
      removedRules.length > 0 ||
      scopeMetaChanges.length > 0,
  };
}

export function buildEffectiveRuleImpacts(input: {
  vehicleId: string;
  displayName: string;
  licensePlate: string | null;
  rentalCategoryId: string | null;
  rentalCategoryName: string | null;
  hasOverride: boolean;
  before: EffectiveRentalRules;
  after: EffectiveRentalRules;
}): RentalRuleVehicleEffectiveImpact | null {
  const fieldChanges: RentalRuleEffectiveFieldImpact[] = [];

  for (const field of RENTAL_RULE_FIELD_KEYS) {
    const previous = input.before[field] ?? { value: null, source: null, sourceName: null };
    const next = input.after[field] ?? { value: null, source: null, sourceName: null };
    const kind = classifyChange(previous.value, next.value);
    if (!kind) continue;
    fieldChanges.push({
      field,
      kind,
      previousValue: previous.value,
      newValue: next.value,
      previousSource: previous.source,
      newSource: next.source,
      previousSourceName: previous.sourceName,
      newSourceName: next.sourceName,
    });
  }

  if (fieldChanges.length === 0) return null;

  return {
    vehicleId: input.vehicleId,
    displayName: input.displayName,
    licensePlate: input.licensePlate,
    rentalCategoryId: input.rentalCategoryId,
    rentalCategoryName: input.rentalCategoryName,
    hasOverride: input.hasOverride,
    fieldChanges,
  };
}
