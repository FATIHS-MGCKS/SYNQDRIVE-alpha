import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildRecommendationImpactMeasurement,
  canMeasureRecommendationImpact,
  resolveDefaultImpactKpi,
  type RecommendationImpactMeasurementInput,
} from '@synq/evaluations-insights/evaluations-impact-measurement';
import { OrgRecommendationsRepository } from './org-recommendations.repository';
import { RecommendationImpactRepository } from './recommendation-impact.repository';
import { MeasureRecommendationImpactDto } from './dto/recommendation-impact.dto';

@Injectable()
export class RecommendationImpactService {
  constructor(
    private readonly recommendations: OrgRecommendationsRepository,
    private readonly impacts: RecommendationImpactRepository,
  ) {}

  async getLatest(organizationId: string, recommendationId: string) {
    await this.requireMeasurableRecommendation(organizationId, recommendationId);
    return this.impacts.findLatest(organizationId, recommendationId);
  }

  async listVersions(organizationId: string, recommendationId: string) {
    await this.requireMeasurableRecommendation(organizationId, recommendationId);
    return this.impacts.listVersions(organizationId, recommendationId);
  }

  async measure(
    organizationId: string,
    recommendationId: string,
    body: MeasureRecommendationImpactDto,
    actorUserId?: string | null,
  ) {
    const recommendation = await this.requireMeasurableRecommendation(
      organizationId,
      recommendationId,
    );

    const defaultKpi = resolveDefaultImpactKpi(recommendation.category);
    const expectedBenefit = body.expectedBenefit ?? recommendation.expectedBenefit;
    const expectedCost = body.expectedCost ?? recommendation.estimatedCost;

    const input: RecommendationImpactMeasurementInput = {
      baselineKpiKey: body.baselineKpiKey ?? defaultKpi.key,
      baselineKpiLabel: body.baselineKpiLabel ?? defaultKpi.label,
      baselineValue: body.baselineValue ?? null,
      targetValue: body.targetValue ?? null,
      actualKpiValue: body.actualKpiValue ?? null,
      expectedBenefit,
      expectedCost,
      actualCost: body.actualCost ?? null,
      actualBenefit: body.actualBenefit ?? null,
      baselinePeriod: body.baselinePeriod,
      measurementPeriod: body.measurementPeriod,
      dataCoveragePercent: body.dataCoveragePercent ?? null,
      implementationStatus: body.implementationStatus,
      kpiDirection: body.kpiDirection ?? defaultKpi.direction,
      seasonalOrExternalFactors: body.seasonalOrExternalFactors,
    };

    const computed = buildRecommendationImpactMeasurement(input, body.locale ?? 'de');
    const version = await this.impacts.getNextVersion(recommendationId);

    const saved = await this.impacts.createVersion(organizationId, recommendationId, {
      recommendation: { connect: { id: recommendationId } },
      organization: { connect: { id: organizationId } },
      version,
      isLatest: true,
      baselineKpiKey: computed.baselineKpiKey,
      baselineKpiLabel: computed.baselineKpiLabel,
      baselineValue: computed.baselineValue,
      targetValue: computed.targetValue,
      actualKpiValue: computed.actualKpiValue,
      expectedBenefitCents: computed.expectedBenefit?.amountMinor ?? null,
      expectedBenefitCurrency: computed.expectedBenefit?.currency ?? null,
      expectedCostCents: computed.expectedCost?.amountMinor ?? null,
      expectedCostCurrency: computed.expectedCost?.currency ?? null,
      actualCostCents: computed.actualCost?.amountMinor ?? null,
      actualCostCurrency: computed.actualCost?.currency ?? null,
      actualBenefitCents: computed.actualBenefit?.amountMinor ?? null,
      actualBenefitCurrency: computed.actualBenefit?.currency ?? null,
      varianceCents: computed.varianceFromExpected?.amountMinor ?? null,
      varianceCurrency: computed.varianceFromExpected?.currency ?? null,
      baselinePeriodStart: new Date(computed.baselinePeriod.from),
      baselinePeriodEnd: new Date(computed.baselinePeriod.to),
      measurementPeriodStart: new Date(computed.measurementPeriod.from),
      measurementPeriodEnd: new Date(computed.measurementPeriod.to),
      dataCoveragePercent: computed.dataCoveragePercent,
      outcomeStatus: computed.outcomeStatus,
      implementationStatus: computed.implementationStatus,
      trend: computed.trend,
      confidence: computed.confidence,
      calculationVersion: computed.calculationVersion,
      limitations: computed.limitations as unknown as object,
      deviationExplanation: computed.deviationExplanation,
      correlationDisclaimer: computed.correlationDisclaimer,
      periodComparable: computed.periodComparable,
      createdByUserId: actorUserId ?? null,
    });

    await this.recommendations.updateWithEvent(
      organizationId,
      recommendationId,
      {},
      {
        eventType: 'IMPACT_MEASURED',
        actorUserId,
        previousStatus: recommendation.status,
        newStatus: recommendation.status,
        metadata: {
          impactId: saved.id,
          version: saved.version,
          outcomeStatus: saved.outcomeStatus,
        },
      },
    );

    return saved;
  }

  async preview(
    organizationId: string,
    recommendationId: string,
    body: MeasureRecommendationImpactDto,
  ) {
    const recommendation = await this.requireMeasurableRecommendation(
      organizationId,
      recommendationId,
    );
    const defaultKpi = resolveDefaultImpactKpi(recommendation.category);

    return buildRecommendationImpactMeasurement(
      {
        baselineKpiKey: body.baselineKpiKey ?? defaultKpi.key,
        baselineKpiLabel: body.baselineKpiLabel ?? defaultKpi.label,
        baselineValue: body.baselineValue ?? null,
        targetValue: body.targetValue ?? null,
        actualKpiValue: body.actualKpiValue ?? null,
        expectedBenefit: body.expectedBenefit ?? recommendation.expectedBenefit,
        expectedCost: body.expectedCost ?? recommendation.estimatedCost,
        actualCost: body.actualCost ?? null,
        actualBenefit: body.actualBenefit ?? null,
        baselinePeriod: body.baselinePeriod,
        measurementPeriod: body.measurementPeriod,
        dataCoveragePercent: body.dataCoveragePercent ?? null,
        implementationStatus: body.implementationStatus,
        kpiDirection: body.kpiDirection ?? defaultKpi.direction,
        seasonalOrExternalFactors: body.seasonalOrExternalFactors,
      },
      body.locale ?? 'de',
    );
  }

  private async requireMeasurableRecommendation(organizationId: string, recommendationId: string) {
    const recommendation = await this.recommendations.findById(organizationId, recommendationId);
    if (!recommendation) {
      throw new NotFoundException({
        message: 'Recommendation not found',
        code: 'RECOMMENDATION_NOT_FOUND',
      });
    }
    if (!canMeasureRecommendationImpact(recommendation.status)) {
      throw new BadRequestException({
        message: 'Impact measurement is only available after implementation has started or ended',
        code: 'RECOMMENDATION_IMPACT_NOT_READY',
        status: recommendation.status,
      });
    }
    return recommendation;
  }
}
