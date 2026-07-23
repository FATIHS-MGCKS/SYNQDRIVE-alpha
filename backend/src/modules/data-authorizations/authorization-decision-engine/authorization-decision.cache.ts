import type { AuthorizationDecisionCacheEntry, AuthorizationDecisionResult } from './authorization-decision.types';
import type { PolicyResolverResult } from '../policy-resolver/policy-resolver.types';
import { AUTHORIZATION_DECISION_OUTCOME } from './authorization-decision.constants';

/**
 * In-memory version-safe cache for high-frequency ingestion paths.
 * Entries are invalidated when policy version stamp changes or TTL expires.
 */
export class AuthorizationDecisionCache {
  private readonly entries = new Map<string, AuthorizationDecisionCacheEntry>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(cacheKey: string): AuthorizationDecisionResult | null {
    const entry = this.entries.get(cacheKey);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(cacheKey);
      return null;
    }
    return { ...entry.result, cacheHit: true };
  }

  /**
   * Returns cached result only when the live policy version key still matches.
   */
  getIfVersionMatches(
    cacheKey: string,
    currentVersionKey: string,
  ): AuthorizationDecisionResult | null {
    const entry = this.entries.get(cacheKey);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(cacheKey);
      return null;
    }
    if (!currentVersionKey || entry.policyVersionKey !== currentVersionKey) {
      return null;
    }
    return { ...entry.result, cacheHit: true };
  }

  set(cacheKey: string, policyVersionKey: string, result: AuthorizationDecisionResult): void {
    if (result.decision !== AUTHORIZATION_DECISION_OUTCOME.ALLOW) return;
    if (!policyVersionKey) return;

    if (this.entries.size >= this.maxEntries) {
      this.evictOldest();
    }

    this.entries.set(cacheKey, {
      result,
      policyVersionKey,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private evictOldest(): void {
    const firstKey = this.entries.keys().next().value;
    if (firstKey) this.entries.delete(firstKey);
  }
}

export function buildCacheKey(
  request: {
    organizationId: string;
    sourceSystem: string;
    dataCategory: string;
    purpose: string;
    action: string;
    processorType: string;
    processorIdentity: string;
    resourceType: string;
    resourceId: string | null;
    vehicleId: string | null;
    customerId: string | null;
    bookingId: string | null;
    stationId: string | null;
  },
): string {
  return [
    request.organizationId,
    request.sourceSystem,
    request.dataCategory,
    request.purpose,
    request.action,
    request.processorType,
    request.processorIdentity,
    request.resourceType,
    request.resourceId ?? '',
    request.vehicleId ?? '',
    request.customerId ?? '',
    request.bookingId ?? '',
    request.stationId ?? '',
  ].join('|');
}

export function buildPolicyVersionKey(resolverResult: PolicyResolverResult | null): string {
  if (!resolverResult?.matchedPolicy) return '';
  const policy = resolverResult.matchedPolicy;
  const activityId = resolverResult.processingActivity.entityId ?? '';
  const legalId = resolverResult.legalBasisStatus.entityId ?? '';
  return `${policy.policyFamilyId}:v${policy.versionNumber}:${policy.id}:${activityId}:${legalId}`;
}
