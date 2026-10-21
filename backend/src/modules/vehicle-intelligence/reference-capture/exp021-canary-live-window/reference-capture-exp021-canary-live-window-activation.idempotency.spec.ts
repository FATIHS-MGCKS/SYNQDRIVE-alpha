import { randomUUID } from 'crypto';
import {
  Exp021CanaryLiveWindowActivationState,
  ReferenceCaptureSessionStatus,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { executeIdempotentCanaryArm } from './reference-capture-exp021-canary-live-window-activation.idempotent-arm.lib';
import {
  finalizeCanaryLiveWindowRecording,
  ledgerStateAfterCanaryFinalize,
} from './reference-capture-exp021-canary-live-window-activation.finalize.lib';
import type { CanaryArmLedgerRow } from './reference-capture-exp021-canary-live-window-activation.arm.lib';

function createBarrier(): { waitBoth: () => Promise<void>; releaseBoth: () => void } {
  let count = 0;
  let resolve!: () => void;
  const gate = new Promise<void>((r) => {
    resolve = r;
  });
  return {
    waitBoth: async () => {
      count += 1;
      if (count >= 2) resolve();
      else await gate;
    },
    releaseBoth: () => resolve(),
  };
}

function createInMemoryLedgerPrisma(initial: CanaryArmLedgerRow): {
  prisma: PrismaService;
  getLedger: () => CanaryArmLedgerRow;
} {
  let ledger: CanaryArmLedgerRow = { ...initial };
  const sessions = new Map<string, ReferenceCaptureSessionStatus>();

  const prisma = {
    $transaction: async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    $executeRaw: async () => undefined,
    exp021CanaryLiveWindowActivationLedger: {
      findUnique: async () => ({
        id: ledger.id,
        vehicleTripId: ledger.vehicleTripId,
        state: ledger.state,
        studyRunId: ledger.studyRunId,
        sessionId: ledger.sessionId,
      }),
      update: async ({ data }: { data: Partial<CanaryArmLedgerRow> }) => {
        ledger = { ...ledger, ...data };
        return ledger;
      },
    },
    referenceCaptureSession: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        sessions.has(where.id) ? { id: where.id } : null,
    },
  } as unknown as PrismaService;

  return {
    prisma,
    getLedger: () => ledger,
  };
}

