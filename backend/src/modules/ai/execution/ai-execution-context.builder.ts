import { randomUUID } from 'crypto';
import { MembershipStatus } from '@prisma/client';
import { computeEffectiveAccess } from '@modules/users/policies/effective-access-engine';
import type {
  AiAllowedVehicleScope,
  AiExecutionContext,
  VerifiedAiExecutionContextInput,
} from './ai-execution-context.types';
import {
  normalizeMembershipPermissions,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function generateAiCorrelationId(): string {
  return randomUUID();
}

export function resolveAiRequestId(
  headerValue: string | string[] | undefined,
): string {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim().slice(0, 128);
  }
  return randomUUID();
}

function buildAllowedVehicleScope(
  input: VerifiedAiExecutionContextInput,
): AiAllowedVehicleScope {
  if (input.platformRole === 'MASTER_ADMIN') {
    return {
      mode: 'all',
      stationBypass: true,
      effectiveStationIds: null,
      vehicleIds: null,
    };
  }

  const access = computeEffectiveAccess({
    platformRole: input.platformRole,
    membership: {
      role: input.membershipRole,
      status: input.membershipStatus as MembershipStatus,
      permissions: input.permissions,
      stationScope: input.stationScope,
      stationIds: input.stationIds,
      fieldAgentAccess: input.fieldAgentAccess,
    },
    resourceContext: {
      organizationId: input.organizationId,
      stationsScopeV2Enabled: input.stationsScopeV2Enabled ?? false,
    },
  });

  if (access.stationBypass) {
    return {
      mode: 'all',
      stationBypass: true,
      effectiveStationIds: null,
      vehicleIds: null,
    };
  }

  return {
    mode: 'restricted',
    stationBypass: false,
    effectiveStationIds: access.effectiveStationIds ?? [],
    vehicleIds: null,
  };
}

/**
 * Builds an immutable {@link AiExecutionContext} from verified backend auth inputs.
 * Call only after OrgScopingGuard + membership resolution — never trust body/prompt org ids.
 */
export function buildAiExecutionContext(
  input: VerifiedAiExecutionContextInput,
): AiExecutionContext {
  const permissions = normalizeMembershipPermissions(input.permissions);
  const role =
    input.platformRole === 'MASTER_ADMIN' ? 'MASTER_ADMIN' : input.membershipRole;

  return {
    organizationId: input.organizationId,
    userId: input.userId,
    role,
    permissions,
    allowedVehicleScope: buildAllowedVehicleScope(input),
    locale: input.locale ?? 'de',
    timezone: input.timezone ?? 'Europe/Berlin',
    correlationId: input.correlationId ?? generateAiCorrelationId(),
    requestId: input.requestId ?? generateAiCorrelationId(),
    channel: input.channel,
    dataAccessPurpose: input.dataAccessPurpose,
    sessionId: input.sessionId,
    platformRole: input.platformRole ?? null,
    membershipId: input.membershipId ?? null,
  };
}

export function aiExecutionContextLogFields(
  ctx: AiExecutionContext,
): Record<string, string> {
  return {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    correlationId: ctx.correlationId,
    requestId: ctx.requestId,
    channel: ctx.channel,
    dataAccessPurpose: ctx.dataAccessPurpose,
    ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
  };
}

export function isValidAiExecutionUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function membershipPermissionsForContext(
  ctx: AiExecutionContext,
): MembershipPermissionsMap | null {
  return ctx.permissions;
}
