import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RentalRulesService } from './rental-rules.service';
import {
  AssignCategoryVehiclesDto,
  CreateRentalVehicleCategoryDto,
  UpdateRentalVehicleCategoryDto,
  UpsertOrganizationRentalRulesDto,
  UpsertVehicleRentalOverridesDto,
} from './dto';

@Controller()
@UseGuards(OrgScopingGuard, RolesGuard)
export class RentalRulesController {
  constructor(private readonly rentalRules: RentalRulesService) {}

  @Get('organizations/:orgId/rental-rules/overview')
  getOverview(@Param('orgId') orgId: string) {
    return this.rentalRules.getOverview(orgId);
  }

  @Get('organizations/:orgId/rental-rules/fleet-vehicles')
  listFleetVehicles(@Param('orgId') orgId: string) {
    return this.rentalRules.listFleetVehicles(orgId);
  }

  @Get('organizations/:orgId/rental-rules/defaults')
  getDefaults(@Param('orgId') orgId: string) {
    return this.rentalRules.getOrganizationDefaults(orgId);
  }

  @Patch('organizations/:orgId/rental-rules/defaults')
  patchDefaults(@Param('orgId') orgId: string, @Body() body: UpsertOrganizationRentalRulesDto) {
    return this.rentalRules.upsertOrganizationDefaults(orgId, body);
  }

  @Get('organizations/:orgId/rental-rules/categories')
  listCategories(
    @Param('orgId') orgId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.rentalRules.listCategories(orgId, includeInactive === 'true');
  }

  @Post('organizations/:orgId/rental-rules/categories')
  createCategory(@Param('orgId') orgId: string, @Body() body: CreateRentalVehicleCategoryDto) {
    return this.rentalRules.createCategory(orgId, body);
  }

  @Get('organizations/:orgId/rental-rules/categories/:categoryId')
  getCategory(@Param('orgId') orgId: string, @Param('categoryId') categoryId: string) {
    return this.rentalRules.getCategory(orgId, categoryId);
  }

  @Patch('organizations/:orgId/rental-rules/categories/:categoryId')
  updateCategory(
    @Param('orgId') orgId: string,
    @Param('categoryId') categoryId: string,
    @Body() body: UpdateRentalVehicleCategoryDto,
  ) {
    return this.rentalRules.updateCategory(orgId, categoryId, body);
  }

  @Delete('organizations/:orgId/rental-rules/categories/:categoryId')
  disableCategory(@Param('orgId') orgId: string, @Param('categoryId') categoryId: string) {
    return this.rentalRules.disableCategory(orgId, categoryId);
  }

  @Get('organizations/:orgId/rental-rules/categories/:categoryId/vehicles')
  listCategoryVehicles(
    @Param('orgId') orgId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.rentalRules.listCategoryVehicles(orgId, categoryId);
  }

  @Patch('organizations/:orgId/rental-rules/categories/:categoryId/vehicles')
  assignCategoryVehicles(
    @Param('orgId') orgId: string,
    @Param('categoryId') categoryId: string,
    @Body() body: AssignCategoryVehiclesDto,
  ) {
    return this.rentalRules.assignCategoryVehicles(orgId, categoryId, body);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/rental-requirements')
  getVehicleRequirements(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.rentalRules.getVehicleRequirements(orgId, vehicleId);
  }

  @Patch('organizations/:orgId/vehicles/:vehicleId/rental-requirements/overrides')
  upsertVehicleOverrides(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: UpsertVehicleRentalOverridesDto,
  ) {
    return this.rentalRules.upsertVehicleOverrides(orgId, vehicleId, body);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/rental-requirements/effective')
  getVehicleEffectiveRules(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.rentalRules.getVehicleEffectiveRules(orgId, vehicleId);
  }
}
