import { Injectable } from '@nestjs/common';
import {
  attachLineageToCostModel,
  attachLineageToUtilizationModel,
  buildEvaluationsLineageSummary,
  lineageForSection,
  lineageSectionStatus,
} from '@synq/evaluations-insights/evaluations-lineage';
import type {
  EvaluationsLineageBuildInput,
  EvaluationsLineageSummary,
} from '@synq/evaluations-insights/evaluations-lineage.contract';
import type { EvaluationsCostModelSummary } from '@synq/evaluations-insights/evaluations-cost-model.contract';
import type { EvaluationsUtilizationModelSummary } from '@synq/evaluations-insights/evaluations-utilization-model.contract';
import type { EvaluationsMetricStatus } from '@synq/evaluations-insights/evaluations-analytics-primitives.contract';

@Injectable()
export class EvaluationsLineageService {
  build(input: EvaluationsLineageBuildInput): EvaluationsLineageSummary {
    return buildEvaluationsLineageSummary(input);
  }

  sectionStatus(
    summary: EvaluationsLineageSummary,
    sectionStatuses: Array<{ key: string; status: EvaluationsMetricStatus }>,
  ): EvaluationsMetricStatus {
    return lineageSectionStatus(summary, sectionStatuses);
  }

  sectionLineage(summary: EvaluationsLineageSummary, sectionKey: string) {
    return lineageForSection(summary, sectionKey);
  }

  enrichCostModel(summary: EvaluationsCostModelSummary, lineage: EvaluationsLineageSummary) {
    return attachLineageToCostModel(summary, lineage);
  }

  enrichUtilizationModel(
    summary: EvaluationsUtilizationModelSummary,
    lineage: EvaluationsLineageSummary,
  ) {
    return attachLineageToUtilizationModel(summary, lineage);
  }
}
