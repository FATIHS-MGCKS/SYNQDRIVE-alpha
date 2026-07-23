import { Injectable } from '@nestjs/common';
import {
  DataAuthorizationProcessorType,
  DataAuthorizationSourceType,
  OrgDataAuthorization,
  Prisma,
  AuthorizationActorType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AuthorizationDecisionService } from './authorization-decision-engine/authorization-decision.service';
import {
  AUTHORIZATION_DECISION_ACTION,
  AUTHORIZATION_DECISION_OUTCOME,
} from './authorization-decision-engine/authorization-decision.constants';
import type { AuthorizationDecisionRequest } from './authorization-decision-engine/authorization-decision.types';
import { DataAuthorizationDeniedException } from './data-authorization.exceptions';
import { normalizeDataCategories } from './data-authorization-risk.util';
import {
  POLICY_RESOLVER_PROCESSOR_TYPE,
  POLICY_RESOLVER_RESOURCE_TYPE,
  POLICY_RESOLVER_SOURCE_SYSTEM,
  type PolicyResolverSourceSystem,
} from './policy-resolver/policy-resolver.constants';
import type { PolicyResolverResult } from './policy-resolver/policy-resolver.types';

export interface AssertDataAuthorizationParams {
  orgId: string;
  vehicleId?: string;
  customerId?: string;
  bookingId?: string;
  stationId?: string;
  sourceType: DataAuthorizationSourceType | string;
  dataCategory: string;
  purpose: string;
  processorType?: DataAuthorizationProcessorType | string;
  processorId?: string;
  dataSubjectReference?: string;
  correlationId?: string;
  /** When true, increments accessCount / lastAccessAt on success (legacy path only). */
  trackAccess?: boolean;
}

type AuthorizationRow = OrgDataAuthorization;

/**
 * Enforcement layer for org-level data consent records.
 * Delegates to AuthorizationDecisionService (fail-closed) with PolicyResolver underneath;
 * falls back to legacy OrgDataAuthorization when decision engine yields no privacy match.
 */
