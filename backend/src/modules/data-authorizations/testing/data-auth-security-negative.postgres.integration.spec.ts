import { randomUUID } from 'crypto';
import {
  AuthorizationActorType,
  DataSharingAuthorizationStatus,
  DataSubjectConsentStatus,
  PrismaClient,
  PrivacyEnforcementMode,
  PrivacyEnforcementScopeType,
  PrivacyLegalBasisType,
  PrivacyPolicyLifecycleStatus,
  PrivacyProcessingDataCategory,
  PrivacyProcessingPurpose,
  ProviderAccessGrantStatus,
} from '@prisma/client';
import {
  AUTHORIZATION_DECISION_ACTION,
  AUTHORIZATION_DECISION_OUTCOME,
  AUTHORIZATION_DECISION_REASON,
} from '../authorization-decision-engine/authorization-decision.constants';
import { AuthorizationDecisionCache, buildCacheKey } from '../authorization-decision-engine/authorization-decision.cache';
import { buildAuthorizationDecisionContext } from '../authorization-decision-engine/authorization-decision.context';
import { evaluateAuthorizationDecision } from '../authorization-decision-engine/authorization-decision.engine';
import {
  POLICY_RESOLVER_ACTION,
  POLICY_RESOLVER_DECISION,
  POLICY_RESOLVER_PROCESSOR_TYPE,
  POLICY_RESOLVER_REASON,
  POLICY_RESOLVER_RESOURCE_TYPE,
  POLICY_RESOLVER_SOURCE_SYSTEM,
} from '../policy-resolver/policy-resolver.constants';
import {
  validateDataSubjectConsent,
  validateEnforcementPolicy,
  validateProviderAccessGrant,
} from '../privacy-domain/privacy-domain.invariants';
import {
  cleanupDataAuthPostgresFixture,
  correlationId,
  createDataAuthPostgresFixture,
  probeDataAuthDatabase,
  type DataAuthPostgresFixture,
} from './data-auth-postgres.integration.harness';
import { buildDataAuthPostgresServices } from './data-auth-postgres.services.harness';

