import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  CreateVehicleBatteryReferenceCapacityDto,
  UpdateVehicleBatteryReferenceCapacityNotesDto,
  VerifyVehicleBatteryReferenceCapacityDto,
} from './dto/vehicle-battery-reference-capacity.dto';
import { VehicleBatteryReferenceCapacityService } from './vehicle-battery-reference-capacity.service';

@Controller('organizations/:orgId/vehicles/:vehicleId/battery-reference-capacity')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class VehicleBatteryReferenceCapacityController {
  constructor(
    private readonly referenceCapacity: VehicleBatteryReferenceCapacityService,
  ) {}

  @Get()
  @RequirePermission('fleet-condition', 'read')
  getActive(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.referenceCapacity.getActive(orgId, vehicleId);
  }

  @Get('history')
  @RequirePermission('fleet-condition', 'read')
  listHistory(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.referenceCapacity.listHistory(orgId, vehicleId);
  }

  @Get('audit')
  @RequirePermission('fleet-condition', 'read')
  listAudit(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.referenceCapacity.listAuditTrail(orgId, vehicleId);
  }

  @Post()
  @RequirePermission('fleet-condition', 'write')
  create(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: CreateVehicleBatteryReferenceCapacityDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.referenceCapacity.create(orgId, vehicleId, body, req.user?.id);
  }

  @Post(':referenceCapacityId/verify')
  @RequirePermission('fleet-condition', 'manage')
  verify(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('referenceCapacityId') referenceCapacityId: string,
    @Body() body: VerifyVehicleBatteryReferenceCapacityDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.referenceCapacity.verify(
      orgId,
      vehicleId,
      referenceCapacityId,
      body,
      req.user.id,
    );
  }

  @Patch(':referenceCapacityId/notes')
  @RequirePermission('fleet-condition', 'write')
  updateNotes(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('referenceCapacityId') referenceCapacityId: string,
    @Body() body: UpdateVehicleBatteryReferenceCapacityNotesDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.referenceCapacity.updateNotes(
      orgId,
      vehicleId,
      referenceCapacityId,
      body,
      req.user?.id,
    );
  }
}
