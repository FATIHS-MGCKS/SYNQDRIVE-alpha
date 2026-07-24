import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { EVALUATIONS_PERIOD_PRESETS, type EvaluationsPeriodPreset } from '@synq/evaluations-periods/evaluations-period.contract';
import { EvaluationsPeriodService } from './evaluations-period.service';

@Controller('organizations/:orgId/evaluations/periods')
@UseGuards(OrgScopingGuard, RolesGuard)
export class EvaluationsPeriodController {
  constructor(private readonly periodService: EvaluationsPeriodService) {}

  /**
   * Resolve a single canonical reporting period in org or station timezone.
   * Query: preset (required), optional stationId, optional reference (ISO-8601).
   */
  @Get('resolve')
  async resolvePeriod(
    @Param('orgId') orgId: string,
    @Query('preset') preset: string,
    @Query('stationId') stationId?: string,
    @Query('reference') reference?: string,
  ) {
    if (!EVALUATIONS_PERIOD_PRESETS.includes(preset as EvaluationsPeriodPreset)) {
      throw new BadRequestException({
        message: 'Invalid evaluations period preset',
        code: 'INVALID_EVALUATIONS_PERIOD_PRESET',
        allowed: EVALUATIONS_PERIOD_PRESETS,
      });
    }

    const ref = reference ? new Date(reference) : new Date();
    return this.periodService.resolvePeriod({
      organizationId: orgId,
      preset: preset as EvaluationsPeriodPreset,
      reference: Number.isNaN(ref.getTime()) ? new Date() : ref,
      stationId: stationId?.trim() || undefined,
    });
  }

  /**
   * Standard Auswertungen financial reporting bundle: MTD + prev-month-same-period + YoY.
   */
  @Get('reporting-bundle')
  async reportingBundle(
    @Param('orgId') orgId: string,
    @Query('stationId') stationId?: string,
    @Query('reference') reference?: string,
  ) {
    const ref = reference ? new Date(reference) : new Date();
    return this.periodService.resolveReportingBundle({
      organizationId: orgId,
      reference: Number.isNaN(ref.getTime()) ? new Date() : ref,
      stationId: stationId?.trim() || undefined,
    });
  }
}
