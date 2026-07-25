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
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { OperatorDamageService } from './operator-damage.service';
import type { OperatorDamageCaptureRequestDto } from './operator-damage.types';

@Controller('organizations/:orgId/operator')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class OperatorDamageController {
  constructor(private readonly operatorDamage: OperatorDamageService) {}

  @Get('vehicles/:vehicleId/damages/active')
  @RequirePermission('vehicles', 'read')
  listActive(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Query('bookingId') bookingId?: string,
  ) {
    return this.operatorDamage.listActiveForVehicle(orgId, vehicleId, bookingId);
  }

  @Post('vehicles/:vehicleId/damages/capture')
  @RequirePermission('vehicles', 'write')
  capture(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: OperatorDamageCaptureRequestDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.operatorDamage.capture(orgId, vehicleId, body, { userId: user.id });
  }

  @Get('vehicles/:vehicleId/damages/:damageId/editable')
  @RequirePermission('vehicles', 'read')
  assertEditable(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('damageId') damageId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.operatorDamage.assertEditable(orgId, vehicleId, damageId, { userId: user.id });
  }
}
