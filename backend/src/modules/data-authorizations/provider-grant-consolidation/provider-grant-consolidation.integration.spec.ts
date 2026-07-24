import {
  PrivacyPolicyLifecycleStatus,
  ProviderAccessGrantStatus,
} from '@prisma/client';
import {
  POLICY_RESOLVER_ACTION,
  POLICY_RESOLVER_DECISION,
  POLICY_RESOLVER_PROCESSOR_TYPE,
  POLICY_RESOLVER_REASON,
  POLICY_RESOLVER_RESOURCE_TYPE,
  POLICY_RESOLVER_SOURCE_SYSTEM,
} from '../policy-resolver/policy-resolver.constants';
import {
  buildPolicyResolverCandidate,
  resolvePolicyEngine,
} from '../policy-resolver/policy-resolver.engine';
import type { PolicyResolverEvaluatedContext } from '../policy-resolver/policy-resolver.types';
import {
  PROVIDER_GRANT_CONSOLIDATION_REASON,
  resolveProviderKeyFromSourceSystem,
} from './provider-grant-consolidation.constants';
import { evaluateProviderGrantConsolidation } from './provider-grant-consolidation.evaluator';
import { ProviderGrantProvisioningService } from './provider-grant-provisioning.service';
import { ProviderAccessGrantService } from '../privacy-domain/provider-access-grant/provider-access-grant.service';

const ORG = 'org-consolidation';
const VEHICLE = 'vehicle-consolidation';
const ACTIVITY = 'activity-consolidation';
const NOW = '2026-07-24T12:00:00.000Z';

function dimoContext(
  overrides: Partial<PolicyResolverEvaluatedContext> = {},
): PolicyResolverEvaluatedContext {
  return {
    organizationId: ORG,
    sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
    dataCategory: 'TELEMETRY_DATA' as never,
    purpose: 'VEHICLE_HEALTH' as never,
    action: POLICY_RESOLVER_ACTION.INGEST,
    processorType: POLICY_RESOLVER_PROCESSOR_TYPE.PROVIDER_PLATFORM,
    processorId: 'synqdrive-dimo-snapshot-worker',
    resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
    resourceId: VEHICLE,
    stationId: null,
    customerId: null,
    bookingId: null,
    vehicleId: VEHICLE,
    dataSubjectReference: null,
    effectiveTimestamp: NOW,
    ...overrides,
  };
}

function candidateWithGrant(
  grantStatus: ProviderAccessGrantStatus,
  policyStatus: PrivacyPolicyLifecycleStatus = PrivacyPolicyLifecycleStatus.ACTIVE,
  expiresAt: Date | null = null,
) {
  return buildPolicyResolverCandidate({
    enforcementPolicy: {
      id: 'policy-1',
      organizationId: ORG,
      policyFamilyId: 'fam-1',
      versionNumber: 1,
      status: policyStatus,
      enforcementMode: 'ENFORCE' as never,
      dataCategory: 'TELEMETRY_DATA' as never,
      processingPurpose: 'VEHICLE_HEALTH' as never,
      scopeType: 'VEHICLE',
      validFrom: new Date('2026-01-01'),
      validUntil: null,
      pathId: 'path-1',
      processingActivityId: ACTIVITY,
    },
    processingActivity: {
      id: ACTIVITY,
      organizationId: ORG,
      activityCode: 'dimo-telemetry',
      status: PrivacyPolicyLifecycleStatus.ACTIVE,
      validFrom: new Date('2026-01-01'),
      validUntil: null,
    },
    legalBasisAssessments: [
      {
        id: 'lba-1',
        organizationId: ORG,
        processingActivityId: ACTIVITY,
        status: PrivacyPolicyLifecycleStatus.ACTIVE,
        legalBasisType: 'CONTRACT' as never,
        consentRequirement: 'NOT_APPLICABLE' as never,
        validFrom: new Date('2026-01-01'),
        validUntil: null,
        balancingTestReference: null,
        isCurrentVersion: true,
        versionNumber: 1,
        evidenceReferences: [],
      },
    ],
    providerAccessGrants: [
      {
        id: 'grant-1',
        organizationId: ORG,
        provider: 'DIMO',
        providerStatus: grantStatus,
        processingActivityId: ACTIVITY,
        vehicleId: VEHICLE,
        grantedAt: new Date('2026-01-01'),
        expiresAt,
        revokedAt: null,
        scopeKeys: ['telemetry'],
      },
    ],
    scopeVehicleIds: [VEHICLE],
  });
}

