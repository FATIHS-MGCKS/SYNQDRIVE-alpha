import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { VerifyPhysicalDeviceIdentityDto } from './dto/verify-physical-device-identity.dto';
import { InstallPhysicalDeviceDto } from './dto/install-physical-device.dto';
import { UninstallPhysicalDeviceDto } from './dto/uninstall-physical-device.dto';
import { ReturnPhysicalDeviceToStockDto } from './dto/return-physical-device-to-stock.dto';
import { MarkPhysicalDeviceDefectiveDto } from './dto/mark-physical-device-defective.dto';
import { MarkPhysicalDeviceLostDto } from './dto/mark-physical-device-lost.dto';
import { RetirePhysicalDeviceDto } from './dto/retire-physical-device.dto';
import { assertPhysicalDeviceLifecycleActivityRecorded } from './physical-device-inventory-lifecycle-activity';
import { PdiIdentityMonitoringService } from './pdi-identity-monitoring.service';

@Controller('admin/physical-device-inventory')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS)
@Roles('MASTER_ADMIN')
export class PhysicalDeviceInventoryController {
  constructor(
    private readonly inventory: PhysicalDeviceInventoryService,
    private readonly identityMonitoring: PdiIdentityMonitoringService,
    private readonly audit: AuditService,
  ) {}

  @Get('summary')
  async getSummary() {
    return this.inventory.getStockSummary();
  }

  /** Read-only live identity alignment (PDI INSTALL vs DIMO mirror). No drift history in V1. */
  @Get('identity-monitoring/live-snapshot')
  async getIdentityMonitoringLiveSnapshot() {
    return this.identityMonitoring.getLiveSnapshot();
  }

  @Get('devices')
  async listDevices(@Query() query: ListPhysicalDevicesQueryDto) {
    return this.inventory.listDevices(query);
  }

  @Get('devices/:deviceId')
  async getDevice(@Param('deviceId') deviceId: string) {
    return this.inventory.getDeviceDetail(deviceId);
  }

  @Post('devices/:deviceId/verify-identity')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)
  async verifyIdentity(
    @Param('deviceId') deviceId: string,
    @Body() body: VerifyPhysicalDeviceIdentityDto,
    @Req() req: any,
  ) {
    const actorUserId = req?.user?.id ?? req?.user?.userId ?? null;
    const result = await this.inventory.verifyIdentity(deviceId, body, actorUserId);
    void this.audit.record({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.ADMIN_OPERATION,
      description: `Physical device identity verified ${result.internalInventoryNumber}`,
      changeSummary: `deviceId=${deviceId}`,
    });
    return result;
  }

  @Post('devices/:deviceId/install')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)
  async installOnVehicle(
    @Param('deviceId') deviceId: string,
    @Body() body: InstallPhysicalDeviceDto,
    @Req() req: any,
  ) {
    const actorUserId = req?.user?.id ?? req?.user?.userId ?? null;
    const result = await this.inventory.installOnVehicle(deviceId, body, actorUserId);
    void this.audit.record({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.ADMIN_OPERATION,
      description: `Physical device installed ${result.internalInventoryNumber}`,
      changeSummary: `vehicleId=${body.vehicleId}`,
    });
    return result;
  }

  @Post('devices/:deviceId/uninstall')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)
  async uninstallFromVehicle(
    @Param('deviceId') deviceId: string,
    @Body() body: UninstallPhysicalDeviceDto,
    @Req() req: any,
  ) {
    const actorUserId = req?.user?.id ?? req?.user?.userId ?? null;
    const result = await this.inventory.uninstallFromVehicle(deviceId, body, actorUserId);
    await assertPhysicalDeviceLifecycleActivityRecorded(this.audit, {
      lifecycleAction: 'UNINSTALL',
      actorUserId,
      result,
      changeSummary: `vehicleId=${body.vehicleId}`,
      requestContext: AuditService.contextFromRequest(req),
      route: 'POST admin/physical-device-inventory/devices/:deviceId/uninstall',
      metaJson: { assignmentId: body.assignmentId, idempotencyKey: body.idempotencyKey ?? null },
    });
    return result;
  }

  @Post('devices/:deviceId/return-to-stock')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)
  async returnToStock(
    @Param('deviceId') deviceId: string,
    @Body() body: ReturnPhysicalDeviceToStockDto,
    @Req() req: any,
  ) {
    const actorUserId = req?.user?.id ?? req?.user?.userId ?? null;
    const result = await this.inventory.returnToStock(deviceId, body, actorUserId);
    await assertPhysicalDeviceLifecycleActivityRecorded(this.audit, {
      lifecycleAction: 'RETURN_TO_STOCK',
      actorUserId,
      result,
      changeSummary: `warehouse=${body.warehouseLocation}`,
      requestContext: AuditService.contextFromRequest(req),
      route: 'POST admin/physical-device-inventory/devices/:deviceId/return-to-stock',
      metaJson: { idempotencyKey: body.idempotencyKey ?? null },
    });
    return result;
  }

  @Post('devices/:deviceId/mark-defective')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)
  async markDefective(
    @Param('deviceId') deviceId: string,
    @Body() body: MarkPhysicalDeviceDefectiveDto,
    @Req() req: any,
  ) {
    const actorUserId = req?.user?.id ?? req?.user?.userId ?? null;
    const result = await this.inventory.markDefective(deviceId, body, actorUserId);
    void this.audit.record({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.ADMIN_OPERATION,
      description: `Physical device marked defective ${result.internalInventoryNumber}`,
      changeSummary: `deviceId=${deviceId}`,
    });
    return result;
  }

  @Post('devices/:deviceId/mark-lost')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)
  async markLost(
    @Param('deviceId') deviceId: string,
    @Body() body: MarkPhysicalDeviceLostDto,
    @Req() req: any,
  ) {
    const actorUserId = req?.user?.id ?? req?.user?.userId ?? null;
    const result = await this.inventory.markLost(deviceId, body, actorUserId);
    void this.audit.record({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.ADMIN_OPERATION,
      description: `Physical device marked lost ${result.internalInventoryNumber}`,
      changeSummary: `deviceId=${deviceId}`,
    });
    return result;
  }

  @Post('devices/:deviceId/retire')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)
  async retire(
    @Param('deviceId') deviceId: string,
    @Body() body: RetirePhysicalDeviceDto,
    @Req() req: any,
  ) {
    const actorUserId = req?.user?.id ?? req?.user?.userId ?? null;
    const result = await this.inventory.retire(deviceId, body, actorUserId);
    void this.audit.record({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.ADMIN_OPERATION,
      description: `Physical device retired ${result.internalInventoryNumber}`,
      changeSummary: `deviceId=${deviceId}`,
    });
    return result;
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
