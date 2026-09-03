import {
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
} from '@prisma/client';
import { getBatteryV2ReconciliationIntervalMs } from '@config/battery-health-v2.config';
import { BatteryV2ReconciliationService } from '../jobs/battery-v2-reconciliation.service';
import {
  compareRestAssessmentHandoffReconcileFairness,
  maxScannedRestAssessmentHandoffCandidates,
} from './lv-rest-assessment-handoff-reconciliation.policy';
import { LvRestAssessmentHandoffService } from './lv-rest-assessment-handoff.service';
import {
  LV_REST_ASSESSMENT_HANDOFF_STATUS,
  readAssessmentHandoffFromTargetMetadata,
} from './lv-rest-assessment-handoff.metadata';
import { buildCanonicalLvAssessmentHandoffJobKey } from './lv-rest-assessment-handoff.policy';

jest.mock('@config/battery-health-v2.config', () => {
  const actual = jest.requireActual('@config/battery-health-v2.config');
  return {
    ...actual,
    isBatteryV2RestShadowEnabled: jest.fn().mockReturnValue(true),
    getBatteryV2ReconciliationBatchSize: jest.fn().mockReturnValue(5),
  };
});

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';

type CandidateRow = {
  id: string;
  organizationId: string;
  vehicleId: string;
  sessionId: string;
  type: 'REST_60M';
  provenance: { sourceObservationId: string };
};

type SessionState = {
  metadata: Record<string, unknown>;
  updatedAt: Date;
};

type TargetHandoffMode = 'enqueued_live' | 'missing_repairable';

function buildTargetMetadata(
  index: number,
  measurementId: string,
  mode: TargetHandoffMode,
): Record<string, unknown> {
  const baseTarget = {
    idempotencyKey: `rest-${index}`,
    scheduledFor: new Date().toISOString(),
    status: 'COMPLETED',
  };

  if (mode === 'missing_repairable') {
    return {
      scheduledTargets: {
        REST_60M: baseTarget,
      },
    };
  }

  return {
    scheduledTargets: {
      REST_60M: {
        ...baseTarget,
        assessmentHandoff: {
          measurementId,
          idempotencyKey: buildCanonicalLvAssessmentHandoffJobKey({
            vehicleId: VEH,
            measurementId,
          }),
          status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
          lastAttemptAt: null,
        },
      },
    },
  };
}