describe('provider-grant consolidation integration', () => {
  describe('resolveProviderKeyFromSourceSystem', () => {
    it('maps DIMO sourceSystem despite worker processorId', () => {
      expect(
        resolveProviderKeyFromSourceSystem(
          POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
          'synqdrive-dimo-snapshot-worker',
        ),
      ).toBe('DIMO');
    });

    it('maps HIGH_MOBILITY sourceSystem separately from DIMO', () => {
      expect(
        resolveProviderKeyFromSourceSystem(
          POLICY_RESOLVER_SOURCE_SYSTEM.HIGH_MOBILITY,
          'synqdrive-hm-health-worker',
        ),
      ).toBe('HIGH_MOBILITY');
    });
  });

  describe('evaluateProviderGrantConsolidation', () => {
    it('allows consistent ACTIVE provider and policy', () => {
      const result = evaluateProviderGrantConsolidation({
        organizationId: ORG,
        vehicleId: VEHICLE,
        provider: 'DIMO',
        providerStatus: ProviderAccessGrantStatus.ACTIVE,
        grantExpiresAt: null,
        policyStatus: PrivacyPolicyLifecycleStatus.ACTIVE,
        evaluatedAt: new Date(NOW),
        grantVehicleId: VEHICLE,
      });
      expect(result.allowed).toBe(true);
      expect(result.blockingReasons).toContain(
        PROVIDER_GRANT_CONSOLIDATION_REASON.CONSISTENT_ACTIVE,
      );
    });

    it('blocks Provider ACTIVE + Policy REVOKED', () => {
      const result = evaluateProviderGrantConsolidation({
        organizationId: ORG,
        vehicleId: VEHICLE,
        provider: 'DIMO',
        providerStatus: ProviderAccessGrantStatus.ACTIVE,
        grantExpiresAt: null,
        policyStatus: PrivacyPolicyLifecycleStatus.REVOKED,
        evaluatedAt: new Date(NOW),
        grantVehicleId: VEHICLE,
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons).toContain(
        PROVIDER_GRANT_CONSOLIDATION_REASON.POLICY_REVOKED_PROVIDER_ACTIVE,
      );
      expect(result.blockingReasons).toContain(
        PROVIDER_GRANT_CONSOLIDATION_REASON.PROVIDER_GRANT_POLICY_CONTRADICTION,
      );
    });

    it('blocks Provider REVOKED + Policy ACTIVE', () => {
      const result = evaluateProviderGrantConsolidation({
        organizationId: ORG,
        vehicleId: VEHICLE,
        provider: 'DIMO',
        providerStatus: ProviderAccessGrantStatus.REVOKED,
        grantExpiresAt: null,
        policyStatus: PrivacyPolicyLifecycleStatus.ACTIVE,
        evaluatedAt: new Date(NOW),
        grantVehicleId: VEHICLE,
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons).toContain(
        PROVIDER_GRANT_CONSOLIDATION_REASON.PROVIDER_REVOKED_POLICY_ACTIVE,
      );
    });

    it('blocks expired grant', () => {
      const result = evaluateProviderGrantConsolidation({
        organizationId: ORG,
        vehicleId: VEHICLE,
        provider: 'DIMO',
        providerStatus: ProviderAccessGrantStatus.ACTIVE,
        grantExpiresAt: new Date('2026-06-01'),
        policyStatus: PrivacyPolicyLifecycleStatus.ACTIVE,
        evaluatedAt: new Date(NOW),
        grantVehicleId: VEHICLE,
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons).toContain(
        PROVIDER_GRANT_CONSOLIDATION_REASON.PROVIDER_GRANT_EXPIRED,
      );
    });

    it('does not treat invalid token as legal basis failure', () => {
      const result = evaluateProviderGrantConsolidation({
        organizationId: ORG,
        vehicleId: VEHICLE,
        provider: 'DIMO',
        providerStatus: ProviderAccessGrantStatus.ACTIVE,
        grantExpiresAt: null,
        policyStatus: PrivacyPolicyLifecycleStatus.ACTIVE,
        evaluatedAt: new Date(NOW),
        grantVehicleId: VEHICLE,
        tokenValid: false,
        tokenExpiresAt: new Date('2026-01-01'),
      });
      expect(result.allowed).toBe(true);
      expect(result.warnings).toContain(PROVIDER_GRANT_CONSOLIDATION_REASON.TOKEN_NOT_LEGAL_BASIS);
      expect(result.blockingReasons).not.toContain(
        PROVIDER_GRANT_CONSOLIDATION_REASON.PROVIDER_GRANT_REVOKED,
      );
    });

    it('blocks foreign vehicle scope mismatch', () => {
      const result = evaluateProviderGrantConsolidation({
        organizationId: ORG,
        vehicleId: VEHICLE,
        provider: 'DIMO',
        providerStatus: ProviderAccessGrantStatus.ACTIVE,
        grantExpiresAt: null,
        policyStatus: PrivacyPolicyLifecycleStatus.ACTIVE,
        evaluatedAt: new Date(NOW),
        grantVehicleId: 'other-vehicle',
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons).toContain(
        PROVIDER_GRANT_CONSOLIDATION_REASON.VEHICLE_SCOPE_MISMATCH,
      );
    });
  });

  describe('policy resolver provider grant matching', () => {
    it('allows DIMO ingest when grant matches sourceSystem not processorId', () => {
      const result = resolvePolicyEngine({
        context: dimoContext(),
        candidates: [candidateWithGrant(ProviderAccessGrantStatus.ACTIVE)],
      });
      expect(result.decisionCandidate).toBe(POLICY_RESOLVER_DECISION.ALLOW);
      expect(result.providerGrantStatus.status).toBe(ProviderAccessGrantStatus.ACTIVE);
    });

    it('denies when provider grant is revoked with active policy', () => {
      const result = resolvePolicyEngine({
        context: dimoContext(),
        candidates: [candidateWithGrant(ProviderAccessGrantStatus.REVOKED)],
      });
      expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.PROVIDER_GRANT_REVOKED);
    });

    it('denies expired grant', () => {
      const result = resolvePolicyEngine({
        context: dimoContext(),
        candidates: [
          candidateWithGrant(
            ProviderAccessGrantStatus.ACTIVE,
            PrivacyPolicyLifecycleStatus.ACTIVE,
            new Date('2026-06-01'),
          ),
        ],
      });
      expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.PROVIDER_GRANT_EXPIRED);
    });
  });

  describe('ProviderGrantProvisioningService idempotency', () => {
    it('returns idempotent replay on duplicate webhook key', async () => {
      const prisma = {
        vehicle: { findFirst: jest.fn().mockResolvedValue({ id: VEHICLE }) },
        providerAccessGrant: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'grant-existing',
            legacyVehicleProviderConsentId: 'vpc-existing',
            providerStatus: ProviderAccessGrantStatus.ACTIVE,
          }),
        },
        $transaction: jest.fn(),
      };
      const service = new ProviderGrantProvisioningService(prisma as never);
      const result = await service.provisionAndActivate({
        organizationId: ORG,
        vehicleId: VEHICLE,
        provider: 'HIGH_MOBILITY',
        grantMechanism: 'WEBHOOK',
        scopes: ['health'],
        webhookEventId: 'evt-dup-1',
      });
      expect(result.idempotentReplay).toBe(true);
      expect(result.grantId).toBe('grant-existing');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects foreign vehicle not in organization', async () => {
      const prisma = {
        vehicle: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = new ProviderGrantProvisioningService(prisma as never);
      await expect(
        service.provisionAndActivate({
          organizationId: ORG,
          vehicleId: 'foreign-vehicle',
          provider: 'DIMO',
          grantMechanism: 'OAUTH',
          scopes: ['telemetry'],
        }),
      ).rejects.toThrow('Vehicle not found in organization');
    });
  });

  describe('GET without side effects', () => {
    it('findById does not create or activate grants', async () => {
      const prisma = {
        providerAccessGrant: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'grant-read',
            organizationId: ORG,
            providerStatus: ProviderAccessGrantStatus.PENDING,
            grantedScopes: [],
          }),
          create: jest.fn(),
          update: jest.fn(),
        },
      };
      const service = new ProviderAccessGrantService(prisma as never);
      const row = await service.findById(ORG, 'grant-read');
      expect(row.id).toBe('grant-read');
      expect(prisma.providerAccessGrant.create).not.toHaveBeenCalled();
      expect(prisma.providerAccessGrant.update).not.toHaveBeenCalled();
    });
  });
});
