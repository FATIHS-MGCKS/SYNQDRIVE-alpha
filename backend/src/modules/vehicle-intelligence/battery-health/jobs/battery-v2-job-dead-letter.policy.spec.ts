import { isLegacyAssessPersistence54000DeadLetter } from './battery-v2-job-dead-letter.policy';

describe('isLegacyAssessPersistence54000DeadLetter', () => {
  it('matches repaired legacy assess persistence HANDLER_FAILED with SQLSTATE 54000', () => {
    expect(
      isLegacyAssessPersistence54000DeadLetter({
        jobType: 'BATTERY_ASSESSMENT_RECOMPUTE',
        errorCode: 'HANDLER_FAILED',
        errorMessage:
          'Invalid `prisma.batteryAssessment.create()` invocation: PostgresError { code: "54000", message: "index row size" }',
      }),
    ).toBe(true);
  });

  it('matches program_limit_exceeded wording', () => {
    expect(
      isLegacyAssessPersistence54000DeadLetter({
        jobType: 'BATTERY_ASSESSMENT_RECOMPUTE',
        errorCode: 'HANDLER_FAILED',
        errorMessage: 'program_limit_exceeded on btree index',
      }),
    ).toBe(true);
  });

  it('rejects unrelated HANDLER_FAILED persistence failures', () => {
    expect(
      isLegacyAssessPersistence54000DeadLetter({
        jobType: 'BATTERY_ASSESSMENT_RECOMPUTE',
        errorCode: 'HANDLER_FAILED',
        errorMessage: 'foreign key violation on battery_assessments',
      }),
    ).toBe(false);
  });

  it('rejects non-assess job types even with 54000 message', () => {
    expect(
      isLegacyAssessPersistence54000DeadLetter({
        jobType: 'BATTERY_PUBLICATION_UPDATE',
        errorCode: 'HANDLER_FAILED',
        errorMessage: '54000 index row size',
      }),
    ).toBe(false);
  });
});
