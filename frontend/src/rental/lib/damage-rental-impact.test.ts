import { describe, expect, it } from 'vitest';
import {
  damageRentalGateLabel,
  deriveDamageRentalImpact,
  isDamageRentalBlocked,
} from './damage-rental-impact';
import type { DamageResponse } from './damage.types';

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
    rentalImpact: 'NONE',
    evidenceStatus: 'MISSING',
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

describe('deriveDamageRentalImpact', () => {
  it('returns RENTABLE when no active damages', () => {
    expect(deriveDamageRentalImpact([])).toBe('RENTABLE');
    expect(deriveDamageRentalImpact([makeDamage({ status: 'REPAIRED' })])).toBe('RENTABLE');
  });

  it('prioritizes SAFETY_CRITICAL over BLOCK_RENTAL', () => {
    const damages = [
      makeDamage({ id: 'a', rentalImpact: 'BLOCK_RENTAL' }),
      makeDamage({ id: 'b', rentalImpact: 'SAFETY_CRITICAL' }),
    ];
    expect(deriveDamageRentalImpact(damages)).toBe('SAFETY_CRITICAL');
  });

  it('prioritizes BLOCK_RENTAL over WATCH and NONE', () => {
    expect(
      deriveDamageRentalImpact([
        makeDamage({ rentalImpact: 'WATCH' }),
        makeDamage({ id: 'b', rentalImpact: 'BLOCK_RENTAL' }),
      ]),
    ).toBe('RENTAL_BLOCKED');
  });

  it('returns WATCH when highest active impact is WATCH', () => {
    expect(
      deriveDamageRentalImpact([
        makeDamage({ rentalImpact: 'NONE' }),
        makeDamage({ id: 'b', rentalImpact: 'WATCH' }),
      ]),
    ).toBe('WATCH');
  });

  it('labels and blocked helper align with gate', () => {
    expect(damageRentalGateLabel('SAFETY_CRITICAL')).toBe('Safety critical');
    expect(isDamageRentalBlocked('RENTAL_BLOCKED')).toBe(true);
    expect(isDamageRentalBlocked('WATCH')).toBe(false);
  });
});
