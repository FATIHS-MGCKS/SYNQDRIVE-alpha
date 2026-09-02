import { ReferenceCaptureObservationKind, ReferenceCaptureSessionStatus } from '@prisma/client';
import {
  evaluateRecordingSessionViaHttp,
  reconcileAmbiguousStartViaHttp,
  runBoundedSessionCleanup,
  type FastGoHttpClientLike,
} from './reference-capture-fast-go.workflow';

function makeClient(handlers: {
  getSession?: jest.Mock;
  abortSession?: jest.Mock;
}): FastGoHttpClientLike {
  return {
    getSession: handlers.getSession ?? jest.fn(),
    abortSession: handlers.abortSession ?? jest.fn(),
    listObservations: jest.fn(),
  };
}

function sessionView(status: ReferenceCaptureSessionStatus, operational: Record<string, unknown> = {}) {
  return {
    status,
    operational: {
      cycleCount: 0,
      runnerJobId: null,
      pendingCycleJobId: null,
      activeCycleJobId: null,
      ...operational,
    },
  };
}

describe('reference-capture-fast-go.workflow', () => {
  it('PROBE_RESULT and SEGMENT do not satisfy SIGNAL_POINT persistence gate', async () => {
    const client: FastGoHttpClientLike = {
      getSession: jest.fn().mockResolvedValue({
        status: 200,
        data: sessionView(ReferenceCaptureSessionStatus.RECORDING, {
          runnerJobId: 'r',
          pendingCycleJobId: 'p',
          cycleCount: 1,
        }),
      }),
      abortSession: jest.fn(),
      listObservations: jest.fn().mockResolvedValue({
        status: 200,
        data: [
          { observationKind: ReferenceCaptureObservationKind.PROBE_RESULT },
          { observationKind: ReferenceCaptureObservationKind.SEGMENT },
        ],
      }),
    };

    const result = await evaluateRecordingSessionViaHttp(client, 'org', 'veh', 'sess', Date.now() + 5_000);
    expect(result.ready).toBe(false);
    expect(result.signalPointCount).toBe(0);
    expect(result.assessment.blockers).toContain('no_signal_point_observations_after_first_cycle');
  });
});

describe('reference-capture-fast-go.workflow compensation matrix', () => {
  it('START timeout after no server mutation => NO GO path cleanup confirms READY/no runner', async () => {
    const getSession = jest
      .fn()
      .mockResolvedValueOnce({ status: 200, data: sessionView(ReferenceCaptureSessionStatus.READY) });
    const abortSession = jest.fn();
    const client = makeClient({ getSession, abortSession });

    const status = await reconcileAmbiguousStartViaHttp(client, 'org', 'veh', 'sess');
    expect(status).toBe('COMPENSATION_CONFIRMED');
    expect(abortSession).not.toHaveBeenCalled();
  });

  it('START timeout after server mutation to STARTING => abort + cleanup confirmed', async () => {
    const getSession = jest
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        data: sessionView(ReferenceCaptureSessionStatus.STARTING, { runnerJobId: 'r', pendingCycleJobId: 'p' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: sessionView(ReferenceCaptureSessionStatus.ABORTED),
      });
    const abortSession = jest.fn().mockResolvedValue({ status: 200, data: {} });
    const client = makeClient({ getSession, abortSession });

    const status = await reconcileAmbiguousStartViaHttp(client, 'org', 'veh', 'sess');
    expect(status).toBe('COMPENSATION_CONFIRMED');
    expect(abortSession).toHaveBeenCalled();
  });

  it('START timeout after server mutation to RECORDING => abort + cleanup confirmed', async () => {
    const getSession = jest
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        data: sessionView(ReferenceCaptureSessionStatus.RECORDING, {
          runnerJobId: 'r',
          pendingCycleJobId: 'p',
          cycleCount: 0,
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: sessionView(ReferenceCaptureSessionStatus.ABORTED),
      });
    const abortSession = jest.fn().mockResolvedValue({ status: 200, data: {} });
    const client = makeClient({ getSession, abortSession });

    const status = await reconcileAmbiguousStartViaHttp(client, 'org', 'veh', 'sess');
    expect(status).toBe('COMPENSATION_CONFIRMED');
    expect(abortSession).toHaveBeenCalled();
  });

  it('START timeout + cleanup HTTP timeout => UNCONFIRMED', async () => {
    const getSession = jest.fn().mockResolvedValue({
      status: 200,
      data: sessionView(ReferenceCaptureSessionStatus.RECORDING, { runnerJobId: 'r', pendingCycleJobId: 'p' }),
    });
    const abortSession = jest.fn().mockResolvedValue({ status: 0, timedOut: true });
    const client = makeClient({ getSession, abortSession });

    const status = await reconcileAmbiguousStartViaHttp(client, 'org', 'veh', 'sess');
    expect(status).toBe('COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED');
  });

  it('first cycle timeout cleanup leaves zombie if verify shows RECORDING', async () => {
    const getSession = jest
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        data: sessionView(ReferenceCaptureSessionStatus.RECORDING, { runnerJobId: 'r', pendingCycleJobId: 'p' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: sessionView(ReferenceCaptureSessionStatus.RECORDING, { runnerJobId: 'r', pendingCycleJobId: 'p' }),
      });
    const abortSession = jest.fn().mockResolvedValue({ status: 200, data: {} });
    const client = makeClient({ getSession, abortSession });

    const status = await runBoundedSessionCleanup(client, 'org', 'veh', 'sess', 'fast_go_deadline_exceeded');
    expect(status).toBe('COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED');
  });
});
