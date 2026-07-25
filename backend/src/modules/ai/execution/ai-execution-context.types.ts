import type { MembershipRole } from '@prisma/client';
import type { MembershipPermissionsMap } from '@shared/auth/permission.util';
import type {
  AiDataAccessPurpose,
  AiExecutionAccessKind,
  AiExecutionChannel,
  AiVehicleScopeMode,
} from './ai-execution-context.enums';

/**
 * Vehicle visibility derived from {@link computeEffectiveAccess} station scope.
 * `vehicleIds` is resolved lazily at guard time when station-restricted.
 */
export interface AiAllowedVehicleScope {
  readonly mode: AiVehicleScopeMode;
  readonly stationBypass: boolean;
  readonly effectiveStationIds: readonly string[] | null;
  /** Explicit allow-list when pre-resolved; otherwise guards query by station. */
  readonly vehicleIds: readonly string[] | null;
}

/**
 * Immutable execution context for AI domain tools.
 *
 * `organizationId` and `userId` MUST originate from verified backend auth —
 * never from LLM output, request body, or prompt text.
 */
export interface AiExecutionContext {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: MembershipRole | 'MASTER_ADMIN';
  readonly permissions: MembershipPermissionsMap | null;
  readonly allowedVehicleScope: AiAllowedVehicleScope;
  readonly locale: string;
  readonly timezone: string;
  readonly correlationId: string;
  readonly requestId: string;
  readonly channel: AiExecutionChannel;
  readonly dataAccessPurpose: AiDataAccessPurpose;
  readonly sessionId?: string;
  readonly platformRole?: string | null;
  readonly membershipId?: string | null;
}

/**
 * Verified inputs for {@link buildAiExecutionContext}.
 * Populated by controller/orchestrator from JWT + OrgScopingGuard + membership load.
 */
export interface VerifiedAiExecutionContextInput {
  readonly organizationId: string;
  readonly userId: string;
  readonly membershipRole: MembershipRole;
  readonly membershipStatus: 'ACTIVE' | 'SUSPENDED' | 'INVITED' | 'REVOKED';
  readonly permissions: unknown;
  readonly stationScope?: string | null;
  readonly stationIds?: unknown;
  readonly fieldAgentAccess?: boolean;
  readonly platformRole?: string | null;
  readonly membershipId?: string | null;
  readonly locale?: string;
  readonly timezone?: string;
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly channel: AiExecutionChannel;
  readonly dataAccessPurpose: AiDataAccessPurpose;
  readonly sessionId?: string;
  readonly stationsScopeV2Enabled?: boolean;
}

export interface AiExecutionContextValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface AiExecutionContextValidationResult {
  readonly valid: boolean;
  readonly issues: readonly AiExecutionContextValidationIssue[];
}

export interface AiVehicleOrgBinding {
  readonly id: string;
  readonly organizationId: string;
  readonly currentStationId: string | null;
}

/** Injectable resolver for org-bound vehicle lookups in guards. */
export interface AiVehicleScopeResolver {
  findVehicleInOrganization(
    vehicleId: string,
    organizationId: string,
  ): Promise<AiVehicleOrgBinding | null>;
}

export interface AiDataAuthorizationProbe {
  isGpsLocationAuthorized(params: {
    organizationId: string;
    vehicleId: string;
    purpose: string;
  }): Promise<boolean>;
}

export interface AiExecutionAccessAuditPayload {
  readonly kind: AiExecutionAccessKind;
  readonly decision: 'allow' | 'deny';
  readonly organizationId: string;
  readonly userId: string;
  readonly correlationId: string;
  readonly requestId: string;
  readonly channel: AiExecutionChannel;
  readonly code?: string;
  readonly vehicleId?: string;
}
