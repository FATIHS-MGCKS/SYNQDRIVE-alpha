import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BatteryRestSession, BatteryRestSessionFeature } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { compareUtf16CodeUnitLexicographic } from '../feature-input-canonical.serializer';
import { selectCanonicalRestSessionFeatureShadowRow } from '../rest-session-feature-canonical-row.policy';
import {
  LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS,
  REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION,
} from './longitudinal-input.constants';
import { classifyLongitudinalInputInclusion } from './longitudinal-input.policy';
import {
  groupCanonicalCandidatesByRestSessionId,
  LongitudinalInputRepository,
  type LongitudinalInputSnapshotHooks,
} from './longitudinal-input.repository';
import { parseLongitudinalInputSnapshotSummary } from './longitudinal-input.snapshot-parser';
import type {
  LongitudinalInputReadOutcome,
  LongitudinalInputReadRequest,
  LongitudinalInputSessionInventoryItem,
} from './longitudinal-input.types';

function toIso(date: Date): string {
  return date.toISOString();
}

function buildInventoryItem(input: {
  session: BatteryRestSession;
  canonicalRow: BatteryRestSessionFeature | null;
  inputContractResolved: boolean;
  parsedSnapshot: ReturnType<typeof parseLongitudinalInputSnapshotSummary>;
}): LongitudinalInputSessionInventoryItem {
  const quality = classifyLongitudinalInputInclusion({
    session: input.session,
    canonicalRow: input.canonicalRow,
    inputContractResolved: input.inputContractResolved,
  });

  const row = input.canonicalRow;
  const parsed =
    input.parsedSnapshot.status === 'OK' ? input.parsedSnapshot.parsed : null;

  const version = row
    ? {
        featureModelVersion: row.featureModelVersion,
        retentionPolicyVersion: row.retentionPolicyVersion,
        chargeOpportunityPolicyVersion: row.chargeOpportunityPolicyVersion,
        inputContractVersion: parsed?.inputContractVersion ?? null,
        inputContractResolution: input.inputContractResolved
          ? ('RESOLVED' as const)
          : ('UNRESOLVED' as const),
      }
    : null;

  return {
    organizationId: input.session.organizationId,
    vehicleId: input.session.vehicleId,
    restSessionId: input.session.id,
    session: {
      anchorAt: toIso(input.session.anchorAt),
      sessionStatus: input.session.sessionStatus,
      endReason: input.session.endReason,
      openedAt: toIso(input.session.openedAt),
      endedAt: input.session.endedAt ? toIso(input.session.endedAt) : null,
    },
    canonical: row
      ? {
          canonicalFeatureRowId: row.id,
          semanticRevision: row.semanticRevision,
          computationPhase: row.computationPhase,
          sessionTrust: row.sessionTrust,
          inputDigest: row.inputDigest,
        }
      : null,
    version,
    features: row
      ? {
          shutdownToFirstRestDeltaMv: row.shutdownToFirstRestDeltaMv,
          robustRestSlopeMvPerHour: row.robustRestSlopeMvPerHour,
          minimumRestVoltageMv: row.minimumRestVoltageMv,
          maximumRestVoltageMv: row.maximumRestVoltageMv,
          medianRestVoltageMv: row.medianRestVoltageMv,
          restVoltageVarianceMv2: row.restVoltageVarianceMv2,
          numberOfValidRestPoints: row.numberOfValidRestPoints,
          maxActualRestAgeMs: row.maxActualRestAgeMs,
          maxInterObservationGapMs: row.maxInterObservationGapMs,
          observationSpanMs: row.observationSpanMs,
          missingRungCount: row.missingRungCount,
          chargeOpportunityClass: row.chargeOpportunityClass,
        }
      : null,
    snapshot: parsed
      ? {
          anchorResolutionStatus: parsed.anchorResolutionStatus,
          chargeContextCompleteness: parsed.chargeContextCompleteness,
          temperatureC: parsed.temperatureC,
          temperatureSource: parsed.temperatureSource,
        }
      : null,
    quality,
  };
}

@Injectable()
export class LongitudinalInputReaderService {
  private snapshotHooks: LongitudinalInputSnapshotHooks | null = null;

  constructor(private readonly prisma: PrismaService) {}

  setSnapshotHooksForTests(hooks: LongitudinalInputSnapshotHooks | null): void {
    this.snapshotHooks = hooks;
  }

  async readInventory(
    request: LongitudinalInputReadRequest,
  ): Promise<LongitudinalInputReadOutcome> {
    const { sessionLimit } = request;
    if (
      !Number.isInteger(sessionLimit) ||
      sessionLimit < 1 ||
      !Number.isFinite(sessionLimit)
    ) {
      return { status: 'REJECTED', reason: 'INVALID_SESSION_LIMIT' };
    }
    if (sessionLimit > LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS) {
      return { status: 'REJECTED', reason: 'SESSION_LIMIT_EXCEEDED' };
    }

    const appliedSessionLimit = sessionLimit;
    const hooks = this.snapshotHooks ?? undefined;

    const snapshot = await this.prisma.$transaction(
      async (tx) =>
        new LongitudinalInputRepository(tx as unknown as PrismaService).loadLongitudinalInputReadSnapshot(
          {
            organizationId: request.organizationId,
            vehicleId: request.vehicleId,
            sessionLimit: appliedSessionLimit,
          },
          hooks,
        ),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );

    const candidatesBySession = groupCanonicalCandidatesByRestSessionId(
      snapshot.canonicalCandidates,
    );

    const sessionsChronological = [...snapshot.sessions].sort((a, b) => {
      const anchorDiff = a.anchorAt.getTime() - b.anchorAt.getTime();
      if (anchorDiff !== 0) return anchorDiff;
      return compareUtf16CodeUnitLexicographic(a.id, b.id);
    });

    const sessions: LongitudinalInputSessionInventoryItem[] =
      sessionsChronological.map((session) => {
        const candidates = candidatesBySession.get(session.id) ?? [];
        const canonicalRow = selectCanonicalRestSessionFeatureShadowRow({
          sessionStatus: session.sessionStatus,
          endReason: session.endReason,
          rows: candidates,
        });

        const parsedSnapshot = canonicalRow
          ? parseLongitudinalInputSnapshotSummary({
              inputSummary: canonicalRow.inputSummary,
              organizationId: request.organizationId,
              vehicleId: request.vehicleId,
              restSessionId: session.id,
            })
          : { status: 'UNRESOLVED' as const };

        const inputContractResolved = parsedSnapshot.status === 'OK';

        return buildInventoryItem({
          session,
          canonicalRow,
          inputContractResolved,
          parsedSnapshot,
        });
      });

    return {
      status: 'OK',
      result: {
        longitudinalInputContractVersion:
          REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION,
        organizationId: request.organizationId,
        vehicleId: request.vehicleId,
        dbSafetyMaxSessions: LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS,
        requestedSessionLimit: request.sessionLimit,
        appliedSessionLimit,
        sessions,
      },
    };
  }
}