function buildFairnessHarness(
  candidateCount: number,
  options?: { targetMode?: TargetHandoffMode; targetIndex?: number },
) {
  const targetIndex = options?.targetIndex ?? candidateCount - 1;
  const targetMode = options?.targetMode ?? 'enqueued_live';
  const sessions = new Map<string, SessionState>();
  const measurements = new Map<string, CandidateRow>();
  const candidates: CandidateRow[] = Array.from({ length: candidateCount }, (_, index) => {
    const id = `clmeasfair${String(index).padStart(21, '0')}`;
    const sessionId = `clsessfair${String(index).padStart(21, '0')}`;
    const row: CandidateRow = {
      id,
      organizationId: ORG,
      vehicleId: VEH,
      sessionId,
      type: 'REST_60M',
      provenance: { sourceObservationId: `obs-${index}` },
    };
    measurements.set(id, row);
    const handoffMode = index === targetIndex ? targetMode : 'enqueued_live';
    sessions.set(sessionId, {
      metadata: buildTargetMetadata(index, id, handoffMode),
      updatedAt: new Date('2026-09-02T10:00:00.000Z'),
    });
    return row;
  });
  const target = candidates[targetIndex]!;
  const targetIdempotencyKey = buildCanonicalLvAssessmentHandoffJobKey({
    vehicleId: VEH,
    measurementId: target.id,
  });

  const prisma = {
    $queryRaw: jest.fn(async () => {
      const incomplete = candidates.filter((row) => {
        const session = sessions.get(row.sessionId);
        const handoff = readAssessmentHandoffFromTargetMetadata(session?.metadata, 'REST_60M');
        return !(
          handoff?.status === LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED &&
          handoff.measurementId === row.id
        );
      });
      incomplete.sort((a, b) => {
        const aAttempt = readAssessmentHandoffFromTargetMetadata(
          sessions.get(a.sessionId)?.metadata,
          'REST_60M',
        )?.lastAttemptAt;
        const bAttempt = readAssessmentHandoffFromTargetMetadata(
          sessions.get(b.sessionId)?.metadata,
          'REST_60M',
        )?.lastAttemptAt;
        return compareRestAssessmentHandoffReconcileFairness(
          { id: a.id, lastAttemptAt: aAttempt },
          { id: b.id, lastAttemptAt: bAttempt },
        );
      });
      const batch = 5;
      return incomplete.slice(0, maxScannedRestAssessmentHandoffCandidates(batch));
    }),
    batteryMeasurement: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string; sessionId?: string } }) => {
        if (where.id) return measurements.get(where.id) ?? null;
        return null;
      }),
    },
    batteryMeasurementSession: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const session = sessions.get(where.id);
        if (!session) return null;
        return {
          id: where.id,
          organizationId: ORG,
          metadata: session.metadata,
          updatedAt: session.updatedAt,
          status: BatteryMeasurementSessionStatus.ACTIVE,
          type: BatteryMeasurementSessionType.LV_REST_WINDOW,
        };
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; organizationId: string; updatedAt?: Date };
          data: { metadata: unknown };
        }) => {
          const session = sessions.get(where.id);
          if (!session) return { count: 0 };
          if (where.updatedAt && where.updatedAt.getTime() !== session.updatedAt.getTime()) {
            return { count: 0 };
          }
          session.metadata = data.metadata as Record<string, unknown>;
          session.updatedAt = new Date(session.updatedAt.getTime() + 1);
          return { count: 1 };
        },
      ),
    },
    batteryFeatures: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleLatestState: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleTrip: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleEnergyEvent: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const jobProducer = {
    enqueue: jest.fn(async (_jobType: string, payload: { inputVersion: string }) => {
      return `bull-${payload.inputVersion}`;
    }),
    hasLiveJob: jest.fn(async (idempotencyKey: string) => idempotencyKey !== targetIdempotencyKey),
  };
  const deadLetters = { isDeadLetter: jest.fn().mockResolvedValue(false) };
  const assessmentHandoff = new LvRestAssessmentHandoffService(
    prisma as never,
    jobProducer as never,
    deadLetters as never,
  );

  const buildService = () =>
    new BatteryV2ReconciliationService(
      prisma as never,
      jobProducer as never,
      { classifyAndEnqueue: jest.fn() } as never,
      deadLetters as never,
      {
        reconcilePeriodicRefresh: jest.fn().mockResolvedValue(0),
        reconcileSignalLossRefresh: jest.fn().mockResolvedValue(0),
      } as never,
      { enqueueSessionOpenForFinalizedTrip: jest.fn() } as never,
      { ensureLvRestWindowForFinalizedTrip: jest.fn() } as never,
      {
        scheduleRest60m: jest.fn(),
        scheduleRest6h: jest.fn(),
        buildScheduledTargetMetadata: jest.fn(),
        getRest60mDelayMs: jest.fn().mockReturnValue(3600000),
        getRest6hDelayMs: jest.fn().mockReturnValue(21600000),
      } as never,
      { enqueueStartProxy: jest.fn() } as never,
      { reconcilePeriodic: jest.fn().mockResolvedValue(0) } as never,
      assessmentHandoff,
      { reconcilePublicationHandoff: jest.fn(), touchReconciliationFairness: jest.fn() } as never,
    );

  return {
    candidates,
    target,
    sessions,
    prisma,
    jobProducer,
    buildService,
  };
}

async function runUntilInspected(
  buildService: () => BatteryV2ReconciliationService,
  target: CandidateRow,
  sessions: Map<string, SessionState>,
  intervalMs: number,
  maxRuns: number,
): Promise<number> {
  let now = 0;
  const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

  try {
    for (let run = 1; run <= maxRuns; run += 1) {
      const service = buildService();
      await service.reconcileAll();
      const handoff = readAssessmentHandoffFromTargetMetadata(
        sessions.get(target.sessionId)?.metadata,
        'REST_60M',
      );
      if (handoff?.lastAttemptAt) {
        return run;
      }
      now += intervalMs;
    }
    return maxRuns;
  } finally {
    dateSpy.mockRestore();
  }
}

