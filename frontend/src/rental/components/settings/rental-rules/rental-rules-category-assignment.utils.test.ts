import { describe, expect, it } from 'vitest';
import { buildCategoryAssignmentDelta, buildSingleVehicleCategoryDelta } from './rental-rules-category-assignment.utils';
import type { RentalFleetVehicleDto } from './rental-rules.types';

const CAT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CAT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';

function fleetVehicle(
  id: string,
  rentalCategoryId: string | null,
): RentalFleetVehicleDto {
  return {
    id,
    displayName: 'Golf',
    licensePlate: 'B-AB 1',
    status: 'ACTIVE',
    rentalCategoryId,
    rentalCategoryName: rentalCategoryId === CAT_A ? 'Economy' : null,
    hasOverride: false,
  };
}

describe('rental-rules-category-assignment.utils', () => {
  it('builds add/remove/move delta from selection changes', () => {
    const delta = buildCategoryAssignmentDelta(
      [V1],
      [V1, V2],
      [fleetVehicle(V1, CAT_B), fleetVehicle(V2, CAT_A)],
      CAT_B,
    );

    expect(delta.vehiclesToRemove).toEqual([]);
    expect(delta.vehiclesToAdd).toEqual([]);
    expect(delta.vehiclesToMove).toEqual([{ vehicleId: V2, fromCategoryId: CAT_A }]);
  });

  it('builds remove delta when deselecting assigned vehicles', () => {
    const delta = buildCategoryAssignmentDelta([V1, V2], [V1], [fleetVehicle(V1, CAT_B), fleetVehicle(V2, CAT_B)], CAT_B);
    expect(delta.vehiclesToRemove).toEqual([V2]);
  });

  it('builds single-vehicle move delta', () => {
    expect(
      buildSingleVehicleCategoryDelta({
        vehicleId: V1,
        currentCategoryId: CAT_A,
        targetCategoryId: CAT_B,
      }),
    ).toEqual({
      vehiclesToMove: [{ vehicleId: V1, fromCategoryId: CAT_A }],
    });
  });

  it('builds single-vehicle add delta for uncategorized vehicle', () => {
    expect(
      buildSingleVehicleCategoryDelta({
        vehicleId: V1,
        currentCategoryId: null,
        targetCategoryId: CAT_B,
      }),
    ).toEqual({ vehiclesToAdd: [V1] });
  });
});