const LIVE = process.env.DATA_AUTH_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'Data authorization security negatives (PostgreSQL)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let fixture: DataAuthPostgresFixture;

    beforeAll(async () => {
      dbOk = await probeDataAuthDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
    }, 60_000);

    beforeEach(async () => {
      if (!dbOk) return;
      fixture = await createDataAuthPostgresFixture(prisma);
    });

    afterEach(async () => {
      if (!dbOk || !fixture) return;
      await cleanupDataAuthPostgresFixture(prisma, fixture);
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect().catch(() => undefined);
    });

    function baseDecisionRequest(overrides: Record<string, unknown> = {}) {
      return {
        organizationId: fixture.orgA.id,
        sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
        dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
        purpose: PrivacyProcessingPurpose.LIVE_MAP,
        action: AUTHORIZATION_DECISION_ACTION.READ,
        processorType: POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE,
        processorId: 'synqdrive-platform',
        resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
        resourceId: fixture.vehicleA.id,
        vehicleId: fixture.vehicleA.id,
        correlationId: correlationId(fixture.suffix),
        actorType: AuthorizationActorType.SYSTEM,
        skipCache: true,
        ...overrides,
      };
    }

    describe('tenant and resource manipulation', () => {
      it('denies when organizationId does not match policy tenant', async () => {
        const { policyResolver } = buildDataAuthPostgresServices(prisma);
        const result = await policyResolver.resolve({
          organizationId: fixture.orgB.id,
          sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
          dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
          purpose: PrivacyProcessingPurpose.LIVE_MAP,
          action: POLICY_RESOLVER_ACTION.READ,
          processorType: POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE,
          processorId: 'synqdrive-platform',
          resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
          resourceId: fixture.vehicleA.id,
          vehicleId: fixture.vehicleA.id,
        });
        expect(result.decisionCandidate).toBe(POLICY_RESOLVER_DECISION.DENY);
      });

      it('denies foreign vehicle ID in org A scope', async () => {
        const { decisionService } = buildDataAuthPostgresServices(prisma);
        const result = await decisionService.decide(
          baseDecisionRequest({ vehicleId: fixture.vehicleB.id, resourceId: fixture.vehicleB.id }),
        );
        expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
      });

      it('rejects enforcement policy scope with foreign customer ID at DB layer', async () => {
        await expect(
          prisma.enforcementPolicyCustomer.create({
            data: {
              organizationId: fixture.orgA.id,
              enforcementPolicyId: fixture.enforcementPolicyA.id,
              customerId: fixture.customerB.id,
            },
          }),
        ).rejects.toBeDefined();
      });

      it('rejects enforcement policy scope with foreign booking ID at DB layer', async () => {
        await expect(
          prisma.enforcementPolicyBooking.create({
            data: {
              organizationId: fixture.orgA.id,
              enforcementPolicyId: fixture.enforcementPolicyA.id,
              bookingId: fixture.bookingB.id,
            },
          }),
        ).rejects.toBeDefined();
      });

      it('rejects enforcement policy scope with foreign station ID at DB layer', async () => {
        await expect(
          prisma.enforcementPolicyStation.create({
            data: {
              organizationId: fixture.orgA.id,
              enforcementPolicyId: fixture.enforcementPolicyA.id,
              stationId: fixture.stationB.id,
            },
          }),
        ).rejects.toBeDefined();
      });

      it('rejects provider grant linked to foreign vehicle', () => {
        expect(() =>
          validateProviderAccessGrant({
            organizationId: fixture.orgA.id,
            vehicleOrganizationId: fixture.orgB.id,
            providerStatus: ProviderAccessGrantStatus.ACTIVE,
          }),
        ).toThrow('provider_access_grant_vehicle_organization_mismatch');
      });
    });

    describe('missing or invalid request fields', () => {
      it('denies when purpose is missing', async () => {
        const { decisionService } = buildDataAuthPostgresServices(prisma);
        const result = await decisionService.decide({
          ...baseDecisionRequest(),
          purpose: '',
        });
        expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
      });

      it('denies when processor identity is missing', async () => {
        const { decisionService } = buildDataAuthPostgresServices(prisma);
        const result = await decisionService.decide({
          ...baseDecisionRequest(),
          processorId: null,
          serviceIdentity: null,
        });
        expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
      });

      it('denies unknown data category', async () => {
        const { policyResolver } = buildDataAuthPostgresServices(prisma);
        const result = await policyResolver.resolve({
          organizationId: fixture.orgA.id,
          sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
          dataCategory: 'UNKNOWN_CATEGORY' as never,
          purpose: PrivacyProcessingPurpose.LIVE_MAP,
          action: POLICY_RESOLVER_ACTION.READ,
          processorType: POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE,
          processorId: 'synqdrive-platform',
          resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
          resourceId: fixture.vehicleA.id,
          vehicleId: fixture.vehicleA.id,
        });
        expect(result.decisionCandidate).toBe(POLICY_RESOLVER_DECISION.DENY);
        expect(result.blockingReasons.length).toBeGreaterThan(0);
      });
    });

    describe('policy state and lifecycle negatives', () => {
      it('denies expired enforcement policy', async () => {
        await prisma.enforcementPolicy.update({
          where: { id: fixture.enforcementPolicyA.id },
          data: { validUntil: new Date('2020-01-01T00:00:00.000Z') },
        });

        const { decisionService } = buildDataAuthPostgresServices(prisma);
        const result = await decisionService.decide(baseDecisionRequest());
        expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
      });

      it('denies when DPA is missing for external processor', async () => {
        await prisma.dataProcessingAgreement.delete({ where: { id: fixture.dpaA.id } });

        const { policyResolver } = buildDataAuthPostgresServices(prisma);
        const result = await policyResolver.resolve({
          organizationId: fixture.orgA.id,
          sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
          dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
          purpose: PrivacyProcessingPurpose.LIVE_MAP,
          action: POLICY_RESOLVER_ACTION.READ,
          processorType: POLICY_RESOLVER_PROCESSOR_TYPE.EXTERNAL_PARTNER,
          processorId: 'external-partner-1',
          resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
          resourceId: fixture.vehicleA.id,
          vehicleId: fixture.vehicleA.id,
        });
        expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.DPA_MISSING);
      });

      it('denies third-country transfer without mechanism via policy resolver', async () => {
        await prisma.dataSharingAuthorization.update({
          where: { id: fixture.dataSharingA.id },
          data: { transferCountry: 'US', transferMechanism: null },
        });

        const { policyResolver } = buildDataAuthPostgresServices(prisma);
        const result = await policyResolver.resolve({
          organizationId: fixture.orgA.id,
          sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
          dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
          purpose: PrivacyProcessingPurpose.LIVE_MAP,
          action: POLICY_RESOLVER_ACTION.READ,
          processorType: POLICY_RESOLVER_PROCESSOR_TYPE.EXTERNAL_PARTNER,
          processorId: `Partner ${fixture.suffix}`,
          resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
          resourceId: fixture.vehicleA.id,
          vehicleId: fixture.vehicleA.id,
        });
        expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.TRANSFER_MECHANISM_REQUIRED);
      });

      it('denies access when processing activity is revoked', async () => {
        await prisma.processingActivity.update({
          where: { id: fixture.processingActivityA.id },
          data: {
            status: PrivacyPolicyLifecycleStatus.REVOKED,
            revokedAt: new Date(),
          },
        });

        const { decisionService } = buildDataAuthPostgresServices(prisma);
        const result = await decisionService.decide(baseDecisionRequest());
        expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
      });
    });

    describe('consent and provider negatives', () => {
      it('denies when consent is required but withdrawn', async () => {
        await prisma.legalBasisAssessment.update({
          where: { id: fixture.legalBasisA.id },
          data: {
            legalBasisType: PrivacyLegalBasisType.CONSENT,
            consentRequirement: 'EXPLICIT_OPT_IN',
          },
        });
        await prisma.dataSubjectConsent.update({
          where: { id: fixture.consentA.id },
          data: {
            consentStatus: DataSubjectConsentStatus.WITHDRAWN,
            withdrawnAt: new Date(),
          },
        });

        const { policyResolver } = buildDataAuthPostgresServices(prisma);
        const result = await policyResolver.resolve({
          organizationId: fixture.orgA.id,
          sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
          dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
          purpose: PrivacyProcessingPurpose.LIVE_MAP,
          action: POLICY_RESOLVER_ACTION.READ,
          processorType: POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE,
          processorId: 'synqdrive-platform',
          resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
          resourceId: fixture.vehicleA.id,
          vehicleId: fixture.vehicleA.id,
          dataSubjectReference: fixture.consentA.dataSubjectReference,
        });
        expect(result.blockingReasons).toContain(POLICY_RESOLVER_REASON.CONSENT_WITHDRAWN);
      });

      it('denies when provider grant is revoked', async () => {
        await prisma.providerAccessGrant.update({
          where: { id: fixture.providerGrantA.id },
          data: {
            providerStatus: ProviderAccessGrantStatus.REVOKED,
            revokedAt: new Date(),
          },
        });

        const { policyResolver } = buildDataAuthPostgresServices(prisma);
        const result = await policyResolver.resolve({
          organizationId: fixture.orgA.id,
          sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
          dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
          purpose: PrivacyProcessingPurpose.LIVE_MAP,
          action: POLICY_RESOLVER_ACTION.READ,
          processorType: POLICY_RESOLVER_PROCESSOR_TYPE.PROVIDER_PLATFORM,
          processorId: 'synqdrive-dimo-snapshot-worker',
          resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
          resourceId: fixture.vehicleA.id,
          vehicleId: fixture.vehicleA.id,
        });
        expect(result.decisionCandidate).toBe(POLICY_RESOLVER_DECISION.DENY);
      });

      it('rejects consent without grantedAt for GRANTED status', () => {
        expect(() =>
          validateDataSubjectConsent({
            organizationId: fixture.orgA.id,
            processingActivityOrganizationId: fixture.orgA.id,
            consentStatus: DataSubjectConsentStatus.GRANTED,
            dataSubjectReference: 'subject-ref-12345678',
          }),
        ).toThrow('data_subject_consent_granted_at_required');
      });
    });

    describe('fail-closed engine behavior', () => {
      it('denies on resolver database error (fail-closed)', () => {
        const { request } = buildAuthorizationDecisionContext(baseDecisionRequest());
        const result = evaluateAuthorizationDecision({
          request: request!,
          resolverResult: null,
          resolverError: true,
          globalDenySwitch: false,
          devBypassEnabled: false,
          isProduction: true,
        });
        expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
        expect(result.reasonCode).toBe(AUTHORIZATION_DECISION_REASON.DATABASE_ERROR);
      });

      it('denies on global deny switch', () => {
        const { request } = buildAuthorizationDecisionContext(baseDecisionRequest());
        const result = evaluateAuthorizationDecision({
          request: request!,
          resolverResult: null,
          resolverError: false,
          globalDenySwitch: true,
          devBypassEnabled: false,
          isProduction: true,
        });
        expect(result.reasonCode).toBe(AUTHORIZATION_DECISION_REASON.GLOBAL_DENY_SWITCH);
      });

      it('invalidates stale cache when policy version changes', () => {
        const cache = new AuthorizationDecisionCache(60_000, 100);
        const { request } = buildAuthorizationDecisionContext(baseDecisionRequest());
        const key = buildCacheKey(request!);
        const allowResult = {
          decision: AUTHORIZATION_DECISION_OUTCOME.ALLOW,
          enforced: true,
          isShadowMode: false,
          reasonCode: AUTHORIZATION_DECISION_REASON.POLICY_MATCH,
          reasonCodes: [AUTHORIZATION_DECISION_REASON.POLICY_MATCH],
          resolverResult: {
            matchedPolicy: { id: 'p1', versionNumber: 1 },
            policyVersion: 1,
          } as never,
          matchedPolicyId: 'p1',
          policyVersion: 1,
          correlationId: 'c1',
          evaluatedAt: new Date().toISOString(),
          engineVersion: '1',
          cacheHit: false,
          auditEventId: null,
          warnings: [],
        };
        cache.set(key, 'org|p1|v1', allowResult);
        expect(cache.getIfVersionMatches(key, 'org|p1|v2')).toBeNull();
      });
    });

    describe('enforcement policy validation', () => {
      it('rejects ACTIVE policy with OFF enforcement mode', () => {
        expect(() =>
          validateEnforcementPolicy({
            organizationId: fixture.orgA.id,
            processingActivityOrganizationId: fixture.orgA.id,
            status: PrivacyPolicyLifecycleStatus.ACTIVE,
            enforcementMode: PrivacyEnforcementMode.OFF,
            scopeType: PrivacyEnforcementScopeType.ORGANIZATION,
          }),
        ).toThrow('enforcement_policy_active_requires_mode');
      });

      it('requires relational vehicle scope for VEHICLE scope type', () => {
        expect(() =>
          validateEnforcementPolicy({
            organizationId: fixture.orgA.id,
            processingActivityOrganizationId: fixture.orgA.id,
            status: PrivacyPolicyLifecycleStatus.DRAFT,
            enforcementMode: PrivacyEnforcementMode.SHADOW,
            scopeType: PrivacyEnforcementScopeType.VEHICLE,
            vehicleScopeCount: 0,
          }),
        ).toThrow('enforcement_policy_vehicle_scope_required');
      });
    });

    describe('cross-tenant audit isolation', () => {
      it('stores authorization decision events only under owning organization', async () => {
        await prisma.authorizationDecisionEvent.create({
          data: {
            organizationId: fixture.orgA.id,
            enforcementPolicyId: fixture.enforcementPolicyA.id,
            processingActivityId: fixture.processingActivityA.id,
            eventType: 'ALLOW',
            actorType: AuthorizationActorType.SYSTEM,
            correlationId: correlationId(fixture.suffix),
          },
        });

        const crossTenant = await prisma.authorizationDecisionEvent.findMany({
          where: {
            organizationId: fixture.orgB.id,
            enforcementPolicyId: fixture.enforcementPolicyA.id,
          },
        });
        expect(crossTenant).toHaveLength(0);
      });
    });
  },
);
