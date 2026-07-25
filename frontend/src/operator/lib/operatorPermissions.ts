/**
 * Operator permission facade for the frontend.
 * Maps granular `operator.*` actions to existing membership module flags —
 * must stay aligned with `backend/src/modules/operator-app/operator-permission.constants.ts`.
 */
import type { AuthUser } from '../../lib/auth';
import type { MembershipPermissionsMap } from '../../lib/api';

export type OperatorPermissionAction =
  | 'operator.app.access'
  | 'operator.today.read'
  | 'operator.booking.read'
  | 'operator.booking.create'
  | 'operator.booking.update'
  | 'operator.booking.cancel'
  | 'operator.vehicle.read'
  | 'operator.vehicle.inspect'
  | 'operator.handover.read'
  | 'operator.handover.start'
  | 'operator.handover.update'
  | 'operator.handover.complete'
  | 'operator.handover.override'
  | 'operator.return.start'
  | 'operator.return.complete'
  | 'operator.damage.read'
  | 'operator.damage.create'
  | 'operator.damage.update'
  | 'operator.damage.verify'
  | 'operator.document.read'
  | 'operator.document.upload'
  | 'operator.document.verify'
  | 'operator.signature.capture'
  | 'operator.task.read'
  | 'operator.task.complete'
  | 'operator.tire_measurement.create'
  | 'operator.technical_observation.create'
  | 'operator.scan.use';

type PermissionLevel = 'read' | 'write' | 'manage';

interface OperatorPermissionRequirement {
  module: string;
  level: PermissionLevel;
  requiresFieldAgentAccess?: boolean;
  alsoRequires?: Array<{ module: string; level: PermissionLevel }>;
  supervisorFallback?: { module: string; level: PermissionLevel };
}

const REQUIREMENTS: Record<OperatorPermissionAction, OperatorPermissionRequirement> = {
  'operator.app.access': { module: 'operator-app', level: 'read' },
  'operator.today.read': { module: 'operator-app', level: 'read' },
  'operator.scan.use': { module: 'operator-app', level: 'read' },
  'operator.booking.read': { module: 'bookings', level: 'read' },
  'operator.booking.create': { module: 'bookings', level: 'write' },
  'operator.booking.update': { module: 'bookings', level: 'write' },
  'operator.booking.cancel': { module: 'bookings', level: 'manage' },
  'operator.vehicle.read': { module: 'fleet', level: 'read' },
  'operator.vehicle.inspect': { module: 'fleet-condition', level: 'read' },
  'operator.handover.read': { module: 'bookings', level: 'read' },
  'operator.handover.start': { module: 'bookings', level: 'write', requiresFieldAgentAccess: true },
  'operator.handover.update': { module: 'bookings', level: 'write' },
  'operator.handover.complete': { module: 'bookings', level: 'write', requiresFieldAgentAccess: true },
  'operator.handover.override': {
    module: 'booking-eligibility-override',
    level: 'manage',
    supervisorFallback: { module: 'tasks', level: 'manage' },
  },
  'operator.return.start': { module: 'bookings', level: 'write', requiresFieldAgentAccess: true },
  'operator.return.complete': { module: 'bookings', level: 'write', requiresFieldAgentAccess: true },
  'operator.damage.read': { module: 'fleet-condition', level: 'read' },
  'operator.damage.create': { module: 'fleet-condition', level: 'write' },
  'operator.damage.update': { module: 'fleet-condition', level: 'write' },
  'operator.damage.verify': {
    module: 'fleet-condition',
    level: 'manage',
    supervisorFallback: { module: 'tasks', level: 'manage' },
  },
  'operator.document.read': {
    module: 'document-upload',
    level: 'read',
    alsoRequires: [{ module: 'bookings', level: 'read' }],
  },
  'operator.document.upload': { module: 'document-upload', level: 'write' },
  'operator.document.verify': {
    module: 'document-upload',
    level: 'manage',
    supervisorFallback: { module: 'legal-documents', level: 'manage' },
  },
  'operator.signature.capture': { module: 'bookings', level: 'write', requiresFieldAgentAccess: true },
  'operator.task.read': { module: 'tasks', level: 'read' },
  'operator.task.complete': {
    module: 'tasks',
    level: 'write',
    supervisorFallback: { module: 'tasks', level: 'manage' },
  },
  'operator.tire_measurement.create': { module: 'fleet-condition', level: 'write' },
  'operator.technical_observation.create': { module: 'bookings', level: 'write', requiresFieldAgentAccess: true },
};

function evaluateModulePermission(
  permissions: MembershipPermissionsMap | null | undefined,
  module: string,
  level: PermissionLevel,
): boolean {
  if (!permissions) return false;
  const perm = permissions[module];
  if (!perm) return false;
  if (level === 'read') return Boolean(perm.read || perm.write || perm.manage);
  if (level === 'write') return Boolean(perm.write || perm.manage);
  return Boolean(perm.manage);
}

export interface OperatorPermissionContext {
  membershipRole?: string | null;
  fieldAgentAccess?: boolean;
  allowSupervisorFallback?: boolean;
}

export function evaluateOperatorPermission(
  permissions: MembershipPermissionsMap | null | undefined,
  action: OperatorPermissionAction,
  context: OperatorPermissionContext = {},
): boolean {
  const role = (context.membershipRole ?? '').trim().toUpperCase();
  if (role === 'ORG_ADMIN') return true;

  const requirement = REQUIREMENTS[action];
  if (requirement.requiresFieldAgentAccess && !context.fieldAgentAccess) {
    return false;
  }

  const primaryOk =
    evaluateModulePermission(permissions, requirement.module, requirement.level) &&
    (requirement.alsoRequires ?? []).every((extra) =>
      evaluateModulePermission(permissions, extra.module, extra.level),
    );

  if (primaryOk) return true;

  if (context.allowSupervisorFallback && requirement.supervisorFallback) {
    return evaluateModulePermission(
      permissions,
      requirement.supervisorFallback.module,
      requirement.supervisorFallback.level,
    );
  }

  return false;
}

export function canPerformOperatorAction(
  user: AuthUser | null | undefined,
  action: OperatorPermissionAction,
  context: Omit<OperatorPermissionContext, 'membershipRole'> = {},
): boolean {
  if (!user) return false;
  return evaluateOperatorPermission(user.permissions, action, {
    membershipRole: user.membershipRole,
    fieldAgentAccess: user.fieldAgentAccess,
    ...context,
  });
}

export function useOperatorPermissionChecks(
  hasPermission: (module: string, level: PermissionLevel) => boolean,
  context: OperatorPermissionContext = {},
): (action: OperatorPermissionAction) => boolean {
  const role = (context.membershipRole ?? '').trim().toUpperCase();
  if (role === 'ORG_ADMIN') {
    return () => true;
  }

  const permissions: MembershipPermissionsMap = {};
  // Bridge RentalContext hasPermission into operator action evaluation when only hook is available.
  for (const req of Object.values(REQUIREMENTS)) {
    for (const mod of [req.module, ...(req.alsoRequires?.map((e) => e.module) ?? [])]) {
      permissions[mod] = {
        read: hasPermission(mod, 'read'),
        write: hasPermission(mod, 'write'),
        manage: hasPermission(mod, 'manage'),
      };
    }
    if (req.supervisorFallback) {
      permissions[req.supervisorFallback.module] = {
        read: hasPermission(req.supervisorFallback.module, 'read'),
        write: hasPermission(req.supervisorFallback.module, 'write'),
        manage: hasPermission(req.supervisorFallback.module, 'manage'),
      };
    }
  }

  return (action) => evaluateOperatorPermission(permissions, action, context);
}
