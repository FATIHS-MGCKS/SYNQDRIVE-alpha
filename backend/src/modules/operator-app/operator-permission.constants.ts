import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from '@shared/auth/permission.constants';

/**
 * Stable permission codes for audit logs, IAM UI, and future endpoint decorators.
 * Operator actions map to existing membership module flags — no parallel JSON store.
 */
export const OPERATOR_PERMISSION_CODES = {
  APP_ACCESS: 'OPERATOR_APP_ACCESS',
  TODAY_READ: 'OPERATOR_TODAY_READ',
  SCAN_USE: 'OPERATOR_SCAN_USE',
  BOOKING_READ: 'OPERATOR_BOOKING_READ',
  BOOKING_CREATE: 'OPERATOR_BOOKING_CREATE',
  BOOKING_UPDATE: 'OPERATOR_BOOKING_UPDATE',
  BOOKING_CANCEL: 'OPERATOR_BOOKING_CANCEL',
  VEHICLE_READ: 'OPERATOR_VEHICLE_READ',
  VEHICLE_INSPECT: 'OPERATOR_VEHICLE_INSPECT',
  HANDOVER_READ: 'OPERATOR_HANDOVER_READ',
  HANDOVER_START: 'OPERATOR_HANDOVER_START',
  HANDOVER_UPDATE: 'OPERATOR_HANDOVER_UPDATE',
  HANDOVER_COMPLETE: 'OPERATOR_HANDOVER_COMPLETE',
  HANDOVER_OVERRIDE: 'OPERATOR_HANDOVER_OVERRIDE',
  RETURN_START: 'OPERATOR_RETURN_START',
  RETURN_COMPLETE: 'OPERATOR_RETURN_COMPLETE',
  DAMAGE_READ: 'OPERATOR_DAMAGE_READ',
  DAMAGE_CREATE: 'OPERATOR_DAMAGE_CREATE',
  DAMAGE_UPDATE: 'OPERATOR_DAMAGE_UPDATE',
  DAMAGE_VERIFY: 'OPERATOR_DAMAGE_VERIFY',
  DOCUMENT_READ: 'OPERATOR_DOCUMENT_READ',
  DOCUMENT_UPLOAD: 'OPERATOR_DOCUMENT_UPLOAD',
  DOCUMENT_VERIFY: 'OPERATOR_DOCUMENT_VERIFY',
  SIGNATURE_CAPTURE: 'OPERATOR_SIGNATURE_CAPTURE',
  TASK_READ: 'OPERATOR_TASK_READ',
  TASK_COMPLETE: 'OPERATOR_TASK_COMPLETE',
  TIRE_MEASUREMENT_CREATE: 'OPERATOR_TIRE_MEASUREMENT_CREATE',
  TECHNICAL_OBSERVATION_CREATE: 'OPERATOR_TECHNICAL_OBSERVATION_CREATE',
} as const;

export type OperatorPermissionCode =
  (typeof OPERATOR_PERMISSION_CODES)[keyof typeof OPERATOR_PERMISSION_CODES];

/**
 * Granular operator surface actions. Controllers and Operator UI gates reference
 * these keys — underlying grants remain `{ module: read|write|manage }` on membership.
 */
export const OPERATOR_PERMISSION_ACTIONS = [
  'operator.app.access',
  'operator.today.read',
  'operator.booking.read',
  'operator.booking.create',
  'operator.booking.update',
  'operator.booking.cancel',
  'operator.vehicle.read',
  'operator.vehicle.inspect',
  'operator.handover.read',
  'operator.handover.start',
  'operator.handover.update',
  'operator.handover.complete',
  'operator.handover.override',
  'operator.return.start',
  'operator.return.complete',
  'operator.damage.read',
  'operator.damage.create',
  'operator.damage.update',
  'operator.damage.verify',
  'operator.document.read',
  'operator.document.upload',
  'operator.document.verify',
  'operator.signature.capture',
  'operator.task.read',
  'operator.task.complete',
  'operator.tire_measurement.create',
  'operator.technical_observation.create',
  'operator.scan.use',
] as const;

