import { Exp021CanaryLiveWindowActivationState } from '@prisma/client';
import { resumeCanaryArmFromLedger } from './reference-capture-exp021-canary-live-window-activation.arm.lib';

describe('resumeCanaryArmFromLedger', () => {
  const persistence = {
    updateLedger: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    persistence.updateLedger.mockClear();
  });

  it('resumes from CLAIMED through all states without duplicate study run when already RECORDING_STARTED', async () => {
    const reserve = jest.fn().mockResolvedValue({ studyRunId: 'run-1' });
    const createSession = jest.fn().mockResolvedValue({ sessionId: 'sess-1' });
    const runPreflight = jest.fn().mockResolvedValue(undefined);
    const executeFastGo = jest.fn().mockResolvedValue({ ready: true, blockers: [] });

    await resumeCanaryArmFromLedger(
      {
        id: 'led-1',
        vehicleTripId: 'trip-1',
        state: Exp021CanaryLiveWindowActivationState.CLAIMED,
        studyRunId: null,
        sessionId: null,
      },
      'enr-1',
      { reserveStudyRun: reserve, createSession, runPreflight, executeFastGo },
      persistence,
    );

    expect(reserve).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(runPreflight).toHaveBeenCalledTimes(1);
    expect(executeFastGo).toHaveBeenCalledTimes(1);
  });

  it('does not recreate study run when ledger already STUDY_RUN_RESERVED', async () => {
    const reserve = jest.fn();
    const createSession = jest.fn().mockResolvedValue({ sessionId: 'sess-1' });
    const runPreflight = jest.fn().mockResolvedValue(undefined);
    const executeFastGo = jest.fn().mockResolvedValue({ ready: true, blockers: [] });

    await resumeCanaryArmFromLedger(
      {
        id: 'led-1',
        vehicleTripId: 'trip-1',
        state: Exp021CanaryLiveWindowActivationState.STUDY_RUN_RESERVED,
        studyRunId: 'run-1',
        sessionId: null,
      },
      'enr-1',
      { reserveStudyRun: reserve, createSession, runPreflight, executeFastGo },
      persistence,
    );

    expect(reserve).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('crash after RECORDING_STARTED returns existing linkage without side effects', async () => {
    const reserve = jest.fn();
    const createSession = jest.fn();
    const runPreflight = jest.fn();
    const executeFastGo = jest.fn();

    const out = await resumeCanaryArmFromLedger(
      {
        id: 'led-1',
        vehicleTripId: 'trip-1',
        state: Exp021CanaryLiveWindowActivationState.RECORDING_STARTED,
        studyRunId: 'run-1',
        sessionId: 'sess-1',
      },
      'enr-1',
      { reserveStudyRun: reserve, createSession, runPreflight, executeFastGo },
      persistence,
    );

    expect(out).toEqual({ sessionId: 'sess-1', studyRunId: 'run-1' });
    expect(reserve).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(executeFastGo).not.toHaveBeenCalled();
  });
});
