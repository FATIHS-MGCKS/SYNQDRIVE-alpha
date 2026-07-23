import { BadRequestException, ConflictException } from '@nestjs/common';
import { RENTAL_RULES_ASSIGNMENT_STALE_CODE } from './rental-rules-concurrency.constants';
import type {
  CategoryAssignmentApplyPlan,
  CategoryAssignmentDeltaInput,
  CategoryAssignmentMoveRef,
  CategoryAssignmentRejectedRef,
  CategoryAssignmentVehicleRef,
  CategoryVehicleMoveInput,
} from './rental-rules-category-assignment.types';

export interface CategoryAssignmentVehicleRow {
  id: string;
  rentalCategoryId: string | null;
  vehicleName?: string | null;
  make: string;
  model: string;
  licensePlate?: string | null;
}

function vehicleRef(row: CategoryAssignmentVehicleRow): CategoryAssignmentVehicleRef {
  return {
    vehicleId: row.id,
    displayName:
      row.vehicleName?.trim() ||
      [row.make, row.model].filter(Boolean).join(' ').trim() ||
      row.licensePlate ||
      'Vehicle',
    licensePlate: row.licensePlate ?? null,
  };
}

function normalizeIds(ids: string[] | undefined): string[] {
  return ids ?? [];
}

function collectOverlaps(delta: CategoryAssignmentDeltaInput): string[] {
  const add = new Set(normalizeIds(delta.vehiclesToAdd));
  const remove = new Set(normalizeIds(delta.vehiclesToRemove));
  const moveIds = normalizeIds(delta.vehiclesToMove?.map((m) => m.vehicleId));
  const overlaps: string[] = [];
  for (const id of add) {
    if (remove.has(id) || moveIds.includes(id)) overlaps.push(id);
  }
  for (const id of remove) {
    if (moveIds.includes(id)) overlaps.push(id);
  }
  return [...new Set(overlaps)];
}

export function buildCategoryAssignmentPlan(input: {
  targetCategoryId: string;
  delta: CategoryAssignmentDeltaInput;
  vehicles: CategoryAssignmentVehicleRow[];
  categoryNamesById: Map<string, string>;
}): CategoryAssignmentApplyPlan {
  const { targetCategoryId, delta, vehicles, categoryNamesById } = input;
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));

  const added: CategoryAssignmentVehicleRef[] = [];
  const removed: CategoryAssignmentVehicleRef[] = [];
  const moved: CategoryAssignmentMoveRef[] = [];
  const alreadyAssigned: CategoryAssignmentVehicleRef[] = [];
  const invalidVehicleIds: string[] = [];
  const rejected: CategoryAssignmentRejectedRef[] = [];

  for (const overlap of collectOverlaps(delta)) {
    rejected.push({
      vehicleId: overlap,
      reason: 'Vehicle appears in more than one delta list',
      code: 'DUPLICATE_DELTA',
    });
  }
  if (rejected.length > 0) {
    return {
      added,
      removed,
      moved,
      alreadyAssigned,
      invalidVehicleIds,
      rejected,
      sourceCategoryIdsToBumpVersion: [],
      hasMutations: false,
    };
  }

  const referencedIds = new Set<string>([
    ...normalizeIds(delta.vehiclesToAdd),
    ...normalizeIds(delta.vehiclesToRemove),
    ...normalizeIds(delta.vehiclesToMove?.map((m) => m.vehicleId)),
  ]);

  for (const id of referencedIds) {
    if (!vehiclesById.has(id)) invalidVehicleIds.push(id);
  }

  for (const id of normalizeIds(delta.vehiclesToRemove)) {
    const row = vehiclesById.get(id);
    if (!row) continue;
    if (row.rentalCategoryId === targetCategoryId) {
      removed.push(vehicleRef(row));
    } else {
      rejected.push({
        vehicleId: id,
        reason: 'Vehicle is not assigned to this category',
        code: 'NOT_IN_TARGET_CATEGORY',
      });
    }
  }

  for (const move of normalizeIds(delta.vehiclesToMove?.map((m) => m.vehicleId)).map(
    (vehicleId) => delta.vehiclesToMove!.find((m) => m.vehicleId === vehicleId)!,
  )) {
    const row = vehiclesById.get(move.vehicleId);
    if (!row) continue;
    if (move.fromCategoryId === targetCategoryId) {
      rejected.push({
        vehicleId: move.vehicleId,
        reason: 'Source category must differ from target category',
        code: 'INVALID_FROM_CATEGORY',
      });
      continue;
    }
    if (row.rentalCategoryId !== move.fromCategoryId) {
      rejected.push({
        vehicleId: move.vehicleId,
        reason: 'Vehicle is not in the declared source category',
        code: 'NOT_IN_SOURCE_CATEGORY',
      });
      continue;
    }
    moved.push({
      ...vehicleRef(row),
      fromCategoryId: move.fromCategoryId,
      fromCategoryName: categoryNamesById.get(move.fromCategoryId) ?? null,
    });
  }

  for (const id of normalizeIds(delta.vehiclesToAdd)) {
    const row = vehiclesById.get(id);
    if (!row) continue;
    if (row.rentalCategoryId === targetCategoryId) {
      alreadyAssigned.push(vehicleRef(row));
      continue;
    }
    if (row.rentalCategoryId && row.rentalCategoryId !== targetCategoryId) {
      rejected.push({
        vehicleId: id,
        reason: 'Vehicle is assigned to another category — use vehiclesToMove',
        code: 'USE_VEHICLES_TO_MOVE',
      });
      continue;
    }
    added.push(vehicleRef(row));
  }

  const sourceCategoryIdsToBumpVersion = [
    ...new Set(moved.map((m) => m.fromCategoryId)),
  ];

  const hasMutations = added.length + removed.length + moved.length > 0;

  return {
    added,
    removed,
    moved,
    alreadyAssigned,
    invalidVehicleIds,
    rejected,
    sourceCategoryIdsToBumpVersion,
    hasMutations,
  };
}

