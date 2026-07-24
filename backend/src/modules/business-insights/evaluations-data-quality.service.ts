import { Injectable } from '@nestjs/common';
import {
  buildEvaluationsDataQualityDomain,
  dataQualitySectionStatus,
  enrichCostModelWithDataQuality,
  enrichUtilizationModelWithDataQuality,
} from '@synq/evaluations-insights/evaluations-data-quality';
import type {
  EvaluationsDataQualityBuildInput,
  EvaluationsDataQualityDomainSummary,
} from '@synq/evaluations-insights/evaluations-data-quality.contract';
import type { EvaluationsCostModelSummary } from '@synq/evaluations-insights/evaluations-cost-model.contract';
import type { EvaluationsUtilizationModelSummary } from '@synq/evaluations-insights/evaluations-utilization-model.contract';
import type { EvaluationsMetricStatus } from '@synq/evaluations-insights/evaluations-analytics-primitives.contract';

@Injectable()
export class EvaluationsDataQualityService {
  build(input: EvaluationsDataQualityBuildInput): EvaluationsDataQualityDomainSummary {
    return buildEvaluationsDataQualityDomain(input);
  }

  sectionStatus(summary: EvaluationsDataQualityDomainSummary): EvaluationsMetricStatus {
    return dataQualitySectionStatus(summary);
  }

  enrichCostModel(
    summary: EvaluationsCostModelSummary,
    domain: EvaluationsDataQualityDomainSummary,
  ): EvaluationsCostModelSummary {
    return enrichCostModelWithDataQuality(summary, domain);
  }

  enrichUtilizationModel(
    summary: EvaluationsUtilizationModelSummary,
    domain: EvaluationsDataQualityDomainSummary,
  ): EvaluationsUtilizationModelSummary {
    return enrichUtilizationModelWithDataQuality(summary, domain);
  }
}
