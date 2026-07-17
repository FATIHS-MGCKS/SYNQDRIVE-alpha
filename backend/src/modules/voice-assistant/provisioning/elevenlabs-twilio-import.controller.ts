import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import {
  ElevenLabsTwilioDeactivateDto,
  ElevenLabsTwilioImportAndAssignDto,
  ElevenLabsTwilioImportReadinessDto,
} from './dto/elevenlabs-twilio-import.dto';
import { ElevenLabsTwilioImportProvisioningService } from './elevenlabs-twilio-import-provisioning.service';

@Controller('admin/voice-assistant/organizations/:orgId/elevenlabs')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class ElevenLabsTwilioImportController {
  constructor(private readonly provisioning: ElevenLabsTwilioImportProvisioningService) {}

  @Get('phone-numbers/:phoneNumberId/import-readiness')
  async readiness(
    @Param('orgId') orgId: string,
    @Param('phoneNumberId') phoneNumberId: string,
    @Query() query: ElevenLabsTwilioImportReadinessDto,
  ) {
    return this.provisioning.evaluateReadiness(orgId, phoneNumberId, query.deploymentId);
  }

  @Post('phone-numbers/:phoneNumberId/import-and-assign')
  async importAndAssign(
    @Param('orgId') orgId: string,
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() body: ElevenLabsTwilioImportAndAssignDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.provisioning.importAndAssign({
      organizationId: orgId,
      phoneNumberId,
      deploymentId: body.deploymentId,
      actor: {
        userId: req.user?.id,
        idempotencyKey: idempotencyKey ?? '',
        confirm: body.confirm,
        dryRun: body.dryRun,
      },
    });
  }

  @Post('phone-numbers/:phoneNumberId/deactivate')
  async deactivate(
    @Param('orgId') orgId: string,
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() body: ElevenLabsTwilioDeactivateDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.provisioning.deactivateAssignment(orgId, phoneNumberId, {
      userId: req.user?.id,
      confirm: body.confirm,
    });
  }
}
