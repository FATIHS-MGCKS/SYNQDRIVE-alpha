import {
  LV_REST_ASSESSMENT_HANDOFF_OUTCOME,
  LV_REST_ASSESSMENT_HANDOFF_STATUS,
  mergeAssessmentHandoffState,
} from './lv-rest-assessment-handoff.metadata';

const MEAS = 'clmeas123456789012345678901';
const KEY = `assess:clveh1234567890123456789012:LV_HEALTH:${MEAS}`;

describe('lv-rest-assessment-handoff.metadata', () => {
  it('allows MISSING → ENQUEUED → EXECUTED progression', () => {
    const missing = mergeAssessmentHandoffState(null, {
      measurementId: MEAS,
      idempotencyKey: KEY,
      status: LV_REST_ASSESSMENT_HANDOFF_STATUS.MISSING,
    });
    const enqueued = mergeAssessmentHandoffState(missing, {
      measurementId: MEAS,
      idempotencyKey: KEY,
      status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
      enqueuedAt: '2026-09-02T10:00:00.000Z',
    });
    const executed = mergeAssessmentHandoffState(enqueued, {
      measurementId: MEAS,
      idempotencyKey: KEY,
      status: LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED,
      outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.ASSESSMENT_PERSISTED,
      executedAt: '2026-09-02T10:01:00.000Z',
    });

    expect(executed.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED);
    expect(executed.outcome).toBe(LV_REST_ASSESSMENT_HANDOFF_OUTCOME.ASSESSMENT_PERSISTED);
  });

  it('never regresses EXECUTED to ENQUEUED or MISSING', () => {
    const executed = mergeAssessmentHandoffState(null, {
      measurementId: MEAS,
      idempotencyKey: KEY,
      status: LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED,
      executedAt: '2026-09-02T10:01:00.000Z',
    });

    const regressedEnqueue = mergeAssessmentHandoffState(executed, {
      measurementId: MEAS,
      idempotencyKey: KEY,
      status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
      enqueuedAt: '2026-09-02T10:02:00.000Z',
    });
    const regressedMissing = mergeAssessmentHandoffState(executed, {
      measurementId: MEAS,
      idempotencyKey: KEY,
      status: LV_REST_ASSESSMENT_HANDOFF_STATUS.MISSING,
    });

    expect(regressedEnqueue.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED);
    expect(regressedMissing.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED);
  });

  it('allows ENQUEUED → EXECUTED but not EXECUTED → ENQUEUED', () => {
    const enqueued = mergeAssessmentHandoffState(null, {
      measurementId: MEAS,
      idempotencyKey: KEY,
      status: LV_REST_ASSESSMENT_HANDOFF_STATUS.ENQUEUED,
      enqueuedAt: '2026-09-02T10:00:00.000Z',
    });
    const executed = mergeAssessmentHandoffState(enqueued, {
      measurementId: MEAS,
      idempotencyKey: KEY,
      status: LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED,
      outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.POLICY_SKIPPED,
      executedAt: '2026-09-02T10:01:00.000Z',
    });

    expect(executed.status).toBe(LV_REST_ASSESSMENT_HANDOFF_STATUS.EXECUTED);
    expect(executed.outcome).toBe(LV_REST_ASSESSMENT_HANDOFF_OUTCOME.POLICY_SKIPPED);
  });
});
