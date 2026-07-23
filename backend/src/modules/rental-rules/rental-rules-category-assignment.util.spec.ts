import { BadRequestException } from '@nestjs/common';
import {
  assertCategoryAssignmentDeltaIsActionable,
  buildCategoryAssignmentPlan,
  normalizeCategoryAssignmentDelta,
  totalDeltaVehicleCount,
} from './rental-rules-category-assignment.util';

const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const V3 = '33333333-3333-4333-8333-333333333333';
const CAT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CAT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAT_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function vehicle(
  id: string,
  rentalCategoryId: string | null,
  overrides: Partial<{ make: string; model: string; licensePlate: string | null }> = {},
) {
  return {
    id,
    rentalCategoryId,
    vehicleName: null,
    make: overrides.make ?? 'VW',
    model: overrides.model ?? 'Golf',
    licensePlate: overrides.licensePlate ?? 'B-AB 1',
  };
}

describe('rental-rules-category-assignment.util', () => {
  const names = new Map([
    [CAT_A, 'Economy'],
    [CAT_B, 'Premium'],
    [CAT_C, 'Target'],
  ]);

  it('classifies add, remove, move, and already-assigned vehicles', () => {
    const plan = buildCategoryAssignmentPlan({
      targetCategoryId: CAT_C,
      delta: {
        vehiclesToAdd: [V1],
        vehiclesToRemove: [V2],
        vehiclesToMove: [{ vehicleId: V3, fromCategoryId: CAT_A }],
      },
      vehicles: [
        vehicle(V1, null),
        vehicle(V2, CAT_C),
        vehicle(V3, CAT_A),
      ],
      categoryNamesById: names,
    });

    expect(plan.added).toHaveLength(1);
    expect(plan.added[0]?.vehicleId).toBe(V1);
    expect(plan.removed).toHaveLength(1);
    expect(plan.removed[0]?.vehicleId).toBe(V2);
    expect(plan.moved).toHaveLength(1);
    expect(plan.moved[0]).toMatchObject({
      vehicleId: V3,
      fromCategoryId: CAT_A,
      fromCategoryName: 'Economy',
    });
    expect(plan.hasMutations).toBe(true);
  });

  it('rejects cross-category add without vehiclesToMove', () => {
    const plan = buildCategoryAssignmentPlan({
      targetCategoryId: CAT_C,
      delta: { vehiclesToAdd: [V1] },
      vehicles: [vehicle(V1, CAT_A)],
      categoryNamesById: names,
    });

    expect(plan.rejected).toHaveLength(1);
    expect(plan.rejected[0]?.code).toBe('USE_VEHICLES_TO_MOVE');
    expect(() => assertCategoryAssignmentDeltaIsActionable(plan)).toThrow(BadRequestException);
  });

  it('rejects duplicate IDs across delta lists', () => {
    const plan = buildCategoryAssignmentPlan({
      targetCategoryId: CAT_C,
      delta: {
        vehiclesToAdd: [V1],
        vehiclesToRemove: [V1],
      },
      vehicles: [vehicle(V1, null)],
      categoryNamesById: names,
    });

    expect(plan.rejected[0]?.code).toBe('DUPLICATE_DELTA');
    expect(plan.hasMutations).toBe(false);
  });

  it('flags invalid or foreign vehicle IDs', () => {
    const plan = buildCategoryAssignmentPlan({
      targetCategoryId: CAT_C,
      delta: { vehiclesToAdd: [V1, '99999999-9999-4999-8999-999999999999'] },
      vehicles: [vehicle(V1, null)],
      categoryNamesById: names,
    });

    expect(plan.invalidVehicleIds).toEqual(['99999999-9999-4999-8999-999999999999']);
    expect(() => assertCategoryAssignmentDeltaIsActionable(plan)).toThrow(BadRequestException);
  });

  it('treats already-assigned vehicles as idempotent', () => {
    const plan = buildCategoryAssignmentPlan({
      targetCategoryId: CAT_C,
      delta: { vehiclesToAdd: [V1] },
      vehicles: [vehicle(V1, CAT_C)],
      categoryNamesById: names,
    });

    expect(plan.alreadyAssigned).toHaveLength(1);
    expect(plan.hasMutations).toBe(false);
  });

  it('normalizes duplicate delta entries', () => {
    const normalized = normalizeCategoryAssignmentDelta({
      vehiclesToAdd: [V1, V1],
      vehiclesToMove: [
        { vehicleId: V2, fromCategoryId: CAT_A },
        { vehicleId: V2, fromCategoryId: CAT_B },
      ],
    });

    expect(normalized.vehiclesToAdd).toEqual([V1]);
    expect(normalized.vehiclesToMove).toEqual([{ vehicleId: V2, fromCategoryId: CAT_B }]);
    expect(totalDeltaVehicleCount(normalized)).toBe(2);
  });

  it('counts empty delta as zero', () => {
    expect(totalDeltaVehicleCount({})).toBe(0);
  });
});