describe('lv-rest-assessment-handoff reconciliation fairness', () => {
  it('TEST A — reaches deep candidate at default 300_000ms scheduler cadence (traversal)', async () => {
    const batch = 5;
    const maxScanned = maxScannedRestAssessmentHandoffCandidates(batch);
    const candidateCount = maxScanned + 50;
    const { target, sessions, buildService } = buildFairnessHarness(candidateCount);

    const runs = await runUntilInspected(
      buildService,
      target,
      sessions,
      getBatteryV2ReconciliationIntervalMs(),
      200,
    );

    const handoff = readAssessmentHandoffFromTargetMetadata(
      sessions.get(target.sessionId)?.metadata,
      'REST_60M',
    );
    expect(handoff?.lastAttemptAt).toBeTruthy();
    expect(runs).toBeLessThanOrEqual(Math.ceil(candidateCount / maxScanned) + 2);
  });

  it('TEST B — reaches deep candidate at non-coprime 600_000ms interval (traversal)', async () => {
    const batch = 5;
    const maxScanned = maxScannedRestAssessmentHandoffCandidates(batch);
    const candidateCount = maxScanned + 50;
    const { target, sessions, buildService } = buildFairnessHarness(candidateCount);

    const runs = await runUntilInspected(buildService, target, sessions, 600_000, 200);

    const handoff = readAssessmentHandoffFromTargetMetadata(
      sessions.get(target.sessionId)?.metadata,
      'REST_60M',
    );
    expect(handoff?.lastAttemptAt).toBeTruthy();
    expect(runs).toBeLessThanOrEqual(Math.ceil(candidateCount / maxScanned) + 2);
  });

  it('TEST C — repairable candidate beyond former 32-window capacity is eventually enqueued via reconciliation', async () => {
    const batch = 5;
    const maxScanned = maxScannedRestAssessmentHandoffCandidates(batch);
    const oldWindowCapacity = 32 * maxScanned;
    const candidateCount = oldWindowCapacity + 25;
    const { candidates, target, sessions, buildService, jobProducer } = buildFairnessHarness(
      candidateCount,
      { targetMode: 'missing_repairable' },
    );

    let now = 0;
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      for (let run = 0; run < 500; run += 1) {
        await buildService().reconcileAll();
        const handoff = readAssessmentHandoffFromTargetMetadata(
          sessions.get(target.sessionId)?.metadata,
          'REST_60M',
        );
        if (
          handoff?.status === LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED &&
          handoff.lastAttemptAt
        ) {
          break;
        }
        now += 300_000;
      }
    } finally {
      dateSpy.mockRestore();
    }

    expect(jobProducer.enqueue).toHaveBeenCalledWith(
      'BATTERY_ASSESSMENT_RECOMPUTE',
      expect.objectContaining({
        assessmentType: 'LV_HEALTH',
        inputVersion: target.id,
        sourceEntityId: target.id,
        idempotencyKey: `assess:${VEH}:LV_HEALTH:${target.id}`,
      }),
    );

    const targetHandoff = readAssessmentHandoffFromTargetMetadata(
      sessions.get(target.sessionId)?.metadata,
      'REST_60M',
    );
    expect(targetHandoff?.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED);
    expect(targetHandoff?.measurementId).toBe(target.id);
    expect(targetHandoff?.lastAttemptAt).toBeTruthy();

    const predecessor = candidates[0]!;
    const predecessorHandoff = readAssessmentHandoffFromTargetMetadata(
      sessions.get(predecessor.sessionId)?.metadata,
      'REST_60M',
    );
    expect(predecessorHandoff?.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED);
    expect(predecessorHandoff?.lastAttemptAt).toBeTruthy();
  });

  it('TEST D — fresh service instances preserve fairness without process-local state', async () => {
    const batch = 5;
    const maxScanned = maxScannedRestAssessmentHandoffCandidates(batch);
    const candidateCount = maxScanned + 10;
    const { target, sessions, buildService } = buildFairnessHarness(candidateCount);

    let now = 0;
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      for (let run = 0; run < 30; run += 1) {
        const freshService = buildService();
        await freshService.reconcileAll();
        const handoff = readAssessmentHandoffFromTargetMetadata(
          sessions.get(target.sessionId)?.metadata,
          'REST_60M',
        );
        if (handoff?.lastAttemptAt) break;
        now += 300_000;
      }
    } finally {
      dateSpy.mockRestore();
    }

    expect(
      readAssessmentHandoffFromTargetMetadata(sessions.get(target.sessionId)?.metadata, 'REST_60M')
        ?.lastAttemptAt,
    ).toBeTruthy();
  });
});
