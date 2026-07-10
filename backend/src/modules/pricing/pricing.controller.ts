import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingService } from './pricing.service';
import {
  CreateTariffGroupDto,
  CreateVehicleAssignmentDto,
  PublishTariffDraftDto,
  SimulateBookingPriceDto,
  UpdateTariffGroupDto,
  UpsertTariffVersionDto,
} from './dto';

@Controller('organizations/:orgId')
@UseGuards(OrgScopingGuard, RolesGuard)
export class PricingController {
  constructor(
    private readonly priceTariffs: PriceTariffsService,
    private readonly pricing: PricingService,
  ) {}

  @Get('price-tariffs')
  getCatalog(@Param('orgId') orgId: string) {
    return this.priceTariffs.getFullCatalog(orgId);
  }

  @Post('price-tariffs/groups')
  createGroup(@Param('orgId') orgId: string, @Body() body: CreateTariffGroupDto) {
    return this.priceTariffs.createGroup(orgId, body);
  }

  @Patch('price-tariffs/groups/:groupId')
  updateGroup(
    @Param('orgId') orgId: string,
    @Param('groupId') groupId: string,
    @Body() body: UpdateTariffGroupDto,
  ) {
    return this.priceTariffs.updateGroup(orgId, groupId, body);
  }

  @Post('price-tariffs/groups/:groupId/version')
  upsertGroupVersion(
    @Param('orgId') orgId: string,
    @Param('groupId') groupId: string,
    @Body() body: UpsertTariffVersionDto,
  ) {
    return this.priceTariffs.upsertGroupVersion(orgId, groupId, body);
  }

  @Patch('price-tariffs/versions/:versionId')
  updateVersion(
    @Param('orgId') orgId: string,
    @Param('versionId') versionId: string,
    @Body() body: UpsertTariffVersionDto,
  ) {
    return this.priceTariffs.updateVersion(orgId, versionId, body);
  }

  @Post('price-tariffs/groups/:groupId/publish')
  publishTariffDraft(
    @Param('orgId') orgId: string,
    @Param('groupId') groupId: string,
    @Body() body: PublishTariffDraftDto,
  ) {
    return this.priceTariffs.publishTariffDraft(orgId, groupId, body);
  }

  /** @deprecated Prefer POST .../groups/:groupId/publish — only publishes DRAFT versions. */
  @Post('price-tariffs/versions/:versionId/activate')
  activateVersion(
    @Param('orgId') orgId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.priceTariffs.activateVersion(orgId, versionId);
  }

  @Post('price-tariffs/assignments')
  assignVehicle(@Param('orgId') orgId: string, @Body() body: CreateVehicleAssignmentDto) {
    return this.priceTariffs.assignVehicle(orgId, body);
  }

  @Patch('price-tariffs/assignments/:assignmentId/deactivate')
  deactivateAssignment(
    @Param('orgId') orgId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.priceTariffs.deactivateAssignment(orgId, assignmentId);
  }

  @Get('price-tariffs/unassigned-vehicles')
  unassignedVehicles(@Param('orgId') orgId: string) {
    return this.priceTariffs.listUnassignedVehicles(orgId);
  }

  @Post('pricing/simulate')
  simulate(@Param('orgId') orgId: string, @Body() body: SimulateBookingPriceDto) {
    return this.pricing.simulateBookingPrice(orgId, body);
  }
}
