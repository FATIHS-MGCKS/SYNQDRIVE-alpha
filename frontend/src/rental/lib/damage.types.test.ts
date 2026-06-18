import { describe, expect, it } from 'vitest';
import {
  hasValidMapPin,
  isActiveDamage,
  isSolvedDamage,
  normalizeDamageStatus,
  parseDamageList,
  type DamageResponse,
} from './damage.types';

function makeDamage(overrides: Partial<DamageResponse> = {}): DamageResponse {
  return {
    id: 'd1',
    vehicleId: 'v1',
    damageType: 'SCRATCH',
    severity: 'MODERATE',
    status: 'OPEN',
    description: null,
    locationView: 'UNKNOWN',
    locationX: null,
    locationY: null,
    locationLabel: null,
    estimatedCostCents: null,
    repairCostCents: null,
    chargedToCustomerCents: null,
    depositHoldCents: null,
    source: 'MANUAL',
    rentalImpact: 'WATCH',
    evidenceStatus: 'MISSING',
    liabilityStatus: 'NOT_APPLICABLE',
    liabilityNote: null,
    reportedBy: null,
    reportedAt: '2026-06-01T10:00:00.000Z',
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    repairStartedAt: null,
    repairedAt: null,
    images: [],
    ...overrides,
  };
}

describe('damage.types', () => {
  it('normalizeDamageStatus derives REPAIRED from repairedAt', () => {
    expect(
      normalizeDamageStatus({
        status: 'OPEN',
        repairedAt: '2026-06-02T00:00:00.000Z',
        repairStartedAt: null,
      }),
    ).toBe('REPAIRED');
  });

  it('isActiveDamage is true for OPEN and IN_REPAIR only', () => {
    expect(isActiveDamage(makeDamage({ status: 'OPEN' }))).toBe(true);
    expect(isActiveDamage(makeDamage({ status: 'IN_REPAIR' }))).toBe(true);
    expect(isActiveDamage(makeDamage({ status: 'REPAIRED', repairedAt: '2026-06-02' }))).toBe(false);
  });

  it('isSolvedDamage is true only for REPAIRED', () => {
    expect(isSolvedDamage(makeDamage({ status: 'REPAIRED', repairedAt: '2026-06-02' }))).toBe(true);
    expect(isSolvedDamage(makeDamage({ status: 'OPEN' }))).toBe(false);
  });

  it('hasValidMapPin requires view match and 0-100 coordinates', () => {
    expect(hasValidMapPin(makeDamage())).toBe(false);
    expect(
      hasValidMapPin(
        makeDamage({
          locationView: 'FRONT',
          locationX: 50,
          locationY: 40,
        }),
      ),
    ).toBe(true);
    expect(
      hasValidMapPin(
        makeDamage({
          status: 'ARCHIVED',
          locationView: 'FRONT',
          locationX: 50,
          locationY: 40,
        }),
      ),
    ).toBe(false);
  });

  it('parseDamageList accepts array or { data } wrapper', () => {
    const row = makeDamage();
    expect(parseDamageList([row])).toHaveLength(1);
    expect(parseDamageList({ data: [row] })).toHaveLength(1);
    expect(parseDamageList(null)).toEqual([]);
  });
});
