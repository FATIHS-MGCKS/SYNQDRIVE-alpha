import type { BatteryLongitudinalProfileRevision } from '@prisma/client';
import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import { computeLongitudinalScientificProfileFingerprintV1 } from './longitudinal-profile-fingerprint';
import { buildLongitudinalProfileMaterializationPersistenceInput } from './longitudinal-profile-materialization.mapper';
import {
  buildProfileTestInventory,
  buildProfileTestInventoryItem,
  PROFILE_TEST_GENERATED_AT,
  PROFILE_TEST_ORG,
  PROFILE_TEST_VEHICLE,
} from './longitudinal-profile.test-fixtures';
import { LongitudinalIntegrityInspectionRepository } from './longitudinal-integrity-inspection.repository';
import { LongitudinalIntegrityInspectionService } from './longitudinal-integrity-inspection.service';

function mockRevision(): BatteryLongitudinalProfileRevision {
  const assembled = assembleLongitudinalProfileV1({
    inventory: buildProfileTestInventory([
      buildProfileTestInventoryItem({
        restSessionId: 's1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      }),
    ]),
    profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
  });
  if (assembled.status !== 'OK') throw new Error(assembled.reason);
  const fingerprint = computeLongitudinalScientificProfileFingerprintV1(assembled.profile);
  const persistence = buildLongitudinalProfileMaterializationPersistenceInput(fingerprint);
  return {
    id: 'rev-1',
    organizationId: PROFILE_TEST_ORG,
    vehicleId: PROFILE_TEST_VEHICLE,
    longitudinalProfileContractVersion: persistence.longitudinalProfileContractVersion,
    profilePolicyVersion: persistence.profilePolicyVersion,
    canonicalProfileFingerprint: persistence.canonicalProfileFingerprint,
    scientificProfileJson: persistence.scientificProfileJson,
    requestedSessionLimit: persistence.requestedSessionLimit,
    appliedSessionLimit: persistence.appliedSessionLimit,
    candidateRestSessionCount: persistence.candidateRestSessionCount,
    includedSessionCount: persistence.includedSessionCount,
    provisionalSessionCount: persistence.provisionalSessionCount,
    excludedSessionCount: persistence.excludedSessionCount,
    firstIncludedAnchorAt: persistence.firstIncludedAnchorAt,
    lastIncludedAnchorAt: persistence.lastIncludedAnchorAt,
    profileStatus: persistence.profileStatus,
    createdAt: new Date('2026-09-24T12:00:00.000Z'),
    updatedAt: new Date('2026-09-24T12:00:00.000Z'),
    materializedAt: new Date('2026-09-24T12:00:00.000Z'),
  } as unknown as BatteryLongitudinalProfileRevision;
}

function mockPrismaWithRevision(revision: BatteryLongitudinalProfileRevision | null) {
  return {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        batteryLongitudinalProfileRevision: {
          findFirst: jest.fn().mockResolvedValue(revision),
        },
      }),
    ),
    batteryLongitudinalProfileRevision: {},
    batteryRestSessionFeature: {},
    $queryRaw: jest.fn(),
  };
}

describe('LongitudinalIntegrityInspectionService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns REVISION_NOT_FOUND when tenant lookup misses', async () => {
    const service = new LongitudinalIntegrityInspectionService(
      mockPrismaWithRevision(null) as never,
      { nowIso: () => '2026-09-24T12:00:00.000Z' },
    );
    const outcome = await service.inspectRevision({
      organizationId: PROFILE_TEST_ORG,
      vehicleId: PROFILE_TEST_VEHICLE,
      revisionId: 'missing',
    });
    expect(outcome).toEqual({ status: 'REVISION_NOT_FOUND' });
  });

  it('returns OK inspection for coherent revision without source rows', async () => {
    const revision = mockRevision();
    jest
      .spyOn(
        LongitudinalIntegrityInspectionRepository.prototype,
        'readSourceEvidenceBatchInTransaction',
      )
      .mockResolvedValue({
        sourceRowsById: new Map(),
        aggregatesBySessionKey: new Map(),
        totalRowsBySessionKey: new Map(),
        latestRowsBySessionKey: new Map(),
      });

    const service = new LongitudinalIntegrityInspectionService(
      mockPrismaWithRevision(revision) as never,
      { nowIso: () => '2026-09-24T12:00:00.000Z' },
    );
    const outcome = await service.inspectRevision({
      organizationId: PROFILE_TEST_ORG,
      vehicleId: PROFILE_TEST_VEHICLE,
      revisionId: revision.id,
    });
    expect(outcome.status).toBe('OK');
    if (outcome.status === 'OK') {
      expect(outcome.inspection.perSession.length).toBe(1);
      expect(outcome.inspection.profile.overallStatus).toBe('SOURCE_EVIDENCE_LIMITED');
    }
    expect(service.getLastInspectionDbRoundTrips()).toBe(1);
  });

  it('keeps independent DB round-trip budgets for concurrent inspections', async () => {
    const revision = mockRevision();
    jest
      .spyOn(
        LongitudinalIntegrityInspectionRepository.prototype,
        'readSourceEvidenceBatchInTransaction',
      )
      .mockResolvedValue({
        sourceRowsById: new Map(),
        aggregatesBySessionKey: new Map(),
        totalRowsBySessionKey: new Map(),
        latestRowsBySessionKey: new Map(),
      });

    const prisma = mockPrismaWithRevision(revision) as never;
    const serviceA = new LongitudinalIntegrityInspectionService(prisma, {
      nowIso: () => '2026-09-24T12:00:00.000Z',
    });
    const serviceB = new LongitudinalIntegrityInspectionService(prisma, {
      nowIso: () => '2026-09-24T12:00:00.000Z',
    });
    const request = {
      organizationId: PROFILE_TEST_ORG,
      vehicleId: PROFILE_TEST_VEHICLE,
      revisionId: revision.id,
    };
    await Promise.all([serviceA.inspectRevision(request), serviceB.inspectRevision(request)]);
    expect(serviceA.getLastInspectionDbRoundTrips()).toBe(1);
    expect(serviceB.getLastInspectionDbRoundTrips()).toBe(1);
  });
});