describe('canary live window idempotency', () => {
  const tripId = randomUUID();
  const ledgerId = randomUUID();
  const enrollmentId = randomUUID();
  const baseLedger: CanaryArmLedgerRow = {
    id: ledgerId,
    vehicleTripId: tripId,
    state: Exp021CanaryLiveWindowActivationState.CLAIMED,
    studyRunId: null,
    sessionId: null,
  };

  it('forces two workers through CLAIMED before study run — one run id', async () => {
    const barrier = createBarrier();
    const studyRuns = new Map<string, { id: string }>();
    let reserveCalls = 0;

    const fleetRepository = {
      reserveStudyRunForCanaryActivation: jest.fn(async (input: { canaryActivationVehicleTripId: string }) => {
        reserveCalls += 1;
        await barrier.waitBoth();
        const existing = studyRuns.get(input.canaryActivationVehicleTripId);
        if (existing) {
          return { run: existing, proposed: null, adoptedExisting: true as const };
        }
        const run = { id: `run-${input.canaryActivationVehicleTripId}` };
        studyRuns.set(input.canaryActivationVehicleTripId, run);
        return { run, proposed: null, adoptedExisting: false as const };
      }),
    };

    const runArm = async () => {
      const { prisma, getLedger } = createInMemoryLedgerPrisma(baseLedger);
      let sessionStatus: ReferenceCaptureSessionStatus | null = ReferenceCaptureSessionStatus.CREATED;
      return executeIdempotentCanaryArm({
        prisma,
        fleetRepository: fleetRepository as never,
        ledger: getLedger(),
        enrollmentId,
        resolvedTokenId: 187336,
        organizationId: 'org',
        vehicleId: 'veh',
        createSessionWithId: async (sessionId) => {
          sessionStatus = ReferenceCaptureSessionStatus.CREATED;
        },
        getSessionStatus: async () => sessionStatus,
        runPreflight: async () => {
          sessionStatus = ReferenceCaptureSessionStatus.READY;
        },
        executeFastGo: async () => {
          sessionStatus = ReferenceCaptureSessionStatus.RECORDING;
          return { ready: true, blockers: [] };
        },
        testHooks: { afterLedgerLockedForStudyRun: () => barrier.waitBoth() },
      });
    };

    const [a, b] = await Promise.all([runArm(), runArm()]);
    expect(a.studyRunId).toBe(b.studyRunId);
    expect(studyRuns.size).toBe(1);
    expect(reserveCalls).toBeGreaterThanOrEqual(2);
  });

  it('crash after session create — retry adopts preallocated session id', async () => {
    const { prisma, getLedger } = createInMemoryLedgerPrisma({
      ...baseLedger,
      studyRunId: 'run-1',
      state: Exp021CanaryLiveWindowActivationState.STUDY_RUN_RESERVED,
    });
    let createCount = 0;
    let sessionStatus: ReferenceCaptureSessionStatus | null = null;
    const sessionId = randomUUID();

    const first = executeIdempotentCanaryArm({
      prisma,
      fleetRepository: {
        reserveStudyRunForCanaryActivation: jest.fn(async () => ({
          run: { id: 'run-1' },
          proposed: null,
          adoptedExisting: true as const,
        })),
      } as never,
      ledger: getLedger(),
      enrollmentId,
      resolvedTokenId: 187336,
      organizationId: 'org',
      vehicleId: 'veh',
      createSessionWithId: async (sid) => {
        createCount += 1;
        sessionStatus = ReferenceCaptureSessionStatus.CREATED;
        if (createCount === 1) {
          throw new Error('simulated_crash_after_session_create');
        }
      },
      getSessionStatus: async () => sessionStatus,
      runPreflight: async () => {
        sessionStatus = ReferenceCaptureSessionStatus.READY;
      },
      executeFastGo: async () => ({ ready: true, blockers: [] }),
    });

    await expect(first).rejects.toThrow('simulated_crash_after_session_create');
    expect(getLedger().sessionId).toBeTruthy();

    const boundSessionId = getLedger().sessionId!;
    createCount = 0;
    sessionStatus = null;

    const second = await executeIdempotentCanaryArm({
      prisma,
      fleetRepository: {
        reserveStudyRunForCanaryActivation: jest.fn(),
      } as never,
      ledger: getLedger(),
      enrollmentId,
      resolvedTokenId: 187336,
      organizationId: 'org',
      vehicleId: 'veh',
      createSessionWithId: async (sid) => {
        expect(sid).toBe(boundSessionId);
        createCount += 1;
        sessionStatus = ReferenceCaptureSessionStatus.CREATED;
      },
      getSessionStatus: async () => sessionStatus,
      runPreflight: async () => {
        sessionStatus = ReferenceCaptureSessionStatus.READY;
      },
      executeFastGo: async () => {
        sessionStatus = ReferenceCaptureSessionStatus.RECORDING;
        return { ready: true, blockers: [] };
      },
    });

    expect(second.sessionId).toBe(boundSessionId);
    expect(createCount).toBe(1);
  });

  it('finalize retry with COMPLETED session converges without second stop', async () => {
    let stopCalls = 0;
    let resumeCalls = 0;
    const result = await finalizeCanaryLiveWindowRecording({
      organizationId: 'org',
      sessionId: 'sess-1',
      session: { id: 'sess-1', status: ReferenceCaptureSessionStatus.COMPLETED },
      stopRecording: async () => {
        stopCalls += 1;
      },
      resumeRecordingStop: async () => {
        resumeCalls += 1;
      },
    });
    expect(result.outcome).toBe('adopted_completed');
    expect(stopCalls).toBe(0);
    expect(resumeCalls).toBe(0);
    expect(ledgerStateAfterCanaryFinalize(Exp021CanaryLiveWindowActivationState.RECORDING_STARTED)).toBe(
      Exp021CanaryLiveWindowActivationState.TRIP_COMPLETED_SEEN,
    );
  });

  it('RECORDING session stop runs once', async () => {
    let stopCalls = 0;
    const result = await finalizeCanaryLiveWindowRecording({
      organizationId: 'org',
      sessionId: 'sess-1',
      session: { id: 'sess-1', status: ReferenceCaptureSessionStatus.RECORDING },
      stopRecording: async () => {
        stopCalls += 1;
      },
      resumeRecordingStop: async () => undefined,
    });
    expect(result.outcome).toBe('stopped');
    expect(stopCalls).toBe(1);
  });

  it('STOPPING session resumes stop lifecycle without failing closed', async () => {
    let stopCalls = 0;
    let resumeCalls = 0;
    const result = await finalizeCanaryLiveWindowRecording({
      organizationId: 'org',
      sessionId: 'sess-1',
      session: { id: 'sess-1', status: ReferenceCaptureSessionStatus.STOPPING },
      stopRecording: async () => {
        stopCalls += 1;
      },
      resumeRecordingStop: async () => {
        resumeCalls += 1;
      },
    });
    expect(result.outcome).toBe('stopped');
    expect(result).not.toEqual({ outcome: 'failed', reason: 'session_stopping_in_progress' });
    expect(stopCalls).toBe(0);
    expect(resumeCalls).toBe(1);
  });

  it('STOPPING retry converges without duplicate stopRecording', async () => {
    let resumeCalls = 0;
    const resume = async () => {
      resumeCalls += 1;
    };
    const first = await finalizeCanaryLiveWindowRecording({
      organizationId: 'org',
      sessionId: 'sess-1',
      session: { id: 'sess-1', status: ReferenceCaptureSessionStatus.STOPPING },
      stopRecording: async () => {
        throw new Error('must_not_call_stop_from_stopping');
      },
      resumeRecordingStop: resume,
    });
    const second = await finalizeCanaryLiveWindowRecording({
      organizationId: 'org',
      sessionId: 'sess-1',
      session: { id: 'sess-1', status: ReferenceCaptureSessionStatus.COMPLETED },
      stopRecording: async () => {
        throw new Error('must_not_call_stop_when_completed');
      },
      resumeRecordingStop: resume,
    });
    expect(first.outcome).toBe('stopped');
    expect(second.outcome).toBe('adopted_completed');
    expect(resumeCalls).toBe(1);
  });
});
