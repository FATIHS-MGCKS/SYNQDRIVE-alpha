import { randomUUID } from 'crypto';
import {
  BatteryRestSessionAnchorType,
  BatteryRestSessionChargeOpportunityClass,
  BatteryRestSessionEndReason,
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  BatteryRestSessionStatus,
  type BatteryLongitudinalProfileRevision,
  type BatteryRestSession,
  type BatteryRestSessionFeature,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { computeFeatureInputDigestFromSnapshot } from '../feature-input-canonical.serializer';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from '../rest-session-feature.constants';
import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import { computeLongitudinalScientificProfileFingerprintV1 } from './longitudinal-profile-fingerprint';
import { buildLongitudinalProfileMaterializationPersistenceInput } from './longitudinal-profile-materialization.mapper';
import type { LongitudinalProfileMaterializationRepository } from './longitudinal-profile-materialization.repository';
import { parseLongitudinalInputSnapshotSummary } from './longitudinal-input.snapshot-parser';
import { buildMinimalLongitudinalInputSummary } from './longitudinal-input.test-fixtures';
import type {
  LongitudinalInputExclusionReason,
  LongitudinalInputInclusionMode,
  LongitudinalInputSessionInventoryItem,
  LongitudinalInputVersionTuple,
} from './longitudinal-input.types';
import { REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION } from './longitudinal-input.constants';
import { PROFILE_TEST_GENERATED_AT, versionTuple } from './longitudinal-profile.test-fixtures';
import { LongitudinalIntegrityInspectionService } from './longitudinal-integrity-inspection.service';

export type D4IntegrationSessionSeed = {
  anchorAt: Date;
  inclusionMode: LongitudinalInputInclusionMode;
  exclusionReasons?: LongitudinalInputExclusionReason[];
  version?: LongitudinalInputVersionTuple | null;
  /** When set, profile references this id without persisting a C3 row (missing source). */
  missingCanonicalRowId?: string;
  /** Additional C3 rows for lineage / bounded-window scenarios (not referenced as canonical). */
  extraSemanticRevisions?: number[];
  /** When true, only extra rows are inserted (no canonical row). */
  omitCanonicalRow?: boolean;
  featureCreatedAt?: Date;
};

export type D4SeededRevision = {
  organizationId: string;
  vehicleId: string;
  revision: BatteryLongitudinalProfileRevision;
  sessions: BatteryRestSession[];
  canonicalRows: Map<string, BatteryRestSessionFeature>;
};

export async function createOrgVehicle(prisma: PrismaClient, label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `D4 ${label} ${suffix}`,
      businessType: 'FLEET',
      status: 'ACTIVE',
    },
  });
  const vehicleId = randomUUID();
  const vin = `VIN${suffix}`.slice(0, 17).padEnd(17, '0');
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, hardware_type, status,
      license_plate, created_at, updated_at
    ) VALUES (
      ${vehicleId}::uuid,
      ${org.id}::uuid,
      ${vin},
      'Test',
      'ICE',
      2024,
      'GASOLINE'::"FuelType",
      'LTE_R1'::"HardwareType",
      'AVAILABLE'::"VehicleStatus",
      ${`D4-${suffix}`.slice(0, 32)},
      NOW(),
      NOW()
    )
  `;
  return { organizationId: org.id, vehicleId };
}

export async function createRestSession(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    anchorAt: Date;
    sessionStatus?: BatteryRestSessionStatus;
    endReason?: BatteryRestSessionEndReason | null;
  },
) {
  return prisma.batteryRestSession.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      anchorType: BatteryRestSessionAnchorType.PHYSICAL_SHUTDOWN,
      anchorAt: input.anchorAt,
      sessionStatus: input.sessionStatus ?? BatteryRestSessionStatus.ENDED,
      endReason: input.endReason ?? BatteryRestSessionEndReason.VEHICLE_ACTIVITY,
      openedAt: input.anchorAt,
      idempotencyKey: `rs:${randomUUID()}`,
    },
  });
}

export async function createFeatureRow(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    restSessionId: string;
    semanticRevision: number;
    computationPhase?: BatteryRestSessionFeatureComputationPhase;
    sessionTrust?: BatteryRestSessionFeatureSessionTrust;
    inputSummary?: Record<string, unknown>;
    featureModelVersion?: string;
    retentionPolicyVersion?: string;
    chargeOpportunityPolicyVersion?: string;
    inputContractVersion?: string;
    createdAt?: Date;
    scalarOverrides?: Partial<
      Pick<
        BatteryRestSessionFeature,
        | 'minimumRestVoltageMv'
        | 'maximumRestVoltageMv'
        | 'medianRestVoltageMv'
        | 'shutdownToFirstRestDeltaMv'
      >
    >;
  },
) {
  const inputSummary =
    input.inputSummary ??
    buildMinimalLongitudinalInputSummary({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      restSessionId: input.restSessionId,
      inputContractVersion: input.inputContractVersion,
    });
  const inputDigest = computeFeatureInputDigestFromSnapshot(inputSummary as never);
  const createdAt = input.createdAt ?? new Date('2026-09-20T10:00:00.000Z');
  return prisma.batteryRestSessionFeature.create({
    data: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      restSessionId: input.restSessionId,
      featureModelVersion: input.featureModelVersion ?? REST_SESSION_FEATURE_MODEL_VERSION,
      retentionPolicyVersion:
        input.retentionPolicyVersion ?? REST_SESSION_RETENTION_POLICY_VERSION,
      chargeOpportunityPolicyVersion:
        input.chargeOpportunityPolicyVersion ??
        REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
      semanticRevision: input.semanticRevision,
      inputDigest,
      inputSummary: inputSummary as Prisma.InputJsonValue,
      computationPhase:
        input.computationPhase ?? BatteryRestSessionFeatureComputationPhase.FINAL,
      sessionTrust: input.sessionTrust ?? BatteryRestSessionFeatureSessionTrust.VALID,
      chargeOpportunityClass: BatteryRestSessionChargeOpportunityClass.UNKNOWN,
      numberOfValidRestPoints: 2,
      minimumRestVoltageMv: input.scalarOverrides?.minimumRestVoltageMv ?? 12000,
      maximumRestVoltageMv: input.scalarOverrides?.maximumRestVoltageMv ?? 12100,
      medianRestVoltageMv: input.scalarOverrides?.medianRestVoltageMv ?? 12050,
      shutdownToFirstRestDeltaMv: input.scalarOverrides?.shutdownToFirstRestDeltaMv ?? null,
      computedAt: createdAt,
      createdAt,
    },
  });
}

function inventoryItemFromCanonicalRow(
  organizationId: string,
  vehicleId: string,
  restSession: BatteryRestSession,
  canonicalRow: BatteryRestSessionFeature | null,
  seed: D4IntegrationSessionSeed,
  forcedCanonicalId?: string,
): LongitudinalInputSessionInventoryItem {
  const includePayload =
    seed.inclusionMode === 'DEFAULT' || seed.inclusionMode === 'PROVISIONAL' || Boolean(canonicalRow);
  const resolvedVersion =
    seed.version !== undefined
      ? seed.version
      : canonicalRow
        ? versionTuple({
            featureModelVersion: canonicalRow.featureModelVersion,
            retentionPolicyVersion: canonicalRow.retentionPolicyVersion,
            chargeOpportunityPolicyVersion: canonicalRow.chargeOpportunityPolicyVersion,
            inputContractVersion: REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION,
          })
        : includePayload
          ? versionTuple({})
          : null;

  const snapshotParsed =
    canonicalRow &&
    parseLongitudinalInputSnapshotSummary({
      inputSummary: canonicalRow.inputSummary,
      organizationId,
      vehicleId,
      restSessionId: restSession.id,
    });

  const canonicalId = forcedCanonicalId ?? canonicalRow?.id ?? null;

  return {
    organizationId,
    vehicleId,
    restSessionId: restSession.id,
    session: {
      anchorAt: restSession.anchorAt.toISOString(),
      sessionStatus: restSession.sessionStatus,
      endReason: restSession.endReason,
      openedAt: restSession.openedAt.toISOString(),
      endedAt: restSession.anchorAt.toISOString(),
    },
    canonical:
      includePayload && canonicalId
        ? {
            canonicalFeatureRowId: canonicalId,
            semanticRevision: canonicalRow?.semanticRevision ?? 1,
            computationPhase: canonicalRow?.computationPhase ?? 'FINAL',
            sessionTrust: canonicalRow?.sessionTrust ?? 'VALID',
            inputDigest: canonicalRow?.inputDigest ?? '0'.repeat(64),
          }
        : canonicalId
          ? {
              canonicalFeatureRowId: canonicalId,
              semanticRevision: 1,
              computationPhase: 'FINAL',
              sessionTrust: 'VALID',
              inputDigest: '0'.repeat(64),
            }
          : null,
    version: resolvedVersion,
    features:
      includePayload && canonicalRow
        ? {
            shutdownToFirstRestDeltaMv: canonicalRow.shutdownToFirstRestDeltaMv,
            robustRestSlopeMvPerHour: canonicalRow.robustRestSlopeMvPerHour,
            minimumRestVoltageMv: canonicalRow.minimumRestVoltageMv,
            maximumRestVoltageMv: canonicalRow.maximumRestVoltageMv,
            medianRestVoltageMv: canonicalRow.medianRestVoltageMv,
            restVoltageVarianceMv2: canonicalRow.restVoltageVarianceMv2,
            numberOfValidRestPoints: canonicalRow.numberOfValidRestPoints,
            maxActualRestAgeMs: canonicalRow.maxActualRestAgeMs,
            maxInterObservationGapMs: canonicalRow.maxInterObservationGapMs,
            observationSpanMs: canonicalRow.observationSpanMs,
            missingRungCount: canonicalRow.missingRungCount,
            chargeOpportunityClass: canonicalRow.chargeOpportunityClass,
          }
        : null,
    snapshot:
      includePayload && snapshotParsed?.status === 'OK'
        ? {
            anchorResolutionStatus: snapshotParsed.parsed.anchorResolutionStatus,
            chargeContextCompleteness: snapshotParsed.parsed.chargeContextCompleteness,
            temperatureC: snapshotParsed.parsed.temperatureC,
            temperatureSource: snapshotParsed.parsed.temperatureSource,
          }
        : includePayload
          ? {
              anchorResolutionStatus: 'SELECTED',
              chargeContextCompleteness: [],
              temperatureC: null,
              temperatureSource: 'UNKNOWN',
            }
          : null,
    quality: {
      inclusionMode: seed.inclusionMode,
      exclusionReasons: seed.exclusionReasons ?? [],
      perSessionInspectionStatus: 'NOT_EVALUATED',
    },
  };
}

export async function seedLongitudinalRevision(
  prisma: PrismaClient,
  materializationRepo: LongitudinalProfileMaterializationRepository,
  organizationId: string,
  vehicleId: string,
  sessionSeeds: D4IntegrationSessionSeed[],
): Promise<D4SeededRevision> {
  const sessions: BatteryRestSession[] = [];
  const canonicalRows = new Map<string, BatteryRestSessionFeature>();
  const inventoryItems: LongitudinalInputSessionInventoryItem[] = [];

  for (let i = 0; i < sessionSeeds.length; i++) {
    const seed = sessionSeeds[i];
    const restSession = await createRestSession(prisma, {
      organizationId,
      vehicleId,
      anchorAt: seed.anchorAt,
    });
    sessions.push(restSession);

    let canonicalRow: BatteryRestSessionFeature | null = null;
    if (!seed.omitCanonicalRow && !seed.missingCanonicalRowId) {
      canonicalRow = await createFeatureRow(prisma, {
        organizationId,
        vehicleId,
        restSessionId: restSession.id,
        semanticRevision: 1,
        createdAt: seed.featureCreatedAt,
        inputContractVersion: seed.version?.inputContractVersion ?? undefined,
        featureModelVersion: seed.version?.featureModelVersion,
        retentionPolicyVersion: seed.version?.retentionPolicyVersion,
        chargeOpportunityPolicyVersion: seed.version?.chargeOpportunityPolicyVersion,
      });
      canonicalRows.set(restSession.id, canonicalRow);
    }

    if (seed.extraSemanticRevisions?.length) {
      for (const rev of seed.extraSemanticRevisions) {
        await createFeatureRow(prisma, {
          organizationId,
          vehicleId,
          restSessionId: restSession.id,
          semanticRevision: rev,
          createdAt: seed.featureCreatedAt,
          featureModelVersion: seed.version?.featureModelVersion,
          retentionPolicyVersion: seed.version?.retentionPolicyVersion,
          chargeOpportunityPolicyVersion: seed.version?.chargeOpportunityPolicyVersion,
        });
      }
    }

    inventoryItems.push(
      inventoryItemFromCanonicalRow(
        organizationId,
        vehicleId,
        restSession,
        canonicalRow,
        seed,
        seed.missingCanonicalRowId,
      ),
    );
  }

  const inventory = {
    longitudinalInputContractVersion: REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION,
    organizationId,
    vehicleId,
    dbSafetyMaxSessions: 100,
    requestedSessionLimit: Math.min(100, Math.max(sessionSeeds.length, 10)),
    appliedSessionLimit: Math.min(100, Math.max(sessionSeeds.length, 10)),
    sessions: inventoryItems,
  };

  const assembled = assembleLongitudinalProfileV1({
    inventory,
    profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
  });
  if (assembled.status !== 'OK') {
    throw new Error(`assemble failed: ${assembled.reason}`);
  }

  const fingerprint = computeLongitudinalScientificProfileFingerprintV1(assembled.profile);
  const persistence = buildLongitudinalProfileMaterializationPersistenceInput(fingerprint);
  const outcome = await materializationRepo.insertIdempotent(persistence);
  return {
    organizationId,
    vehicleId,
    revision: outcome.revision,
    sessions,
    canonicalRows,
  };
}

export async function patchRevisionScientificJson(
  prisma: PrismaClient,
  revisionId: string,
  mutator: (json: Record<string, unknown>) => Record<string, unknown>,
) {
  const row = await prisma.batteryLongitudinalProfileRevision.findFirst({
    where: { id: revisionId },
  });
  if (!row) throw new Error('revision missing');
  const current = row.scientificProfileJson as Record<string, unknown>;
  const next = mutator({ ...current });
  await prisma.batteryLongitudinalProfileRevision.update({
    where: { id: revisionId },
    data: { scientificProfileJson: next as Prisma.InputJsonValue },
  });
}

export function buildInspectionService(
  prisma: PrismaClient,
  clockIso = '2026-09-24T12:00:00.000Z',
) {
  return new LongitudinalIntegrityInspectionService(prisma as never, {
    nowIso: () => clockIso,
  });
}

export async function countBatteryV2Tables(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
) {
  const [revisions, features, assessments, publications] = await Promise.all([
    prisma.batteryLongitudinalProfileRevision.count({
      where: { organizationId, vehicleId },
    }),
    prisma.batteryRestSessionFeature.count({ where: { organizationId, vehicleId } }),
    prisma.batteryAssessment.count({ where: { organizationId, vehicleId } }),
    prisma.batteryPublication.count({ where: { organizationId, vehicleId } }),
  ]);
  return { revisions, features, assessments, publications };
}
