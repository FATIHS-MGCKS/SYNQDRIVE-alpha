import {
  createPermissionDeniedError,
  createRoleRestrictedError,
  createVehicleNotFoundError,
  resolveSecureVehicleAccessError,
} from '../evidence/ai-domain-error.factory';
import type { AiDomainError } from '../evidence/ai-domain-error.types';
import { evaluateModulePermission } from '@shared/auth/permission.util';
import type { MembershipRole } from '@prisma/client';
import type {
  AiDataAuthorizationProbe,
  AiExecutionContext,
  AiVehicleOrgBinding,
  AiVehicleScopeResolver,
} from './ai-execution-context.types';
import { resolveAiExecutionContextError } from './ai-execution-context.validation';

export interface AiVehicleAccessInput {
  vehicleId: string;
  /** Ignored for trust — compared only to verified context organizationId. */
  organizationId?: string;
}

export interface AiVehicleAccessResult {
  vehicleId: string;
  organizationId: string;
  vehicle: AiVehicleOrgBinding;
}

function diagnosticsForContext(ctx: AiExecutionContext): {
  organizationId: string;
  correlationId: string;
} {
  return {
    organizationId: ctx.organizationId,
    correlationId: ctx.correlationId,
  };
}

function membershipRoleForPermission(ctx: AiExecutionContext): MembershipRole | undefined {
  if (ctx.role === 'MASTER_ADMIN') {
    return undefined;
  }
  return ctx.role;
}

function hasModuleRead(ctx: AiExecutionContext, module: string): boolean {
  return evaluateModulePermission(ctx.permissions, module, 'read', {
    platformRole: ctx.platformRole,
    membershipRole: membershipRoleForPermission(ctx),
  });
}

function denyPermission(
  ctx: AiExecutionContext,
  auditCause: string,
  entityKind?: string,
): AiDomainError {
  return createPermissionDeniedError({
    ...diagnosticsForContext(ctx),
    entityKind,
    internalDetail: auditCause,
  });
}

function denyRoleRestricted(
  ctx: AiExecutionContext,
  auditCause: string,
): AiDomainError {
  return createRoleRestrictedError({
    ...diagnosticsForContext(ctx),
    internalDetail: auditCause,
  });
}

function assertOrganizationMatches(
  ctx: AiExecutionContext,
  organizationId: string,
): AiDomainError | null {
  if (organizationId !== ctx.organizationId) {
    return denyPermission(ctx, 'ai.execution.organization_mismatch', 'organization');
  }
  return null;
}

function assertVehicleInAllowedScope(
  ctx: AiExecutionContext,
  vehicle: AiVehicleOrgBinding,
): AiDomainError | null {
  const scope = ctx.allowedVehicleScope;

  if (scope.mode === 'all' || scope.stationBypass) {
    return null;
  }

  if (scope.vehicleIds && scope.vehicleIds.length > 0) {
    if (!scope.vehicleIds.includes(vehicle.id)) {
      return createVehicleNotFoundError({
        ...diagnosticsForContext(ctx),
        entityId: vehicle.id,
        entityKind: 'vehicle',
        internalDetail: 'ai.execution.vehicle.allow_list_denied',
      });
    }
    return null;
  }

  const stationId = vehicle.currentStationId;
  const allowedStations = scope.effectiveStationIds ?? [];

  if (!stationId || !allowedStations.includes(stationId)) {
    return createVehicleNotFoundError({
      ...diagnosticsForContext(ctx),
      entityId: vehicle.id,
      entityKind: 'vehicle',
      internalDetail: 'ai.execution.vehicle.station_scope_denied',
    });
  }

  return null;
}

function requireModuleRead(
  ctx: AiExecutionContext,
  module: string,
  auditCause: string,
): true | AiDomainError {
  if (!hasModuleRead(ctx, module)) {
    return denyPermission(ctx, auditCause, module);
  }
  return true;
}

/**
 * Resolves a vehicle within the verified organization and station scope.
 * Never trusts organizationId from tool arguments alone.
 */
