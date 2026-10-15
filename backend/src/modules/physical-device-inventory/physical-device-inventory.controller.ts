import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { ManualIntakePhysicalDeviceDto } from './dto/manual-intake-physical-device.dto';
import { ListPhysicalDevicesQueryDto } from './dto/list-physical-devices-query.dto';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';

@Controller('admin/physical-device-inventory')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS)
@Roles('MASTER_ADMIN')
export class PhysicalDeviceInventoryController {
  constructor(
    private readonly inventory: PhysicalDeviceInventoryService,
    private readonly audit: AuditService,
  ) {}

  @Get('summary')
  async getSummary() {
    return this.inventory.getStockSummary();
  }

  @Get('devices')
  async listDevices(@Query() query: ListPhysicalDevicesQueryDto) {
    return this.inventory.listDevices(query);
  }

  @Post('devices/manual-intake')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)
  async manualIntake(@Body() body: ManualIntakePhysicalDeviceDto, @Req() req: any) {
    const actorUserId = req?.user?.id ?? req?.user?.userId ?? null;
    const result = await this.inventory.manualIntake(body, actorUserId);
    void this.audit.record({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.CREATE,
      entity: ActivityEntity.ADMIN_OPERATION,
      description: `Physical device manual intake ${result.internalInventoryNumber}`,
      changeSummary: `model=${result.modelCode};status=${result.status}`,
    });
    return result;
  }
}
