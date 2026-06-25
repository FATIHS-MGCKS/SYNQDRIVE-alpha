import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { TechnicalObservationsService } from './technical-observations.service';
import {
  ConvertObservationToTaskDto,
  CreateTechnicalObservationDto,
  LinkObservationDamageDto,
  LinkObservationServiceDto,
  ListTechnicalObservationsQueryDto,
  UpdateTechnicalObservationDto,
} from './dto/technical-observation.dto';

@Controller('organizations/:orgId/vehicles/:vehicleId/technical-observations')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class TechnicalObservationsController {
  constructor(private readonly observations: TechnicalObservationsService) {}

  @Get()
  @RequirePermission('fleet', 'read')
  list(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Query() query: ListTechnicalObservationsQueryDto,
  ) {
    return this.observations.list(orgId, vehicleId, query);
  }

  @Post()
  @RequirePermission('fleet', 'write')
  create(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: CreateTechnicalObservationDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.observations.create(orgId, vehicleId, body, req.user?.id);
  }

  @Patch(':observationId')
  @RequirePermission('fleet', 'write')
  update(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('observationId') observationId: string,
    @Body() body: UpdateTechnicalObservationDto,
  ) {
    return this.observations.update(orgId, vehicleId, observationId, body);
  }

  @Post(':observationId/resolve')
  @RequirePermission('fleet', 'write')
  resolve(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('observationId') observationId: string,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.observations.resolve(orgId, vehicleId, observationId, req.user?.id);
  }

  @Post(':observationId/dismiss')
  @RequirePermission('fleet', 'write')
  dismiss(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('observationId') observationId: string,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.observations.dismiss(orgId, vehicleId, observationId, req.user?.id);
  }

  @Post(':observationId/convert-to-task')
  @RequirePermission('fleet', 'write')
  convertToTask(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('observationId') observationId: string,
    @Body() body: ConvertObservationToTaskDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.observations.convertToTask(
      orgId,
      vehicleId,
      observationId,
      body,
      req.user?.id,
    );
  }

  @Post(':observationId/link-damage')
  @RequirePermission('fleet', 'write')
  linkDamage(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('observationId') observationId: string,
    @Body() body: LinkObservationDamageDto,
  ) {
    return this.observations.linkDamage(orgId, vehicleId, observationId, body);
  }

  @Post(':observationId/link-service')
  @RequirePermission('fleet', 'write')
  linkService(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('observationId') observationId: string,
    @Body() body: LinkObservationServiceDto,
  ) {
    return this.observations.linkService(orgId, vehicleId, observationId, body);
  }
}
