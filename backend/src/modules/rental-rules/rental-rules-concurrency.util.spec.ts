import { ConflictException } from '@nestjs/common';
import {
  RENTAL_RULES_INITIAL_EXPECTED_VERSION,
  RENTAL_RULES_VERSION_CONFLICT_CODE,
} from './rental-rules-concurrency.constants';
import {
  assertExpectedVersionMatches,
  throwRentalRulesVersionConflict,
} from './rental-rules-concurrency.util';

describe('rental-rules-concurrency.util', () => {
  it('throws structured 409 when expected version mismatches', () => {
    try {
      throwRentalRulesVersionConflict({
        entityType: 'category',
        expectedVersion: 2,
        currentVersion: 3,
        current: { id: 'cat-1', version: 3 },
      });
      fail('expected ConflictException');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      const response = (error as ConflictException).getResponse() as Record<string, unknown>;
      expect(response.code).toBe(RENTAL_RULES_VERSION_CONFLICT_CODE);
      expect(response.entityType).toBe('category');
      expect(response.expectedVersion).toBe(2);
      expect(response.currentVersion).toBe(3);
      expect(response.current).toEqual({ id: 'cat-1', version: 3 });
    }
  });

  it('assertExpectedVersionMatches treats missing row as version 0', () => {
    expect(() =>
      assertExpectedVersionMatches('organization_default', 1, undefined, null),
    ).toThrow(ConflictException);
    expect(() =>
      assertExpectedVersionMatches(
        'organization_default',
        RENTAL_RULES_INITIAL_EXPECTED_VERSION,
        undefined,
        null,
      ),
    ).not.toThrow();
  });
});
