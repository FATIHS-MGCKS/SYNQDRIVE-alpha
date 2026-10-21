/**
 * P5B.2 HISTORY_AS_OF offline replay (disposable PostgreSQL).
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiApdsP5b1OfflineReplayService } from './vsi-apds-p5b1-offline-replay.service';
import { VsiApdsP5b1DecisionRepository } from './vsi-apds-p5b1-decision.repository';
import { VsiApdsP5b1EvidenceWriter } from './vsi-apds-p5b1-evidence.writer';
import { VsiApdsP5ReadonlyService } from './vsi-apds-p5.service';
import { VsiCapabilityResolverRepository } from './vsi-capability-resolver.repository';
import { VsiProfileRevisionHistoryRepository } from './vsi-profile-revision-history.repository';
import { VsiApdsP5b1OfflineReplayProfileMode } from './vsi-apds-p5b2.types';
import { VsiApdsProfileEvidenceInterpretation } from './vsi-apds-profile-evidence-time';
import { VsiProfileRevisionAsOfAuthority } from './vsi-profile-revision-as-of.types';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { P25_APD_B4_V1 } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-versions';
import { P25_APD_SHADOW_EXECUTION_VERSION_CURRENT } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-shadow/p25-apd-shadow-execution-versions';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

(LIVE ? describe : describe.skip)('VSI P5B.2 HISTORY_AS_OF offline replay (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const profiles = new VsiCapabilityResolverRepository(prisma as never);
  const replay = new VsiApdsP5b1OfflineReplayService(
    new VsiApdsP5b1DecisionRepository(prisma as never),
    profiles,
    new VsiApdsP5ReadonlyService(profiles),
    new VsiApdsP5b1EvidenceWriter(prisma as never),
    new VsiProfileRevisionHistoryRepository(prisma as never),
  );

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('uses historical revision for vehicle_speed when mutable profile diverged', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: { aftermarketDevice: { id: 'T1' }, syntheticDevice: null },
    });
    const decisionAt = new Date('2026-10-12T06:00:00.000Z');
    const historicalEval = new Date('2026-10-11T10:00:00.000Z');
    const lifecycleCtx = {
      version: 'vsi-profile-revision-link-context-v1',
      linkId: fixture.linkId,
      isActive: true,
      activatedAt: '2026-08-01T00:00:00.000Z',
      deactivatedAt: null,
      supersededByLinkId: null,
    };
    const historicalSignals = [
      {
        canonicalSignalKey: 'vehicle_speed',
        declaredSupport: 'LISTED',
        empiricalObservation: 'OBSERVED',
        lastSourceTimestamp: '2026-10-11T09:00:00.000Z',
        lastValidObservationAt: '2026-10-11T09:00:00.000Z',
        freshnessClassification: 'FRESH',
        qualityClassification: 'RELIABLE',
        confidenceLevel: 'HIGH',
        limitations: [],
      },
    ];
    await prisma.vehicleSignalCapabilityProfileRevision.create({
      data: {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        profileRevision: 1,
        profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
        contentFingerprint: 'hist-speed-observed',
        providerIdentity: 'DIMO',
        verifiedModality: 'HARDWARE_DEVICE',
        telemetrySourceFamily: 'TESLA',
        evaluatedAt: historicalEval,
        recordedAt: historicalEval,
        signalsSnapshot: historicalSignals,
        profileLimitations: [],
        materializationTrigger: 'SNAPSHOT_HOOK',
        sourceLinkLifecycleContext: lifecycleCtx,
        sourceProvenance: {
          version: 'vsi-profile-revision-provenance-v1',
          declaredCatalogCheckedAt: null,
          lastMaterializedSourceTimestamp: '2026-10-11T09:00:00.000Z',
          lastMaterializedProviderFetchAt: '2026-10-11T09:00:00.000Z',
          lastProvenStrictSourceAdvanceAt: null,
        },
      },
    });

    await prisma.vehicleSignalCapabilityProfile.create({
      data: {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        profileRevision: 99,
        profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
        contentFingerprint: 'current-never-observed',
        providerIdentity: 'DIMO',
        verifiedModality: 'HARDWARE_DEVICE',
        telemetrySourceFamily: 'TESLA',
        evaluatedAt: new Date('2026-10-15T00:00:00.000Z'),
        signalsSnapshot: [
          {
            canonicalSignalKey: 'vehicle_speed',
            declaredSupport: 'LISTED',
            empiricalObservation: 'CURRENT_WINDOW_NEVER_OBSERVED',
            lastSourceTimestamp: null,
            lastValidObservationAt: null,
            freshnessClassification: 'UNKNOWN',
            limitations: [],
          },
        ],
        profileLimitations: [],
      },
    });

    const opportunityId = `opp-p5b2-${randomUUID()}`;
    await prisma.apdShadowReconciliationDecision.create({
      data: {
        organizationId,
        vehicleId: fixture.vehicleId,
        opportunityId,
        decisionAt,
        policyVersion: P25_APD_B4_V1,
        activationEpochId: null,
        profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
        profileClass: 'SPARSE_IRREGULAR',
        decision: 'HOLD',
        reason: 'p5b2-hist',
        shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_VERSION_CURRENT,
        reconciliation: false,
      },
    });

    const legacy = await replay.runOfflineReplayBatch({
      filter: {
        organizationId,
        vehicleId: fixture.vehicleId,
        opportunityId,
        decisionAtFrom: new Date('2026-10-12T00:00:00.000Z'),
        decisionAtTo: new Date('2026-10-13T00:00:00.000Z'),
      },
      pagination: { limit: 10 },
      maxTotalDecisions: 50,
      dryRun: true,
      replayProfileMode: VsiApdsP5b1OfflineReplayProfileMode.LEGACY_MUTABLE_PROFILE,
    });
    expect(legacy.rows[0]?.processingStatus).toBe('PROFILE_NOT_ASSESSABLE');

    const historical = await replay.runOfflineReplayBatch({
      filter: {
        organizationId,
        vehicleId: fixture.vehicleId,
        opportunityId,
        decisionAtFrom: new Date('2026-10-12T00:00:00.000Z'),
        decisionAtTo: new Date('2026-10-13T00:00:00.000Z'),
      },
      pagination: { limit: 10 },
      maxTotalDecisions: 50,
      dryRun: true,
      replayProfileMode: VsiApdsP5b1OfflineReplayProfileMode.HISTORY_AS_OF,
    });
    expect(historical.rows).toHaveLength(1);
    const row = historical.rows[0]!;
    expect(row.historicalRevisionAuthority).toBe(
      VsiProfileRevisionAsOfAuthority.PRIOR_REVISION_FOUND,
    );
    expect(row.observation?.profileEvidenceInterpretation).toBe(
      VsiApdsProfileEvidenceInterpretation.LIMITED_HISTORICAL_REVISION_EVIDENCE,
    );
    const speed = row.observation?.signals.find((s) => s.canonicalSignalKey === 'vehicle_speed');
    expect(speed?.empiricalObservation).toBe('OBSERVED');
    expect(speed?.qualityClassification).toBe('RELIABLE');
    expect(historical.historicalScientificMetrics?.verifiedDecisionTimeEvidence).toBe(0);

    const revisionCountBefore = await prisma.vehicleSignalCapabilityProfileRevision.count({
      where: { organizationId },
    });
    expect(revisionCountBefore).toBe(1);

    await prisma.apdShadowReconciliationDecision.deleteMany({ where: { organizationId } });
    await prisma.vehicleSignalCapabilityProfileRevision.deleteMany({ where: { organizationId } });
    await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it('attributes link deactivated today but active at decisionAt', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: { aftermarketDevice: { id: 'R2' }, syntheticDevice: null },
    });
    const decisionAt = new Date('2026-10-12T06:00:00.000Z');
    await prisma.vehicleDataSourceLink.update({
      where: { id: fixture.linkId },
      data: {
        isActive: false,
        activatedAt: new Date('2026-08-01T00:00:00.000Z'),
        deactivatedAt: new Date('2026-10-14T00:00:00.000Z'),
      },
    });
    const lifecycleCtx = {
      version: 'vsi-profile-revision-link-context-v1',
      linkId: fixture.linkId,
      isActive: false,
      activatedAt: '2026-08-01T00:00:00.000Z',
      deactivatedAt: '2026-10-14T00:00:00.000Z',
      supersededByLinkId: null,
    };
    const evalAt = new Date('2026-10-11T10:00:00.000Z');
    await prisma.vehicleSignalCapabilityProfileRevision.create({
      data: {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        profileRevision: 1,
        profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
        contentFingerprint: 'deact-link-hist',
        providerIdentity: 'DIMO',
        verifiedModality: 'HARDWARE_DEVICE',
        telemetrySourceFamily: 'RUPTELA_R1',
        evaluatedAt: evalAt,
        recordedAt: evalAt,
        signalsSnapshot: [
          {
            canonicalSignalKey: 'lv_voltage',
            declaredSupport: 'LISTED',
            empiricalObservation: 'OBSERVED',
            lastSourceTimestamp: '2026-10-11T09:00:00.000Z',
            lastValidObservationAt: '2026-10-11T09:00:00.000Z',
            freshnessClassification: 'FRESH',
            limitations: [],
          },
        ],
        profileLimitations: [],
        materializationTrigger: 'SNAPSHOT_HOOK',
        sourceLinkLifecycleContext: lifecycleCtx,
        sourceProvenance: {
          version: 'vsi-profile-revision-provenance-v1',
          declaredCatalogCheckedAt: null,
          lastMaterializedSourceTimestamp: '2026-10-11T09:00:00.000Z',
          lastMaterializedProviderFetchAt: '2026-10-11T09:00:00.000Z',
          lastProvenStrictSourceAdvanceAt: null,
        },
      },
    });

    const opportunityId = `opp-deact-${randomUUID()}`;
    await prisma.apdShadowReconciliationDecision.create({
      data: {
        organizationId,
        vehicleId: fixture.vehicleId,
        opportunityId,
        decisionAt,
        policyVersion: P25_APD_B4_V1,
        activationEpochId: null,
        profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
        profileClass: 'SPARSE_IRREGULAR',
        decision: 'HOLD',
        reason: 'deact',
        shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_VERSION_CURRENT,
        reconciliation: false,
      },
    });

    const result = await replay.runOfflineReplayBatch({
      filter: {
        organizationId,
        vehicleId: fixture.vehicleId,
        opportunityId,
        decisionAtFrom: new Date('2026-10-12T00:00:00.000Z'),
        decisionAtTo: new Date('2026-10-13T00:00:00.000Z'),
      },
      pagination: { limit: 10 },
      maxTotalDecisions: 50,
      dryRun: true,
      replayProfileMode: VsiApdsP5b1OfflineReplayProfileMode.HISTORY_AS_OF,
    });
    expect(result.rows[0]?.sourceLinkAttribution.status).toBe('UNIQUE_ATTRIBUTED');
    expect(result.rows[0]?.observation?.signals.length).toBeGreaterThan(0);
    expect(result.rows[0]?.processingStatus).toBe('CORRELATED');

    await prisma.apdShadowReconciliationDecision.deleteMany({ where: { organizationId } });
    await prisma.vehicleSignalCapabilityProfileRevision.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });
});