export type OperatorPermissionAction = (typeof OPERATOR_PERMISSION_ACTIONS)[number];

/** Contextual gates documented for service-layer enforcement (Prompt 5 — no endpoint migration yet). */
export interface OperatorPermissionContextualRules {
  /** Membership `fieldAgentAccess` must be true (station handover workflows). */
  requiresFieldAgentAccess?: boolean;
  /** Actor station scope must include resource station (Stations V2). */
  requiresStationScope?: boolean;
  /** Task must be assigned to actor unless supervisor path applies. */
  requiresTaskAssignment?: boolean;
  /** Completed handover / applied document extraction cannot be mutated. */
  blocksOnFinalizedResource?: boolean;
  /** Alternate module that satisfies supervisor override paths. */
  supervisorFallback?: { module: PermissionModuleKey; level: PermissionLevel };
  /** Additional module flags required alongside primary mapping. */
  alsoRequires?: Array<{ module: PermissionModuleKey; level: PermissionLevel }>;
}

export interface OperatorPermissionRequirement {
  module: PermissionModuleKey;
  level: PermissionLevel;
  code: OperatorPermissionCode;
  contextual?: OperatorPermissionContextualRules;
}

export const OPERATOR_PERMISSION_REQUIREMENTS: Readonly<
  Record<OperatorPermissionAction, OperatorPermissionRequirement>
