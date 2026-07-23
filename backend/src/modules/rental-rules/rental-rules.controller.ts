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
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import type { PermissionActor } from '@shared/auth/permission.util';
import { RentalRulesService } from './rental-rules.service';
import { RequireRentalRulePermission } from './decorators/require-rental-rule-permission.decorator';
import {
  AssignCategoryVehiclesDto,
  CreateRentalVehicleCategoryDto,
  ResetVehicleRentalOverridesDto,
  UpdateRentalVehicleCategoryDto,
  UpsertOrganizationRentalRulesDto,
  UpsertVehicleRentalOverridesDto,
} from './dto';

/**
 * Administration → Rental Rules / Mietregeln.
 * Tenant isolation via OrgScopingGuard; capabilities via PermissionsGuard +
 * `@RequireRentalRulePermission`. ORG_ADMIN / MASTER_ADMIN retain access via guard bypass.
 */
@Controller()
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class RentalRulesController {
  constructor(private readonly rentalRules: RentalRulesService) {}

  @Get('organizations/:orgId/rental-rules/overview')
  @RequireRentalRulePermission('rental_rules.read')
  getOverview(@Param('orgId') orgId: string) {
    return this.rentalRules.getOverview(orgId);
  }

  @Get('organizations/:orgId/rental-rules/fleet-vehicles')
  @RequireRentalRulePermission('rental_rules.read')
  listFleetVehicles(@Param('orgId') orgId: string) {
    return this.rentalRules.listFleetVehicles(orgId);
  }

  @Get('organizations/:orgId/rental-rules/defaults')
  @RequireRentalRulePermission('rental_rules.read')
  getDefaults(@Param('orgId') orgId: string) {
    return this.rentalRules.getOrganizationDefaults(orgId);
  }

  @Patch('organizations/:orgId/rental-rules/defaults')
  @RequireRentalRulePermission('rental_rules.write')
  patchDefaults(
    @Param('orgId') orgId: string,
    @Body() body: UpsertOrganizationRentalRulesDto,
    @CurrentUser() user: PermissionActor | undefined,
  ) {
    return this.rentalRules.upsertOrganizationDefaults(orgId, body, { actor: user });
  }

  @Get('organizations/:orgId/rental-rules/categories')
  @RequireRentalRulePermission('rental_rules.read')
  listCategories(
    @Param('orgId') orgId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.rentalRules.listCategories(orgId, includeInactive === 'true');
  }

  @Post('organizations/:orgId/rental-rules/categories')
  @RequireRentalRulePermission('rental_rules.write')
  createCategory(
    @Param('orgId') orgId: string,
    @Body() body: CreateRentalVehicleCategoryDto,
    @CurrentUser() user: PermissionActor | undefined,
  ) {
    return this.rentalRules.createCategory(orgId, body, { actor: user });
  }

  @Get('organizations/:orgId/rental-rules/categories/:categoryId')
  @RequireRentalRulePermission('rental_rules.read')
  getCategory(@Param('orgId') orgId: string, @Param('categoryId') categoryId: string) {
    return this.rentalRules.getCategory(orgId, categoryId);
  }

  @Patch('organizations/:orgId/rental-rules/categories/:categoryId')
  @RequireRentalRulePermission('rental_rules.write')
  updateCategory(
    @Param('orgId') orgId: string,
    @Param('categoryId') categoryId: string,
    @Body() body: UpdateRentalVehicleCategoryDto,
    @CurrentUser() user: PermissionActor | undefined,
  ) {
    return this.rentalRules.updateCategory(orgId, categoryId, body, { actor: user });
  }

  @Delete('organizations/:orgId/rental-rules/categories/:categoryId')
  @RequireRentalRulePermission('rental_rules.publish')
  disableCategory(@Param('orgId') orgId: string, @Param('categoryId') categoryId: string) {
    return this.rentalRules.disableCategory(orgId, categoryId);
  }

  @Get('organizations/:orgId/rental-rules/categories/:categoryId/vehicles')
  @RequireRentalRulePermission('rental_rules.read')
  listCategoryVehicles(
    @Param('orgId') orgId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.rentalRules.listCategoryVehicles(orgId, categoryId);
  }

  @Patch('organizations/:orgId/rental-rules/categories/:categoryId/vehicles')
  @RequireRentalRulePermission('rental_rules.assign_vehicles')
  assignCategoryVehicles(
    @Param('orgId') orgId: string,
    @Param('categoryId') categoryId: string,
    @Body() body: AssignCategoryVehiclesDto,
  ) {
    return this.rentalRules.assignCategoryVehicles(orgId, categoryId, body);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/rental-requirements')
  @RequireRentalRulePermission('rental_rules.read')
  getVehicleRequirements(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.rentalRules.getVehicleRequirements(orgId, vehicleId);
  }

  @Patch('organizations/:orgId/vehicles/:vehicleId/rental-requirements/overrides')
  @RequireRentalRulePermission('rental_rules.manage_overrides')
  upsertVehicleOverrides(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: UpsertVehicleRentalOverridesDto,
    @CurrentUser() user: PermissionActor | undefined,
  ) {
    return this.rentalRules.upsertVehicleOverrides(orgId, vehicleId, body, { actor: user });
  }

  @Post('organizations/:orgId/vehicles/:vehicleId/rental-requirements/overrides/reset-preview')
  @RequireRentalRulePermission('rental_rules.manage_overrides')
  previewVehicleOverrideReset(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: ResetVehicleRentalOverridesDto,
  ) {
    return this.rentalRules.previewVehicleOverrideReset(orgId, vehicleId, body);
  }

  @Post('organizations/:orgId/vehicles/:vehicleId/rental-requirements/overrides/reset')
  @RequireRentalRulePermission('rental_rules.manage_overrides')
  resetVehicleOverrides(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: ResetVehicleRentalOverridesDto,
    @CurrentUser() user: PermissionActor | undefined,
  ) {
    return this.rentalRules.resetVehicleOverrides(orgId, vehicleId, body, { actor: user });
  }

  @Delete('organizations/:orgId/vehicles/:vehicleId/rental-requirements/overrides')
  @RequireRentalRulePermission('rental_rules.manage_overrides')
  deleteVehicleOverrides(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: PermissionActor | undefined,
  ) {
    return this.rentalRules.deleteVehicleOverrides(orgId, vehicleId, { actor: user });
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/rental-requirements/effective')
  @RequireRentalRulePermission('rental_rules.read')
  getVehicleEffectiveRules(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.rentalRules.getVehicleEffectiveRules(orgId, vehicleId);
  }
}
