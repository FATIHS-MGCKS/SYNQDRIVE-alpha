import { describe, expect, it } from 'vitest';
import { derivePickupContext } from './damage-pickup-context';
import type { DamageResponse } from './damage.types';

function makeDamage(overrides: Partial<DamageResponse> = {}): DamageResponse {
  return {
    id: 'd1',
    vehicleId: 'v1',
    damageType: 'SCRATCH',
    severity: 'MODERATE',
    status: 'OPEN',
    description: null,
    locationView: 'LEFT',
    locationX: 40,
    locationY: 50,
    locationLabel: 'Door',
    estimatedCostCents: null,
    repairCostCents: null,
    chargedToCustomerCents: null,
    depositHoldCents: null,
    source: 'RETURN_HANDOVER',
    rentalImpact: 'WATCH',
    evidenceStatus: 'MISSING',
    liabilityStatus: 'NEEDS_REVIEW',
    liabilityNote: null,
    reportedBy: null,
    reportedAt: '2026-06-10T10:00:00.000Z',
    createdAt: '2026-06-10T10:00:00.000Z',
    updatedAt: '2026-06-10T10:00:00.000Z',
    repairStartedAt: null,
    repairedAt: null,
    bookingId: 'b1',
    images: [],
    ...overrides,
  };
}

describe('derivePickupContext', () => {
  it('marks pickup handover damages as pre-existing', () => {
    const result = derivePickupContext(
      makeDamage({ id: 'p1', source: 'PICKUP_HANDOVER' }),
      [],
      new Map(),
    );
    expect(result.context).toBe('PRE_EXISTING');
    expect(result.label).toBe('Pre-existing');
  });

  it('marks return handover damages on pickup protocol as pre-existing', () => {
    const result = derivePickupContext(
      makeDamage({ id: 'p1', source: 'RETURN_HANDOVER' }),
      [{ kind: 'PICKUP', damageIds: ['p1'] }],
      new Map([['p1', makeDamage({ id: 'p1' })]]),
    );
    expect(result.context).toBe('PRE_EXISTING');
  });

  it('classifies unmatched return damage as new since pickup', () => {
    const result = derivePickupContext(
      makeDamage({
        id: 'r-new',
        source: 'RETURN_HANDOVER',
        damageType: 'GLASS_DAMAGE',
        locationView: 'REAR',
        locationX: 10,
        locationY: 10,
      }),
      [
        { kind: 'PICKUP', damageIds: ['p-old'] },
        { kind: 'RETURN', damageIds: ['r-new'] },
      ],
      new Map([
        [
          'p-old',
          makeDamage({
            id: 'p-old',
            source: 'PICKUP_HANDOVER',
            damageType: 'SCRATCH',
            locationView: 'FRONT',
            locationX: 80,
            locationY: 80,
          }),
        ],
      ]),
    );
    expect(result.context).toBe('NEW_SINCE_PICKUP');
    expect(result.label).toBe('New since pickup');
  });

  it('flags uncertain fuzzy match as needs review', () => {
    const pickup = makeDamage({
      id: 'p-old',
      source: 'PICKUP_HANDOVER',
      damageType: 'SCRATCH',
      locationView: 'LEFT',
      locationX: 41,
      locationY: 51,
      locationLabel: 'Door',
    });
    const result = derivePickupContext(
      makeDamage({
        id: 'r1',
        source: 'RETURN_HANDOVER',
        damageType: 'DENT',
        locationView: 'LEFT',
        locationX: 42,
        locationY: 52,
        locationLabel: 'Door',
      }),
      [{ kind: 'PICKUP', damageIds: ['p-old'] }, { kind: 'RETURN', damageIds: ['r1'] }],
      new Map([['p-old', pickup]]),
    );
    expect(result.context).toBe('NEEDS_REVIEW');
    expect(result.suggestedPickupDamageId).toBe('p-old');
  });
});
