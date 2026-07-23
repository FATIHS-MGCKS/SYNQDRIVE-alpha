import { ConflictException } from '@nestjs/common';
import {
  RENTAL_RULES_INITIAL_EXPECTED_VERSION,
  RENTAL_RULES_VERSION_CONFLICT_CODE,
  type RentalRulesConcurrencyEntityType,
} from './rental-rules-concurrency.constants';

export interface RentalRulesVersionConflictPayload {
  message: string;
  code: typeof RENTAL_RULES_VERSION_CONFLICT_CODE;
  entityType: RentalRulesConcurrencyEntityType;
  expectedVersion: number;
  currentVersion: number;
  current: Record<string, unknown> | null;
}

export function throwRentalRulesVersionConflict(input: {
  entityType: RentalRulesConcurrencyEntityType;
  expectedVersion: number;
  currentVersion: number;
  current: Record<string, unknown> | null;
}): never {
  const payload: RentalRulesVersionConflictPayload = {
    message: 'Rental rules were modified by another user. Reload and retry.',
    code: RENTAL_RULES_VERSION_CONFLICT_CODE,
    entityType: input.entityType,
    expectedVersion: input.expectedVersion,
    currentVersion: input.currentVersion,
    current: input.current,
  };
  throw new ConflictException(payload);
}

export function resolveExpectedVersion(version: number | undefined | null): number {
  if (version == null || Number.isNaN(version)) {
    return RENTAL_RULES_INITIAL_EXPECTED_VERSION;
  }
  return version;
}

export function assertExpectedVersionMatches(
  entityType: RentalRulesConcurrencyEntityType,
  expectedVersion: number,
  actualVersion: number | null | undefined,
  current: Record<string, unknown> | null,
): void {
  const actual = actualVersion ?? RENTAL_RULES_INITIAL_EXPECTED_VERSION;
  if (expectedVersion !== actual) {
    throwRentalRulesVersionConflict({
      entityType,
      expectedVersion,
      currentVersion: actual,
      current,
    });
  }
}
