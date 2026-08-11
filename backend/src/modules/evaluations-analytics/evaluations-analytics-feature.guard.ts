import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { isEvaluationsAnalyticsV2Enabled } from './evaluations-analytics-feature-flags';

/**
 * Fail-closed feature gate. When `EVALUATIONS_ANALYTICS_V2_MODE=off` (default),
 * the foundation routes report 404 so a disabled feature leaks no existence.
 */
@Injectable()
export class EvaluationsAnalyticsFeatureGuard implements CanActivate {
  canActivate(): boolean {
    if (!isEvaluationsAnalyticsV2Enabled()) {
      throw new NotFoundException('Not found');
    }
    return true;
  }
}
