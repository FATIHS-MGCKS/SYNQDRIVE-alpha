import { NotFoundException } from '@nestjs/common';
import { EvaluationsAnalyticsFeatureGuard } from './evaluations-analytics-feature.guard';
import { EVALUATIONS_ANALYTICS_V2_MODE_ENV } from './evaluations-analytics-feature-flags';

describe('EvaluationsAnalyticsFeatureGuard', () => {
  const original = process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV];
    else process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV] = original;
  });

  it('fails closed (404) when the feature mode is off or unset', () => {
    delete process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV];
    const guard = new EvaluationsAnalyticsFeatureGuard();
    expect(() => guard.canActivate()).toThrow(NotFoundException);

    process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV] = 'off';
    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });

  it('allows activation when enabled', () => {
    const guard = new EvaluationsAnalyticsFeatureGuard();
    process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV] = 'on';
    expect(guard.canActivate()).toBe(true);
    process.env[EVALUATIONS_ANALYTICS_V2_MODE_ENV] = 'shadow';
    expect(guard.canActivate()).toBe(true);
  });
});
