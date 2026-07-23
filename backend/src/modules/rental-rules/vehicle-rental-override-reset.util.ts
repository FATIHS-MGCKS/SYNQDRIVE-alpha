import { BadRequestException } from '@nestjs/common';
import type { RentalRuleFieldKey, RentalRuleFieldSet } from './rental-rules.types';
import { RENTAL_RULE_FIELD_KEYS } from './rental-rules.types';

export function resolveOverrideResetFields(
  requestedFields: string[] | undefined,
  activeOverrideFields: Partial<RentalRuleFieldSet>,
): RentalRuleFieldKey[] {
  if (requestedFields === undefined || requestedFields.length === 0) {
    return RENTAL_RULE_FIELD_KEYS.filter((key) => activeOverrideFields[key] != null);
  }

  const invalid = requestedFields.filter(
    (field) => !RENTAL_RULE_FIELD_KEYS.includes(field as RentalRuleFieldKey),
  );
  if (invalid.length > 0) {
    throw new BadRequestException(
      `Invalid override field(s): ${invalid.join(', ')}`,
    );
  }

  return requestedFields as RentalRuleFieldKey[];
}

export function buildOverrideResetPatch(
  fields: RentalRuleFieldKey[],
): Partial<RentalRuleFieldSet> {
  const patch: Partial<RentalRuleFieldSet> = {};
  for (const field of fields) {
    patch[field] = null;
  }
  return patch;
}

export function mergeOverrideFieldsAfterReset(
  current: Partial<RentalRuleFieldSet>,
  fieldsToReset: RentalRuleFieldKey[],
): Partial<RentalRuleFieldSet> {
  const next = { ...current };
  for (const field of fieldsToReset) {
    next[field] = null;
  }
  return next;
}
