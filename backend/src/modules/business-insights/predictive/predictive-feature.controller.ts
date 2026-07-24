import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { BuildPredictiveFeaturesDto } from './dto/build-predictive-features.dto';
import { ListPredictiveFeatureSnapshotsDto } from './dto/list-predictive-feature-snapshots.dto';
import { PredictiveFeatureService } from './predictive-feature.service';

@Controller('organizations/:orgId/business-insights/evaluations/predictive/features')
@UseGuards(OrgScopingGuard)
export class PredictiveFeatureController {
  constructor(private readonly service: PredictiveFeatureService) {}

  @Get()
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
  getLatestBuildRun(@Param('orgId') organizationId: string) {
    return this.service.getLatestBuildRun(organizationId);
  }

  @Post('build')
  buildFeatures(
    @Param('orgId') organizationId: string,
    @Body() body: BuildPredictiveFeaturesDto,
  ) {
    return this.service.buildFeatures({
      organizationId,
      observationDates: body.observationDates,
      lookbackDays: body.lookbackDays,
      timezone: body.timezone,
      trigger: body.trigger ?? 'api',
    });
  }
}