> = {
  'operator.app.access': {
    module: 'operator-app',
    level: 'read',
    code: OPERATOR_PERMISSION_CODES.APP_ACCESS,
  },
  'operator.today.read': {
    module: 'operator-app',
    level: 'read',
    code: OPERATOR_PERMISSION_CODES.TODAY_READ,
  },
  'operator.scan.use': {
    module: 'operator-app',
    level: 'read',
    code: OPERATOR_PERMISSION_CODES.SCAN_USE,
  },
  'operator.booking.read': {
    module: 'bookings',
    level: 'read',
    code: OPERATOR_PERMISSION_CODES.BOOKING_READ,
  },
  'operator.booking.create': {
    module: 'bookings',
    level: 'write',
    code: OPERATOR_PERMISSION_CODES.BOOKING_CREATE,
  },
  'operator.booking.update': {
    module: 'bookings',
    level: 'write',
    code: OPERATOR_PERMISSION_CODES.BOOKING_UPDATE,
  },
  'operator.booking.cancel': {
    module: 'bookings',
    level: 'manage',
    code: OPERATOR_PERMISSION_CODES.BOOKING_CANCEL,
  },
  'operator.vehicle.read': {
    module: 'fleet',
    level: 'read',
    code: OPERATOR_PERMISSION_CODES.VEHICLE_READ,
    contextual: { requiresStationScope: true },
  },
  'operator.vehicle.inspect': {
    module: 'fleet-condition',
    level: 'read',
    code: OPERATOR_PERMISSION_CODES.VEHICLE_INSPECT,
    contextual: { requiresStationScope: true },
  },
  'operator.handover.read': {
    module: 'bookings',
    level: 'read',
    code: OPERATOR_PERMISSION_CODES.HANDOVER_READ,
  },
  'operator.handover.start': {
    module: 'bookings',
    level: 'write',
    code: OPERATOR_PERMISSION_CODES.HANDOVER_START,
    contextual: { requiresFieldAgentAccess: true, requiresStationScope: true },
  },
  'operator.handover.update': {
    module: 'bookings',
    level: 'write',
    code: OPERATOR_PERMISSION_CODES.HANDOVER_UPDATE,
    contextual: { blocksOnFinalizedResource: true },
  },
  'operator.handover.complete': {
    module: 'bookings',
    level: 'write',
    code: OPERATOR_PERMISSION_CODES.HANDOVER_COMPLETE,
    contextual: { requiresFieldAgentAccess: true, requiresStationScope: true },
  },
  'operator.handover.override': {
    module: 'booking-eligibility-override',
    level: 'manage',
    code: OPERATOR_PERMISSION_CODES.HANDOVER_OVERRIDE,
    contextual: {
      supervisorFallback: { module: 'tasks', level: 'manage' },
    },
  },
  'operator.return.start': {
    module: 'bookings',
    level: 'write',
    code: OPERATOR_PERMISSION_CODES.RETURN_START,
    contextual: { requiresFieldAgentAccess: true },
  },
  'operator.return.complete': {
    module: 'bookings',
    level: 'write',
    code: OPERATOR_PERMISSION_CODES.RETURN_COMPLETE,
    contextual: { requiresFieldAgentAccess: true, requiresStationScope: true },
  },
  'operator.damage.read': {
    module: 'fleet-condition',
    level: 'read',
    code: OPERATOR_PERMISSION_CODES.DAMAGE_READ,
    contextual: { requiresStationScope: true },
  },
  'operator.damage.create': {
    module: 'fleet-condition',
    level: 'write',
    code: OPERATOR_PERMISSION_CODES.DAMAGE_CREATE,
    contextual: { requiresStationScope: true },
  },
  'operator.damage.update': {
    module: 'fleet-condition',
    level: 'write',
    code: OPERATOR_PERMISSION_CODES.DAMAGE_UPDATE,
    contextual: { blocksOnFinalizedResource: true },
  },
  'operator.damage.verify': {
    module: 'fleet-condition',
    level: 'manage',
    code: OPERATOR_PERMISSION_CODES.DAMAGE_VERIFY,
    contextual: {
      supervisorFallback: { module: 'tasks', level: 'manage' },
    },
  },
  'operator.document.read': {
    module: 'document-upload',
    level: 'read',
    code: OPERATOR_PERMISSION_CODES.DOCUMENT_READ,
    contextual: {
      alsoRequires: [{ module: 'bookings', level: 'read' }],
    },
  },
  'operator.document.upload': {
    module: 'document-upload',
    level: 'write',
    code: OPERATOR_PERMISSION_CODES.DOCUMENT_UPLOAD,
  },
  'operator.document.verify': {
    module: 'document-upload',
    level: 'manage',
    code: OPERATOR_PERMISSION_CODES.DOCUMENT_VERIFY,
    contextual: {
      supervisorFallback: { module: 'legal-documents', level: 'manage' },
    },
  },
  'operator.signature.capture': {
    module: 'bookings',
    level: 'write',
    code: OPERATOR_PERMISSION_CODES.SIGNATURE_CAPTURE,
    contextual: { requiresFieldAgentAccess: true },
  },
  'operator.task.read': {
    module: 'tasks',
    level: 'read',
    code: OPERATOR_PERMISSION_CODES.TASK_READ,
  },
  'operator.task.complete': {
    module: 'tasks',
    level: 'write',
    code: OPERATOR_PERMISSION_CODES.TASK_COMPLETE,
    contextual: {
      requiresTaskAssignment: true,
      supervisorFallback: { module: 'tasks', level: 'manage' },
    },
  },
  'operator.tire_measurement.create': {
    module: 'fleet-condition',
    level: 'write',
    code: OPERATOR_PERMISSION_CODES.TIRE_MEASUREMENT_CREATE,
  },
  'operator.technical_observation.create': {
    module: 'bookings',
    level: 'write',
    code: OPERATOR_PERMISSION_CODES.TECHNICAL_OBSERVATION_CREATE,
    contextual: { requiresFieldAgentAccess: true },
  },
};

export function isOperatorPermissionAction(value: string): value is OperatorPermissionAction {
  return (OPERATOR_PERMISSION_ACTIONS as readonly string[]).includes(value);
}
