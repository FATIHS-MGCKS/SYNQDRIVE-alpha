export interface CategoryVehicleMoveInput {
  vehicleId: string;
  fromCategoryId: string;
}

export interface CategoryAssignmentDeltaInput {
  vehiclesToAdd?: string[];
  vehiclesToRemove?: string[];
  vehiclesToMove?: CategoryVehicleMoveInput[];
}

export interface CategoryAssignmentVehicleRef {
  vehicleId: string;
  displayName: string;
  licensePlate: string | null;
}

export interface CategoryAssignmentMoveRef extends CategoryAssignmentVehicleRef {
  fromCategoryId: string;
  fromCategoryName: string | null;
}

export interface CategoryAssignmentRejectedRef {
  vehicleId: string;
  reason: string;
  code:
    | 'VEHICLE_NOT_IN_ORG'
    | 'NOT_IN_SOURCE_CATEGORY'
    | 'NOT_IN_TARGET_CATEGORY'
    | 'USE_VEHICLES_TO_MOVE'
    | 'DUPLICATE_DELTA'
    | 'INVALID_FROM_CATEGORY';
}

export interface CategoryAssignmentDiff {
  added: CategoryAssignmentVehicleRef[];
  removed: CategoryAssignmentVehicleRef[];
  moved: CategoryAssignmentMoveRef[];
  alreadyAssigned: CategoryAssignmentVehicleRef[];
  invalidVehicleIds: string[];
  rejected: CategoryAssignmentRejectedRef[];
}

export interface CategoryAssignmentApplyPlan extends CategoryAssignmentDiff {
  sourceCategoryIdsToBumpVersion: string[];
  hasMutations: boolean;
}
