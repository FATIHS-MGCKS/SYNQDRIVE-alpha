import { Injectable } from '@nestjs/common';
import { PrivacyPolicyLifecycleStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPolicyResolverContext } from './policy-resolver.context';
import { resolvePolicyEngine } from './policy-resolver.engine';
import type { PolicyResolverCandidate, PolicyResolverInput, PolicyResolverResult } from './policy-resolver.types';
import { POLICY_RESOLVER_DECISION, POLICY_RESOLVER_REASON } from './policy-resolver.constants';

const SCOPE_INCLUDE = {
  vehicles: { select: { vehicleId: true } },
  customers: { select: { customerId: true } },
  bookings: { select: { bookingId: true } },
  stations: { select: { stationId: true } },
} as const;

/**
 * Central policy resolver — read-only evaluation of privacy-domain policies.
 * Does not mutate database state.
 */
@Injectable()
export class PolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(input: PolicyResolverInput): Promise<PolicyResolverResult> {
    const { context, blockingReasons } = buildPolicyResolverContext(input);
    const evaluatedAt = new Date().toISOString();

    if (!context) {
      return {
        decisionCandidate: POLICY_RESOLVER_DECISION.DENY,
        matchedPolicy: null,
        policyVersion: null,
        processingActivity: { status: 'UNKNOWN' },
        legalBasisStatus: { status: 'UNKNOWN' },
        consentStatus: { status: 'UNKNOWN' },
        providerGrantStatus: { status: 'UNKNOWN' },
        dataSharingStatus: { status: 'UNKNOWN' },
        dpaStatus: { status: 'UNKNOWN' },
        scopeMatch: { matched: false, scopeType: 'ORGANIZATION' },
        blockingReasons,
        warnings: [],
        evaluatedAt,
        resolverVersion: '1.0.0',
        evaluatedContext: {
          organizationId: input.organizationId ?? '',
          sourceSystem: input.sourceSystem,
          dataCategory: input.dataCategory,
          purpose: input.purpose,
          action: input.action,
          processorType: input.processorType,
          processorId: input.processorId ?? '',
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          stationId: input.stationId ?? null,
          customerId: input.customerId ?? null,
          bookingId: input.bookingId ?? null,
          vehicleId: input.vehicleId ?? null,
          dataSubjectReference: input.dataSubjectReference ?? null,
          effectiveTimestamp: evaluatedAt,
        },
      };
    }

