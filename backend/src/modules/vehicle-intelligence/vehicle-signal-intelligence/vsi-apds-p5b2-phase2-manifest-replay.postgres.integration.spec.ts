/**
 * P5B.2 Phase 2 manifest replay — repository allowlist + ordering (disposable PostgreSQL).
 */
import { ApdShadowActivationEpochLifecycle, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiApdsP5b1DecisionRepository } from './vsi-apds-p5b1-decision.repository';
import { validateVsiApdsP5b2Phase2ManifestDocument } from './vsi-apds-p5b2-phase2-manifest';
import {
  VSI_P5B2_PHASE2_ACTIVATION_EPOCH_ID,
  VSI_P5B2_PHASE2_DECISION_AT_FROM_ISO,
  VSI_P5B2_PHASE2_DECISION_AT_TO_ISO,
} from './vsi-apds-p5b2-phase2-manifest.contract';
import {
  P25_APD_B2_V1,
  P25_APD_B4_V1,
} from '../../../workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-versions';
import { P25_APD_LTE_R1_COHORT_V1 } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-shadow/adaptive-polling-shadow-cohort.config';
import { P25_APD_SHADOW_EXECUTION_VERSION_CURRENT } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-shadow/p25-apd-shadow-execution-versions';
import { createLegacyReconcileOrg } from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

(LIVE ? describe : describe.skip)('VSI P5B.2 Phase 2 manifest repository (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const repository = new VsiApdsP5b1DecisionRepository(prisma as never);

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('loadShadowDecisionsByIds returns rows in manifest order and rejects missing ids', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const vehicleId = randomUUID();
    await prisma.vehicle.create({
      data: {
        id: vehicleId,
        organizationId,
        make: 'Test',
        model: 'Manifest',
        year: 2026,
        fuelType: 'GASOLINE',
        vehicleName: 'manifest-test',
      },
    });
    const epoch = await prisma.apdShadowActivationEpoch.create({
      data: {
        activationScopeKey: `manifest-test-${randomUUID()}`,
        organizationId,
        cohortConfigFingerprintSha256: randomUUID().replace(/-/g, ''),
        cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
        lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
        activatedAt: new Date('2026-10-17T19:00:00.000Z'),
      },
      select: { id: true },
    });

    const decisionAt = new Date('2026-10-18T12:00:00.000Z');
    const idFirst = randomUUID();
    const idSecond = randomUUID();
    const opportunityFirst = `0x${randomUUID().replace(/-/g, '')}`;
    const opportunitySecond = `0x${randomUUID().replace(/-/g, '')}`;

    await prisma.apdShadowReconciliationDecision.createMany({
      data: [
        {
          id: idSecond,
          organizationId,
          vehicleId,
          opportunityId: opportunitySecond,
          decisionAt,
          activationEpochId: epoch.id,
          policyVersion: P25_APD_B2_V1,
          profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
          profileClass: 'TEST',
          decision: 'WOULD_POLL',
          reason: 'TEST',
          shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_VERSION_CURRENT,
          realPollId: randomUUID(),
          realPollStatus: 'SUCCESS',
        },
        {
          id: idFirst,
          organizationId,
          vehicleId,
          opportunityId: opportunityFirst,
          decisionAt: new Date(decisionAt.getTime() - 1000),
          activationEpochId: epoch.id,
          policyVersion: P25_APD_B2_V1,
          profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
          profileClass: 'TEST',
          decision: 'WOULD_SKIP',
          reason: 'TEST',
          shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_VERSION_CURRENT,
        },
      ],
    });

    const rows = await repository.loadShadowDecisionsByIds({
      organizationId,
      decisionIds: [idFirst, idSecond],
    });
    expect(rows.map((r) => r.id)).toEqual([idFirst, idSecond]);

    await expect(
      repository.loadShadowDecisionsByIds({
        organizationId,
        decisionIds: [idFirst, randomUUID()],
      }),
    ).rejects.toThrow(/P5B2_MANIFEST_DECISION_ID_NOT_FOUND/);

    await expect(
      repository.loadShadowDecisionsByIds({
        organizationId,
        decisionIds: [idFirst, idFirst],
      }),
    ).rejects.toThrow(/P5B2_MANIFEST_DUPLICATE_DECISION_ID/);
  });

  it('validates miniature manifest scope against disposable rows', () => {
    const manifest = validateVsiApdsP5b2Phase2ManifestDocument({
      org: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
      vehicles: [
        '68868291-5478-42cd-b0c4-cc77b2a78e21',
        'c10351f8-b6a2-4258-947f-631aeaa6d359',
        '8c850ff1-4201-432b-af2e-2711dbc7ca48',
        '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      ],
      proposedWindow: {
        from: VSI_P5B2_PHASE2_DECISION_AT_FROM_ISO,
        to: VSI_P5B2_PHASE2_DECISION_AT_TO_ISO,
      },
      uniqueDecisionIds: ['test-id'],
      entries: [
        {
          id: 'test-id',
          vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
          decisionAt: '2026-10-18T12:00:00.000Z',
          policyVersion: P25_APD_B2_V1,
          decision: 'WOULD_POLL',
          reason: 'TEST',
          stratum: 'TEST',
        },
      ],
    });
    expect(manifest.activationEpochId).toBe(VSI_P5B2_PHASE2_ACTIVATION_EPOCH_ID);
  });
});
