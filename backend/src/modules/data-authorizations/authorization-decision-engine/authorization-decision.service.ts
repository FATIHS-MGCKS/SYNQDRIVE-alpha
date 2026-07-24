import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrivacyProcessingDataCategory, PrivacyProcessingPurpose } from '@prisma/client';
import { PolicyResolverService } from '../policy-resolver/policy-resolver.service';
import type { PolicyResolverInput } from '../policy-resolver/policy-resolver.types';
import {
  AUTHORIZATION_DECISION_ENGINE_VERSION,
  AUTHORIZATION_DECISION_OUTCOME,
  AUTHORIZATION_DECISION_REASON,
  DECISION_TO_RESOLVER_ACTION,
  type AuthorizationDecisionReasonCode,
} from './authorization-decision.constants';
import { readAuthorizationDecisionConfig } from './authorization-decision.config';
import {
  AuthorizationDecisionCache,
  buildCacheKey,
  buildPolicyVersionKey,
} from './authorization-decision.cache';
import { buildAuthorizationDecisionContext } from './authorization-decision.context';
import {
  buildInvalidRequestDecision,
  evaluateAuthorizationDecision,
} from './authorization-decision.engine';
import { DataAuthorizationAuditService } from '../privacy-domain/audit-log/data-authorization-audit.service';
import { DenySwitchService } from '../deny-switch/deny-switch.service';
import type {
  AuthorizationDecisionRequest,
  AuthorizationDecisionResult,
} from './authorization-decision.types';

/**
 * Central fail-closed authorization decision engine.
 * Delegates policy evaluation to PolicyResolverService — no duplicated business logic.
 */
@Injectable()
export class AuthorizationDecisionService {
  private readonly logger = new Logger(AuthorizationDecisionService.name);
  private readonly cache: AuthorizationDecisionCache | null;

  constructor(
    private readonly policyResolver: PolicyResolverService,
    private readonly auditService: DataAuthorizationAuditService,
    @Optional()
    @Inject(forwardRef(() => DenySwitchService))
    private readonly denySwitch?: DenySwitchService,
  ) {
    const config = readAuthorizationDecisionConfig();
    this.cache = config.cacheEnabled
      ? new AuthorizationDecisionCache(config.cacheTtlMs, config.cacheMaxEntries)
      : null;
  }

  async decide(request: AuthorizationDecisionRequest): Promise<AuthorizationDecisionResult> {
    const config = readAuthorizationDecisionConfig();
    const isProduction = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
    const { request: evaluated, reasonCodes } = buildAuthorizationDecisionContext(request);

    if (!evaluated) {
      return buildInvalidRequestDecision(request.correlationId ?? '', reasonCodes);
    }

    if (config.globalDenySwitch) {
      return this.finalize(
        request,
        evaluated,
        evaluateAuthorizationDecision({
          request: evaluated,
          resolverResult: null,
          resolverError: false,
          globalDenySwitch: true,
          devBypassEnabled: config.devBypassEnabled,
          isProduction,
        }),
        config,
      );
    }

    if (this.denySwitch) {
      const deny = this.denySwitch.evaluate({
        organizationId: evaluated.organizationId,
        action: evaluated.action,
        vehicleId: evaluated.vehicleId,
        customerId: evaluated.customerId,
        bookingId: evaluated.bookingId,
        stationId: evaluated.stationId,
        resourceType: evaluated.resourceType,
        resourceId: evaluated.resourceId,
      });
      if (deny?.denied) {
        const denyResult: AuthorizationDecisionResult = {
          decision: AUTHORIZATION_DECISION_OUTCOME.DENY,
          enforced: true,
          isShadowMode: false,
          reasonCode: deny.reasonCode as AuthorizationDecisionReasonCode,
          reasonCodes: deny.reasonCodes as AuthorizationDecisionReasonCode[],
          resolverResult: null,
          matchedPolicyId: null,
          policyVersion: null,
          correlationId: evaluated.correlationId,
          evaluatedAt: new Date().toISOString(),
          engineVersion: AUTHORIZATION_DECISION_ENGINE_VERSION,
          cacheHit: false,
          auditEventId: null,
          warnings: [],
        };
        return this.finalize(request, evaluated, denyResult, config);
      }
    }

    const cacheKey = this.cache && !request.skipCache ? buildCacheKey(evaluated) : null;

    if (cacheKey && this.cache) {
      const hit = this.cache.get(cacheKey);
      if (hit) {
        return { ...hit, correlationId: evaluated.correlationId };
      }
    }

    let resolverResult = null;
    let resolverError = false;

    try {
      resolverResult = await this.policyResolver.resolve(this.toResolverInput(evaluated));
    } catch (error) {
      resolverError = true;
      this.logger.error(
        `Policy resolver failed for org=${evaluated.organizationId} correlation=${evaluated.correlationId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    const result = evaluateAuthorizationDecision({
      request: evaluated,
      resolverResult,
      resolverError,
      globalDenySwitch: false,
      devBypassEnabled: config.devBypassEnabled,
      isProduction,
    });

    const finalized = await this.finalize(request, evaluated, result, config);

    if (cacheKey && this.cache && finalized.decision === 'ALLOW' && finalized.resolverResult) {
      const versionKey = buildPolicyVersionKey(finalized.resolverResult);
      this.cache.set(cacheKey, versionKey, finalized);
    }

    return finalized;
  }

  private async finalize(
    rawRequest: AuthorizationDecisionRequest,
    evaluated: NonNullable<ReturnType<typeof buildAuthorizationDecisionContext>['request']>,
    result: AuthorizationDecisionResult,
    config: ReturnType<typeof readAuthorizationDecisionConfig>,
  ): Promise<AuthorizationDecisionResult> {
    if (rawRequest.skipAudit || !config.auditEnabled) {
      return result;
    }

    try {
      const auditEventId = await this.auditService.recordAuthorizationDecision({
        request: evaluated,
        result,
      });
      return { ...result, auditEventId: auditEventId ?? null };
    } catch (error) {
      this.logger.error(
        `Failed to record authorization decision event correlation=${evaluated.correlationId}`,
        error instanceof Error ? error.stack : String(error),
      );
      if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
        return {
          ...result,
          decision: 'DENY',
          enforced: true,
          isShadowMode: false,
          reasonCode: 'DATABASE_ERROR',
          reasonCodes: ['DATABASE_ERROR', ...result.reasonCodes],
        };
      }
      return result;
    }
  }

  private toResolverInput(
    request: NonNullable<ReturnType<typeof buildAuthorizationDecisionContext>['request']>,
  ): PolicyResolverInput {
    return {
      organizationId: request.organizationId,
      sourceSystem: request.sourceSystem,
      dataCategory: request.dataCategory as PrivacyProcessingDataCategory,
      purpose: request.purpose as PrivacyProcessingPurpose,
      action: DECISION_TO_RESOLVER_ACTION[request.action],
      processorType: request.processorType,
      processorId: request.processorIdentity,
      resourceType: request.resourceType,
      resourceId: request.resourceId,
      stationId: request.stationId,
      customerId: request.customerId,
      bookingId: request.bookingId,
      vehicleId: request.vehicleId,
      dataSubjectReference: request.dataSubjectReference,
      effectiveTimestamp: request.effectiveTimestamp,
      correlationId: request.correlationId,
    };
  }

  /** Drop cached ALLOW decisions for an org — e.g. after authorization revocation. */
  invalidateOrganizationCache(organizationId: string): number {
    if (!this.cache || !organizationId) return 0;
    return this.cache.invalidateOrganization(organizationId);
  }
}