    const candidates = await this.loadCandidates(context.organizationId, context.dataCategory, context.purpose);
    return resolvePolicyEngine({ context, candidates });
  }

  /** Read-only candidate load — explicit findMany, tenant-scoped, no findFirst. */
  async loadCandidates(
    organizationId: string,
    dataCategory: string,
    purpose: string,
  ): Promise<PolicyResolverCandidate[]> {
    const policies = await this.prisma.enforcementPolicy.findMany({
      where: {
        organizationId,
        dataCategory: dataCategory as never,
        processingPurpose: purpose as never,
        isCurrentVersion: true,
        status: {
          in: [
            PrivacyPolicyLifecycleStatus.ACTIVE,
            PrivacyPolicyLifecycleStatus.SUSPENDED,
            PrivacyPolicyLifecycleStatus.SCHEDULED,
          ],
        },
      },
      include: {
        ...SCOPE_INCLUDE,
        processingActivity: true,
      },
      orderBy: [{ versionNumber: 'desc' }, { id: 'asc' }],
    });

    if (policies.length === 0) {
      return [];
    }

    const activityIds = [...new Set(policies.map((p) => p.processingActivityId))];

    const [legalBases, consents, grants, sharing, dpas] = await Promise.all([
      this.prisma.legalBasisAssessment.findMany({
        where: { organizationId, processingActivityId: { in: activityIds } },
        include: { evidenceReferences: { select: { reference: true } } },
      }),
      this.prisma.dataSubjectConsent.findMany({
        where: { organizationId, processingActivityId: { in: activityIds } },
      }),
      this.prisma.providerAccessGrant.findMany({
        where: { organizationId },
        include: { grantedScopes: { select: { scopeKey: true } } },
      }),
      this.prisma.dataSharingAuthorization.findMany({
        where: { organizationId, processingActivityId: { in: activityIds } },
        include: { dataCategories: { select: { dataCategory: true } } },
      }),
      this.prisma.dataProcessingAgreement.findMany({
        where: {
          organizationId,
          isCurrentVersion: true,
          OR: [
            { processingActivityId: { in: activityIds } },
            { linkedActivities: { some: { processingActivityId: { in: activityIds } } } },
          ],
        },
        include: {
          linkedActivities: { select: { processingActivityId: true } },
          transferCountries: true,
        },
      }),
    ]);

    const legalByActivity = groupBy(legalBases, (l) => l.processingActivityId);
    const consentByActivity = groupBy(consents, (c) => c.processingActivityId);
    const sharingByActivity = groupBy(sharing, (s) => s.processingActivityId);
    const dpaByActivity = new Map<string, typeof dpas>();
    for (const dpa of dpas) {
      const linkedIds = new Set<string>();
      if (dpa.processingActivityId) linkedIds.add(dpa.processingActivityId);
      for (const link of dpa.linkedActivities) linkedIds.add(link.processingActivityId);
      for (const activityId of linkedIds) {
        const list = dpaByActivity.get(activityId) ?? [];
        list.push(dpa);
        dpaByActivity.set(activityId, list);
      }
    }

    return policies.map((policy) => ({
      enforcementPolicy: {
        id: policy.id,
        organizationId: policy.organizationId,
        policyFamilyId: policy.policyFamilyId,
        versionNumber: policy.versionNumber,
        status: policy.status,
        enforcementMode: policy.enforcementMode,
        dataCategory: policy.dataCategory,
        processingPurpose: policy.processingPurpose,
        scopeType: policy.scopeType,
        validFrom: policy.validFrom,
        validUntil: policy.validUntil,
        pathId: policy.pathId,
        processingActivityId: policy.processingActivityId,
      },
      processingActivity: policy.processingActivity
        ? {
            id: policy.processingActivity.id,
            organizationId: policy.processingActivity.organizationId,
            activityCode: policy.processingActivity.activityCode,
            status: policy.processingActivity.status,
            validFrom: policy.processingActivity.validFrom,
            validUntil: policy.processingActivity.validUntil,
          }
        : null,
      legalBasisAssessments: (legalByActivity.get(policy.processingActivityId) ?? []).map((l) => ({
        id: l.id,
        organizationId: l.organizationId,
        processingActivityId: l.processingActivityId,
        status: l.status,
        legalBasisType: l.legalBasisType,
        consentRequirement: l.consentRequirement,
        validFrom: l.validFrom,
        validUntil: l.validUntil,
        balancingTestReference: l.balancingTestReference,
        isCurrentVersion: l.isCurrentVersion,
        versionNumber: l.versionNumber,
        evidenceReferences: l.evidenceReferences.map((e) => e.reference),
      })),
      dataSubjectConsents: (consentByActivity.get(policy.processingActivityId) ?? []).map((c) => ({
        id: c.id,
        organizationId: c.organizationId,
        processingActivityId: c.processingActivityId,
        purpose: c.purpose,
        consentStatus: c.consentStatus,
        dataSubjectReference: c.dataSubjectReference,
        grantedAt: c.grantedAt,
        expiresAt: c.expiresAt,
        withdrawnAt: c.withdrawnAt,
      })),
      providerAccessGrants: grants.map((g) => ({
        id: g.id,
        organizationId: g.organizationId,
        provider: g.provider,
        providerStatus: g.providerStatus,
        processingActivityId: g.processingActivityId,
        vehicleId: g.vehicleId,
        grantedAt: g.grantedAt,
        expiresAt: g.expiresAt,
        revokedAt: g.revokedAt,
        scopeKeys: g.grantedScopes.map((s) => s.scopeKey),
      })),
      dataSharingAuthorizations: (sharingByActivity.get(policy.processingActivityId) ?? []).map((s) => ({
        id: s.id,
        organizationId: s.organizationId,
        processingActivityId: s.processingActivityId,
        purpose: s.purpose,
        recipient: s.recipient,
        status: s.status,
        transferCountry: s.transferCountry,
        transferMechanism: s.transferMechanism,
        validFrom: s.validFrom,
        validUntil: s.validUntil,
        dataCategories: s.dataCategories.map((c) => c.dataCategory),
      })),
      dataProcessingAgreements: (dpaByActivity.get(policy.processingActivityId) ?? []).map((d) => ({
        id: d.id,
        organizationId: d.organizationId,
        processingActivityId: d.processingActivityId,
        linkedProcessingActivityIds: d.linkedActivities.map((l) => l.processingActivityId),
        processorName: d.processorName,
        processorRole: d.processorRole,
        status: d.status,
        effectiveFrom: d.effectiveFrom,
        effectiveUntil: d.effectiveUntil,
        signedAt: d.signedAt,
        transferAssessmentStatus: d.transferAssessmentStatus,
        transferCountries: d.transferCountries.map((tc) => ({
          countryCode: tc.countryCode,
          transferMechanism: tc.transferMechanism,
          assessmentStatus: tc.assessmentStatus,
        })),
      })),
      scopeVehicleIds: policy.vehicles.map((v) => v.vehicleId),
      scopeCustomerIds: policy.customers.map((c) => c.customerId),
      scopeBookingIds: policy.bookings.map((b) => b.bookingId),
      scopeStationIds: policy.stations.map((s) => s.stationId),
    }));
  }
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}
