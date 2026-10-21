import { isLegacyPersistence54000HandoffFailure } from '../lv-rest-window/lv-rest-assessment-handoff-failure.policy';
import {
  LV_REST_ASSESSMENT_HANDOFF_OUTCOME,
  LV_REST_ASSESSMENT_HANDOFF_STATUS,
} from '../lv-rest-window/lv-rest-assessment-handoff.metadata';

describe('isLegacyPersistence54000HandoffFailure', () => {
  it('matches FAILED + PERSISTENCE_FAILED + HANDLER_FAILED + 54000 evidence', () => {
    expect(
      isLegacyPersistence54000HandoffFailure({
        status: LV_REST_ASSESSMENT_HANDOFF_STATUS.FAILED,
        outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.PERSISTENCE_FAILED,
        failureHistory: {
          outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.PERSISTENCE_FAILED,
          failedAt: '2026-09-02T09:00:00.000Z',
          errorCode: 'HANDLER_FAILED',
          errorMessage: 'PostgresError { code: "54000", message: "index row size" }',
        },
      }),
    ).toBe(true);
  });

  it('rejects PERMANENT_CONFIG style failures', () => {
    expect(
      isLegacyPersistence54000HandoffFailure({
        status: LV_REST_ASSESSMENT_HANDOFF_STATUS.FAILED,
        outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.UNSUPPORTED,
        failureHistory: {
          outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.UNSUPPORTED,
          failedAt: '2026-09-02T09:00:00.000Z',
          errorCode: 'PERMANENT_CONFIG',
          errorMessage: 'unsupported profile',
        },
      }),
    ).toBe(false);
  });

  it('rejects arbitrary PERSISTENCE_FAILED without 54000 evidence', () => {
    expect(
      isLegacyPersistence54000HandoffFailure({
        status: LV_REST_ASSESSMENT_HANDOFF_STATUS.FAILED,
        outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.PERSISTENCE_FAILED,
        failureHistory: {
          outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.PERSISTENCE_FAILED,
          failedAt: '2026-09-02T09:00:00.000Z',
          errorCode: 'HANDLER_FAILED',
          errorMessage: 'foreign key violation',
        },
      }),
    ).toBe(false);
  });
});
