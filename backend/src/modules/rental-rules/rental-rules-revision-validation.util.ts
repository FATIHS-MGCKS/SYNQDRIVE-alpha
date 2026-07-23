import { BadRequestException } from '@nestjs/common';
import { RENTAL_RULES_VALIDATION_LIMITS } from './rental-rules-validation.constants';
import type { NormalizedRentalRulesDocument } from './rental-rules-revision.types';
import { RENTAL_RULE_FIELD_KEYS } from './rental-rules.types';

const L = RENTAL_RULES_VALIDATION_LIMITS;

function assertIntInRange(
  field: string,
  value: unknown,
  min: number,
  max: number,
): void {
  if (value == null) return;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new BadRequestException({
      message: `Invalid ${field}`,
      code: 'RENTAL_RULE_REVISION_INVALID',
      field,
    });
  }
}

function assertStringMax(field: string, value: unknown, maxLength: number): void {
  if (value == null) return;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new BadRequestException({
      message: `Invalid ${field}`,
      code: 'RENTAL_RULE_REVISION_INVALID',
      field,
    });
  }
}

export function validateNormalizedRentalRulesDocument(document: NormalizedRentalRulesDocument): void {
  for (const key of RENTAL_RULE_FIELD_KEYS) {
    const value = document.rules[key];
    switch (key) {
      case 'minimumAgeYears':
        assertIntInRange(key, value, L.minimumAgeYears.min, L.minimumAgeYears.max);
        break;
      case 'minimumLicenseHoldingMonths':
        assertIntInRange(key, value, L.minimumLicenseHoldingMonths.min, L.minimumLicenseHoldingMonths.max);
        break;
      case 'depositAmountCents':
        assertIntInRange(key, value, L.depositAmountCents.min, L.depositAmountCents.max);
        break;
      case 'depositCurrency':
        if (value != null && (typeof value !== 'string' || value.length !== L.depositCurrency.length)) {
          throw new BadRequestException({
            message: 'Invalid depositCurrency',
            code: 'RENTAL_RULE_REVISION_INVALID',
            field: key,
          });
        }
        break;
      case 'insuranceRequirement':
        assertStringMax(key, value, L.insuranceRequirement.maxLength);
        break;
      case 'notes':
        assertStringMax(key, value, L.notes.maxLength);
        break;
      default:
        break;
    }
  }

  const categoryName = document.scopeMeta.name;
  if (categoryName != null && typeof categoryName === 'string') {
    if (
      categoryName.trim().length < L.categoryName.minLength ||
      categoryName.length > L.categoryName.maxLength
    ) {
      throw new BadRequestException({
        message: 'Invalid category name in revision',
        code: 'RENTAL_RULE_REVISION_INVALID',
        field: 'name',
      });
    }
  }
}
