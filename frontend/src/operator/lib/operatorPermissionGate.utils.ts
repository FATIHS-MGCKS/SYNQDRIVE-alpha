import type { OperatorSheetAction, OperatorTab } from './operatorTypes';
import type { OperatorPermissionAction } from './operatorPermissions';

export interface OperatorActionGate {
  allowed: boolean;
  reason?: string;
}

export function mergeOperatorGates(...gates: OperatorActionGate[]): OperatorActionGate {
  for (const gate of gates) {
    if (!gate.allowed) return gate;
  }
  return { allowed: true };
}

export function permissionGate(
  allowed: boolean,
  reason: string,
): OperatorActionGate {
  return allowed ? { allowed: true } : { allowed: false, reason };
}

/** Navigation tab → minimum operator permission. */
export const OPERATOR_TAB_PERMISSIONS: Record<OperatorTab, OperatorPermissionAction> = {
  today: 'operator.today.read',
  scan: 'operator.scan.use',
  vehicles: 'operator.vehicle.read',
  tasks: 'operator.task.read',
  more: 'operator.app.access',
};

/** Action sheet type → required permission before render/open. */
export function operatorSheetPermission(action: OperatorSheetAction): OperatorPermissionAction {
  switch (action.type) {
    case 'ai-upload':
      return 'operator.document.upload';
    case 'task-create':
      return 'operator.task.complete';
    case 'task-detail':
      return 'operator.task.read';
    case 'booking-create':
      return 'operator.booking.create';
    case 'booking-edit':
      return 'operator.booking.update';
    case 'booking-cancel':
      return 'operator.booking.cancel';
    case 'booking-no-show':
      return 'operator.booking.cancel';
    case 'pickup-verification':
      return 'operator.document.verify';
    case 'tire-measure':
      return 'operator.tire_measurement.create';
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function canViewOperatorUnassignedBucket(input: {
  isMasterAdmin: boolean;
  hasTasksManage: boolean;
}): boolean {
  return input.isMasterAdmin || input.hasTasksManage;
}