@Injectable()
export class DataAuthorizationEnforcementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationDecision: AuthorizationDecisionService,
  ) {}

  async resolve(params: AssertDataAuthorizationParams): Promise<PolicyResolverResult | null> {
    const decision = await this.authorizationDecision.decide(this.toDecisionRequest(params));
    return decision.resolverResult;
  }

  async assertDataAuthorization(
    params: AssertDataAuthorizationParams,
  ): Promise<AuthorizationRow> {
    const decision = await this.authorizationDecision.decide(this.toDecisionRequest(params));

    if (
      decision.decision === AUTHORIZATION_DECISION_OUTCOME.ALLOW ||
      decision.decision === AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY
    ) {
      if (decision.matchedPolicyId && decision.resolverResult) {
        return this.syntheticLegacyRow(params, decision.resolverResult);
      }
    }

    const match = await this.findMatchingAuthorization(params);
    if (!match) {
      throw new DataAuthorizationDeniedException(
        'No active data authorization covers this access',
        'DATA_AUTHORIZATION_DENIED',
        {
          orgId: params.orgId,
          sourceType: params.sourceType,
          dataCategory: params.dataCategory,
          purpose: params.purpose,
          vehicleId: params.vehicleId,
          blockingReasons: decision.reasonCodes,
          correlationId: decision.correlationId,
        },
      );
    }

    if (params.trackAccess) {
      await this.prisma.orgDataAuthorization.update({
        where: { id: match.id },
        data: {
          accessCount: { increment: 1 },
          lastAccessAt: new Date(),
        },
      });
    }

    return match;
  }

  async isAuthorized(params: AssertDataAuthorizationParams): Promise<boolean> {
    const decision = await this.authorizationDecision.decide(this.toDecisionRequest(params));
    if (decision.decision === AUTHORIZATION_DECISION_OUTCOME.ALLOW) {
      return true;
    }
    if (decision.decision === AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY) {
      return true;
    }
    const match = await this.findMatchingAuthorization(params);
    return !!match;
  }

  private toDecisionRequest(params: AssertDataAuthorizationParams): AuthorizationDecisionRequest {
    const sourceSystem = mapSourceSystem(params.sourceType);
    const processorType = mapProcessorType(params.processorType);
    const resourceType = params.vehicleId
      ? POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE
      : params.bookingId
        ? POLICY_RESOLVER_RESOURCE_TYPE.BOOKING
        : params.customerId
          ? POLICY_RESOLVER_RESOURCE_TYPE.CUSTOMER
          : params.stationId
            ? POLICY_RESOLVER_RESOURCE_TYPE.STATION
            : POLICY_RESOLVER_RESOURCE_TYPE.ORGANIZATION;

    return {
      organizationId: params.orgId,
      sourceSystem,
      dataCategory: normalizeDataCategories([params.dataCategory])[0],
      purpose: params.purpose,
      action: AUTHORIZATION_DECISION_ACTION.READ,
      processorType,
      processorId: params.processorId ?? params.processorType ?? processorType,
      resourceType,
      resourceId: params.vehicleId ?? params.bookingId ?? params.customerId ?? params.stationId ?? null,
      organizationWideScope: resourceType === POLICY_RESOLVER_RESOURCE_TYPE.ORGANIZATION,
      vehicleId: params.vehicleId ?? null,
      customerId: params.customerId ?? null,
      bookingId: params.bookingId ?? null,
      stationId: params.stationId ?? null,
      dataSubjectReference: params.dataSubjectReference ?? null,
      correlationId: params.correlationId ?? `legacy-${params.orgId}-${Date.now()}`,
      actorType: AuthorizationActorType.SYSTEM,
    };
  }

  private syntheticLegacyRow(
    params: AssertDataAuthorizationParams,
    resolution: PolicyResolverResult,
  ): AuthorizationRow {
    return {
      id: resolution.matchedPolicy!.id,
      organizationId: params.orgId,
      status: 'ACTIVE',
      sourceType: params.sourceType as DataAuthorizationSourceType,
      processorType: (params.processorType as DataAuthorizationProcessorType) ?? null,
      dataCategories: [params.dataCategory],
      purposes: [params.purpose],
      purpose: params.purpose,
      scope: 'ORGANIZATION',
      vehicleIds: params.vehicleId ? [params.vehicleId] : [],
      customerIds: params.customerId ? [params.customerId] : [],
      bookingIds: params.bookingId ? [params.bookingId] : [],
      expiresAt: null,
    } as unknown as AuthorizationRow;
  }

  private async findMatchingAuthorization(
    params: AssertDataAuthorizationParams,
  ): Promise<AuthorizationRow | null> {
    const now = new Date();
    const normalizedCategory = normalizeDataCategories([
      params.dataCategory,
    ])[0];

    const rows = await this.prisma.orgDataAuthorization.findMany({
      where: {
        organizationId: params.orgId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        sourceType: params.sourceType as DataAuthorizationSourceType,
      },
    });

    for (const row of rows) {
      if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) continue;
      if (!this.coversProcessor(row, params.processorType)) continue;
      if (!this.coversCategory(row, normalizedCategory)) continue;
      if (!this.coversPurpose(row, params.purpose)) continue;
      if (!this.coversScope(row, params)) continue;
      return row;
    }

    return null;
  }

  private coversProcessor(
    row: AuthorizationRow,
    processorType?: string,
  ): boolean {
    if (!processorType) return true;
    if (!row.processorType) return true;
    return row.processorType === processorType;
  }

  private coversCategory(row: AuthorizationRow, category: string): boolean {
    const stored = this.jsonStringArray(row.dataCategories);
    const normalized = new Set(normalizeDataCategories(stored));
    return normalized.has(category);
  }

  private coversPurpose(row: AuthorizationRow, purpose: string): boolean {
    const purposes = this.resolvePurposes(row);
    if (purposes.length === 0) return true;
    return purposes.includes(purpose);
  }

  private coversScope(
    row: AuthorizationRow,
    params: AssertDataAuthorizationParams,
  ): boolean {
    switch (row.scope) {
      case 'ORGANIZATION':
        return true;
      case 'CONNECTED_VEHICLES': {
        if (!params.vehicleId) return false;
        const ids = this.jsonStringArray(row.vehicleIds);
        if (ids.length === 0) return false;
        return ids.includes(params.vehicleId);
      }
      case 'VEHICLE': {
        if (!params.vehicleId) return false;
        const ids = this.jsonStringArray(row.vehicleIds);
        return ids.includes(params.vehicleId);
      }
      case 'CUSTOMER': {
        if (!params.customerId) return false;
        const ids = this.jsonStringArray(row.customerIds);
        return ids.includes(params.customerId);
      }
      case 'BOOKING': {
        if (!params.bookingId) return false;
        const ids = this.jsonStringArray(row.bookingIds);
        return ids.includes(params.bookingId);
      }
      default:
        return false;
    }
  }

  private resolvePurposes(row: AuthorizationRow): string[] {
    const fromJson = this.jsonStringArray(row.purposes);
    if (fromJson.length > 0) return fromJson;
    return row.purpose ? [row.purpose] : [];
  }

  private jsonStringArray(value: Prisma.JsonValue | null | undefined): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string');
  }
}

function mapSourceSystem(sourceType: string): PolicyResolverSourceSystem {
  const key = sourceType as keyof typeof POLICY_RESOLVER_SOURCE_SYSTEM;
  if (key in POLICY_RESOLVER_SOURCE_SYSTEM) {
    return POLICY_RESOLVER_SOURCE_SYSTEM[key];
  }
  return POLICY_RESOLVER_SOURCE_SYSTEM.API_INTEGRATION;
}

function mapProcessorType(processorType?: string): AuthorizationDecisionRequest['processorType'] {
  if (!processorType) return POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE;
  const upper = processorType.toUpperCase();
  if (upper === 'SYNQDRIVE') return POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE;
  if (upper === 'EXTERNAL_PARTNER') return POLICY_RESOLVER_PROCESSOR_TYPE.EXTERNAL_PARTNER;
  if (upper === 'INTERNAL_SYSTEM') return POLICY_RESOLVER_PROCESSOR_TYPE.INTERNAL_SYSTEM;
  if (upper === 'DIMO' || upper === 'HIGH_MOBILITY') {
    return POLICY_RESOLVER_PROCESSOR_TYPE.PROVIDER_PLATFORM;
  }
  return POLICY_RESOLVER_PROCESSOR_TYPE.INTERNAL_SYSTEM;
}
