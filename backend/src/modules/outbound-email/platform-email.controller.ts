import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { PlatformEmailSettingsService } from './platform-email-settings.service';
import { UpdatePlatformEmailSettingsDto } from './dto/update-platform-email-settings.dto';

@Controller('admin/email')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class PlatformEmailController {
  constructor(
    private readonly platformEmail: PlatformEmailSettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.platformEmail.getAdminSettings();
  }

  @Put('settings')
  async updateSettings(
    @Body() body: UpdatePlatformEmailSettingsDto,
    @CurrentUser('id') userId: string | undefined,
    @Req() req: unknown,
  ) {
    const result = await this.platformEmail.updateAdminSettings(body, userId ?? null);
    void this.audit.record({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.ADMIN_OPERATION,
      description: `Master admin updated platform default email sender to ${result.effectiveFromEmail}`,
      changeSummary: `Platform sender: ${result.effectiveFromName} <${result.effectiveFromEmail}>`,
    });
    return result;
  }
}