export async function resolveAiVehicleAccess(
  context: AiExecutionContext | null | undefined,
  input: AiVehicleAccessInput,
  resolver: AiVehicleScopeResolver,
): Promise<AiVehicleAccessResult | AiDomainError> {
  const contextError = resolveAiExecutionContextError(context);
  if (contextError) {
    return contextError;
  }

  const verifiedContext = context as AiExecutionContext;
  const vehicleId = input.vehicleId?.trim();

  if (!vehicleId) {
    return createVehicleNotFoundError({
      ...diagnosticsForContext(verifiedContext),
      internalDetail: 'ai.execution.vehicle.missing_id',
    });
  }

  if (input.organizationId) {
    const orgMismatch = assertOrganizationMatches(verifiedContext, input.organizationId);
    if (orgMismatch) {
      return orgMismatch;
    }
  }

  const vehicle = await resolver.findVehicleInOrganization(
    vehicleId,
    verifiedContext.organizationId,
  );

  const accessError = resolveSecureVehicleAccessError({
    canReadVehicles: hasModuleRead(verifiedContext, 'fleet'),
    vehicleExists: vehicle != null,
    organizationId: verifiedContext.organizationId,
    vehicleId,
    correlationId: verifiedContext.correlationId,
  });

  if (accessError) {
    return accessError;
  }

  if (!vehicle) {
    return createVehicleNotFoundError({
      ...diagnosticsForContext(verifiedContext),
      entityId: vehicleId,
      entityKind: 'vehicle',
    });
  }

  const scopeError = assertVehicleInAllowedScope(verifiedContext, vehicle);
  if (scopeError) {
    return scopeError;
  }

  return {
    vehicleId: vehicle.id,
    organizationId: verifiedContext.organizationId,
    vehicle,
  };
}

/**
 * Location / GPS data is sensitive fleet telemetry and requires fleet read access
 * plus explicit org data authorization.
 */
export async function assertAiLocationAccess(
  context: AiExecutionContext | null | undefined,
  probe: AiDataAuthorizationProbe,
  vehicleId: string,
): Promise<true | AiDomainError> {
  const contextError = resolveAiExecutionContextError(context);
  if (contextError) {
    return contextError;
  }

  const verifiedContext = context as AiExecutionContext;
  const fleetAccess = requireModuleRead(
    verifiedContext,
    'fleet',
    'ai.execution.location.fleet_read_required',
  );
  if (fleetAccess !== true) {
    return fleetAccess;
  }

  const authorized = await probe.isGpsLocationAuthorized({
    organizationId: verifiedContext.organizationId,
    vehicleId,
    purpose: verifiedContext.dataAccessPurpose,
  });

  if (!authorized) {
    return denyPermission(verifiedContext, 'ai.execution.location.data_authorization_denied', 'location');
  }

  return true;
}

export function assertAiHealthAccess(
  context: AiExecutionContext | null | undefined,
): true | AiDomainError {
  const contextError = resolveAiExecutionContextError(context);
  if (contextError) {
    return contextError;
  }

  return requireModuleRead(
    context as AiExecutionContext,
    'fleet-condition',
    'ai.execution.health.permission_denied',
  );
}

export function assertAiBookingAccess(
  context: AiExecutionContext | null | undefined,
): true | AiDomainError {
  const contextError = resolveAiExecutionContextError(context);
  if (contextError) {
    return contextError;
  }

  return requireModuleRead(
    context as AiExecutionContext,
    'bookings',
    'ai.execution.booking.permission_denied',
  );
}

export function assertAiCustomerDataAccess(
  context: AiExecutionContext | null | undefined,
): true | AiDomainError {
  const contextError = resolveAiExecutionContextError(context);
  if (contextError) {
    return contextError;
  }

  return requireModuleRead(
    context as AiExecutionContext,
    'customers',
    'ai.execution.customer.permission_denied',
  );
}

/**
 * Organization-wide fleet summaries require fleet or dashboard read access.
 */
export function assertAiFleetSummaryAccess(
  context: AiExecutionContext | null | undefined,
): true | AiDomainError {
  const contextError = resolveAiExecutionContextError(context);
  if (contextError) {
    return contextError;
  }

  const verifiedContext = context as AiExecutionContext;

  if (!verifiedContext.role) {
    return denyRoleRestricted(verifiedContext, 'ai.execution.fleet_summary.missing_role');
  }

  if (hasModuleRead(verifiedContext, 'fleet') || hasModuleRead(verifiedContext, 'dashboard')) {
    return true;
  }

  return denyPermission(verifiedContext, 'ai.execution.fleet_summary.permission_denied', 'fleet_summary');
}

/**
 * Mandatory gate before any AI tool execution.
 */
export function assertAiToolExecutionAllowed(
  context: AiExecutionContext | null | undefined,
): true | AiDomainError {
  const contextError = resolveAiExecutionContextError(context);
  if (contextError) {
    return contextError;
  }

  const verifiedContext = context as AiExecutionContext;

  if (!hasModuleRead(verifiedContext, 'ai-assistant')) {
    return denyPermission(verifiedContext, 'ai.execution.tool.permission_denied', 'ai-assistant');
  }

  return true;
}
