import { Injectable } from '@nestjs/common';
import {
  getEvaluationsMetricRegistrySnapshot,
  listEvaluationsMetricDefinitions,
  requireEvaluationsMetricDefinition,
  resolveEvaluationsMetricId,
} from './evaluations-metric.registry';

@Injectable()
export class EvaluationsMetricService {
  getRegistry() {
    return getEvaluationsMetricRegistrySnapshot();
  }

  listMetrics() {
    return listEvaluationsMetricDefinitions();
  }

  getMetric(id: string) {
    const canonicalId = resolveEvaluationsMetricId(id);
    return requireEvaluationsMetricDefinition(canonicalId);
  }
}
