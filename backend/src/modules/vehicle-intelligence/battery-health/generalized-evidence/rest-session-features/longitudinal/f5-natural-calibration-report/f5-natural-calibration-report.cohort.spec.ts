import {
  classifyRevisionCohort,
  isPrimaryCohortRevision,
} from './f5-natural-calibration-report.service';
import { F4_6_T0_ISO, F_D3_T0_ISO, F45R1_COHORT_START_ISO } from './f5-natural-calibration-report.constants';

describe('f5 cohort authority', () => {
  it('excludes canary A/B from primary f46_sustained cohort', () => {
    const f45r = new Date('2026-09-28T09:33:42.623Z');
    const f45r1 = new Date('2026-09-28T15:00:09.594Z');
    const f46 = new Date(F4_6_T0_ISO);
    expect(classifyRevisionCohort(f45r)).toBe('F45R');
    expect(classifyRevisionCohort(f45r1)).toBe('F45R1');
    expect(classifyRevisionCohort(f46)).toBe('F46_SUSTAINED');
    expect(isPrimaryCohortRevision(classifyRevisionCohort(f45r), f45r, new Date())).toBe(false);
    expect(isPrimaryCohortRevision(classifyRevisionCohort(f45r1), f45r1, new Date())).toBe(false);
    expect(isPrimaryCohortRevision(classifyRevisionCohort(f46), f46, new Date())).toBe(true);
  });

  it('respects as-of cutoff', () => {
    const rev = new Date(F4_6_T0_ISO);
    const asOfBefore = new Date(Date.parse(F4_6_T0_ISO) - 1);
    expect(
      isPrimaryCohortRevision('F46_SUSTAINED', rev, asOfBefore),
    ).toBe(false);
  });

  it('classifies boundaries', () => {
    expect(classifyRevisionCohort(new Date(F_D3_T0_ISO))).toBe('F45R');
    expect(classifyRevisionCohort(new Date(F45R1_COHORT_START_ISO))).toBe('F45R1');
  });
});
