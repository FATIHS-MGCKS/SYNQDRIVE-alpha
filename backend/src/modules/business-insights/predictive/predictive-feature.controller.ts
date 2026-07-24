import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { EvaluationsPermissionGuard } from '../access/evaluations-permission.guard';
import { RequireEvaluationsPermission } from '../access/require-evaluations-permission.decorator';
import { EvaluationsAuditService } from '../access/evaluations-audit.service';
import { evaluationsAuditActorFromRequest } from '../access/evaluations-audit-request.util';
import { BuildPredictiveFeaturesDto } from './dto/build-predictive-features.dto';
import { ListPredictiveFeatureSnapshotsDto } from './dto/list-predictive-feature-snapshots.dto';
import { PredictiveFeatureService } from './predictive-feature.service';

@Controller('organizations/:orgId/business-insights/evaluations/predictive/features')
@UseGuards(OrgScopingGuard, RolesGuard, EvaluationsPermissionGuard)
export class PredictiveFeatureController {
  constructor(
    private readonly service: PredictiveFeatureService,
    private readonly evaluationsAudit: EvaluationsAuditService,
  ) {}

  @Get()
  @RequireEvaluationsPermission('evaluations.data_quality.read')
  listSnapshots(
    @Param('orgId') organizationId: string,
    @Query() query: ListPredictiveFeatureSnapshotsDto,
  ) {
    return this.service.listSnapshots(organizationId, {
      observationDateFrom: query.observationDateFrom,
      observationDateTo: query.observationDateTo,
      grain: query.grain,
      limit: query.limit,
    });
  }

  @Get('build-runs/latest')
  @RequireEvaluationsPermission('evaluations.data_quality.read')
  getLatestBuildRun(@Param('orgId') organizationId: string) {
    return this.service.getLatestBuildRun(organizationId);
  }

  @Post('build')
  @RequireEvaluationsPermission('evaluations.admin.manage')
  async buildFeatures(
    @Param('orgId') organizationId: string,
    @Body() body: BuildPredictiveFeaturesDto,
    @CurrentUser('id') userId?: string,
    @Req() req?: Parameters<typeof evaluationsAuditActorFromRequest>[0],
  ) {
    const actor = evaluationsAuditActorFromRequest({ ...req, user: { id: userId } });
    const runId = randomUUID();
    const trigger = body.trigger ?? 'api';

    try {
      const result = await this.service.buildFeatures({
        organizationId,
        observationDates: body.observationDates,
        lookbackDays: body.lookbackDays,
        timezone: body.timezone,
        trigger,
      });

      void this.evaluationsAudit.recordManualRecalculation(organizationId, actor, {
        entityId: runId,
        jobType: 'feature_store_build',
        trigger,
        metadata: {
          observationDateCount: body.observationDates?.length ?? null,
          lookbackDays: body.lookbackDays ?? null,
        },
      });

      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Feature build failed';
      void this.evaluationsAudit.recordManualRecalculation(organizationId, actor, {
        entityId: runId,
        jobType: 'feature_store_build',
        trigger,
        outcome: 'FAILED',
        reason,
      });
      throw error;
    }
  }
}
