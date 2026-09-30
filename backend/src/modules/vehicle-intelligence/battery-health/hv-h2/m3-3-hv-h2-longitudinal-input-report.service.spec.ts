import {
  M3_3HvH2InvalidReportBoundError,
  m3_3HvH2GroundTruthEventsWhereClause,
  resolveM3_3HvH2ReportBound,
} from './m3-3-hv-h2-longitudinal-input-report.service';
import { M3_3_HV_H2_MAX_GT_ROWS_HARD } from './m3-3-hv-h2.constants';

describe('M3.3-HV-H2 report bounds', () => {
  it('rejects zero and negative limits', () => {
    expect(() => resolveM3_3HvH2ReportBound(0, 100, 500, 'maxGtRows')).toThrow(
      M3_3HvH2InvalidReportBoundError,
    );
    expect(() => resolveM3_3HvH2ReportBound(-1, 100, 500, 'maxGtRows')).toThrow(
      M3_3HvH2InvalidReportBoundError,
    );
  });

  it('clamps above hard max to hard max', () => {
    expect(
      resolveM3_3HvH2ReportBound(M3_3_HV_H2_MAX_GT_ROWS_HARD + 1, 100, M3_3_HV_H2_MAX_GT_ROWS_HARD, 'maxGtRows'),
    ).toBe(M3_3_HV_H2_MAX_GT_ROWS_HARD);
  });
});

describe('M3.3-HV-H2 GT knowledge-time query authority', () => {
  it('requires createdAt <= evaluationAt before DB take/limit', () => {
    const evaluationAt = new Date('2026-06-15T12:00:00.000Z');
    const where = m3_3HvH2GroundTruthEventsWhereClause('org', 'veh', evaluationAt);
    expect(where.effectiveAt.lte).toEqual(evaluationAt);
    expect(where.createdAt.lte).toEqual(evaluationAt);
  });
});
