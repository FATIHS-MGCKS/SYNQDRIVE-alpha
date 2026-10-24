import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  ConfirmVehicleMotionPhysicsReferenceDto,
  CreateVehicleMotionPhysicsReferenceDto,
  VerifyVehicleMotionPhysicsReferenceDto,
} from './dto/vehicle-motion-physics-reference.dto';
import { VehicleMotionPhysicsReferenceService } from './vehicle-motion-physics-reference.service';

@Controller('organizations/:orgId/vehicles/:vehicleId/motion-physics-reference')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class VehicleMotionPhysicsReferenceController {
  constructor(private readonly service: VehicleMotionPhysicsReferenceService) {}

  @Get()
  @RequirePermission('fleet-condition', 'read')
  getActive(@Param('orgId') orgId: string, @Param('vehicleId') vehicleId: string) {
    return this.service.getActive(orgId, vehicleId);
  }

  @Get('history')
  @RequirePermission('fleet-condition', 'read')
  listHistory(@Param('orgId') orgId: string, @Param('vehicleId') vehicleId: string) {
    return this.service.listHistory(orgId, vehicleId);
  }

  @Get('audit')
  @RequirePermission('fleet-condition', 'read')
  listAudit(@Param('orgId') orgId: string, @Param('vehicleId') vehicleId: string) {
    return this.service.listAudit(orgId, vehicleId);
  }

  @Post()
  @RequirePermission('fleet-condition', 'write')
  create(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: CreateVehicleMotionPhysicsReferenceDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.service.create(orgId, vehicleId, body, req.user?.id);
  }

  @Post(':referenceId/confirm')
  @RequirePermission('fleet-condition', 'write')
  confirm(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('referenceId') referenceId: string,
    @Body() body: ConfirmVehicleMotionPhysicsReferenceDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.service.confirm(orgId, vehicleId, referenceId, body, req.user.id);
  }

  @Post(':referenceId/verify')
  @RequirePermission('fleet-condition', 'manage')
  verify(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('referenceId') referenceId: string,
    @Body() body: VerifyVehicleMotionPhysicsReferenceDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.service.verify(orgId, vehicleId, referenceId, body, req.user.id);
  }
}