export function assertCategoryAssignmentDeltaIsActionable(plan: CategoryAssignmentApplyPlan): void {
  if (plan.invalidVehicleIds.length > 0) {
    throw new BadRequestException({
      message: 'One or more vehicles do not belong to this organization',
      code: 'RENTAL_RULES_ASSIGNMENT_INVALID_VEHICLES',
      invalidVehicleIds: plan.invalidVehicleIds,
    });
  }
  if (plan.rejected.length > 0) {
    throw new BadRequestException({
      message: 'Category assignment delta is invalid',
      code: 'RENTAL_RULES_ASSIGNMENT_REJECTED',
      rejected: plan.rejected,
      diff: plan,
    });
  }
}

export function totalDeltaVehicleCount(delta: CategoryAssignmentDeltaInput): number {
  const moveIds = delta.vehiclesToMove?.map((m) => m.vehicleId) ?? [];
  return new Set([
    ...(delta.vehiclesToAdd ?? []),
    ...(delta.vehiclesToRemove ?? []),
    ...moveIds,
  ]).size;
}

export function normalizeCategoryAssignmentDelta(
  delta: CategoryAssignmentDeltaInput,
): Required<CategoryAssignmentDeltaInput> {
  return {
    vehiclesToAdd: [...new Set(delta.vehiclesToAdd ?? [])],
    vehiclesToRemove: [...new Set(delta.vehiclesToRemove ?? [])],
    vehiclesToMove: dedupeMoves(delta.vehiclesToMove ?? []),
  };
}

function dedupeMoves(moves: CategoryVehicleMoveInput[]): CategoryVehicleMoveInput[] {
  const byVehicle = new Map<string, CategoryVehicleMoveInput>();
  for (const move of moves) byVehicle.set(move.vehicleId, move);
  return [...byVehicle.values()];
}

export function throwRentalRulesAssignmentStale(input: {
  categoryId: string;
  reason: string;
}): never {
  throw new ConflictException({
    message: 'Vehicle assignment changed during save. Reload and retry.',
    code: RENTAL_RULES_ASSIGNMENT_STALE_CODE,
    categoryId: input.categoryId,
    reason: input.reason,
  });
}
