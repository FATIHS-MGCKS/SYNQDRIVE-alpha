import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { OutboundEmailDomainService } from './outbound-email-domain.service';
import { OutboundEmailService } from './outbound-email.service';
import { BookingDocumentEmailService } from './booking-document-email.service';
import { UpdateOrgEmailSettingsDto } from './dto/update-org-email-settings.dto';
import { AddOrgEmailDomainDto } from './dto/add-org-email-domain.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';

@Controller('organizations/:orgId/email')
@UseGuards(OrgScopingGuard, RolesGuard)
export class OrgEmailController {
  constructor(
    private readonly domainService: OutboundEmailDomainService,
    private readonly outboundEmail: OutboundEmailService,
    private readonly bookingEmail: BookingDocumentEmailService,
  ) {}

  @Get('settings')
  getSettings(@Param('orgId') orgId: string) {
    return this.domainService.getSettings(orgId);
  }

  @Put('settings')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  updateSettings(@Param('orgId') orgId: string, @Body() body: UpdateOrgEmailSettingsDto) {
    return this.domainService.updateSettings(orgId, body);
  }

  @Get('domains')
  listDomains(@Param('orgId') orgId: string) {
    return this.domainService.listDomains(orgId);
  }

  @Post('domains')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  addDomain(@Param('orgId') orgId: string, @Body() body: AddOrgEmailDomainDto) {
    return this.domainService.addDomain(orgId, body.domain, body.fromLocalPart);
  }

  @Post('domains/:domainId/verify')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  verifyDomain(@Param('orgId') orgId: string, @Param('domainId') domainId: string) {
    return this.domainService.verifyDomain(orgId, domainId);
  }

  @Post('domains/:domainId/activate')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  activateDomain(@Param('orgId') orgId: string, @Param('domainId') domainId: string) {
    return this.domainService.activateDomain(orgId, domainId);
  }

  @Delete('domains/:domainId')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async deleteDomain(@Param('orgId') orgId: string, @Param('domainId') domainId: string) {
    await this.domainService.deleteDomain(orgId, domainId);
    return { ok: true };
  }

  @Post('test')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  sendTest(
    @Param('orgId') orgId: string,
    @Body() body: SendTestEmailDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.bookingEmail.sendTestEmail(orgId, userId ?? null, body.toEmail);
  }

  @Get('history')
  listHistory(
    @Param('orgId') orgId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('bookingId') bookingId?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.outboundEmail.listForOrg(orgId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      bookingId,
      customerId,
    });
  }

  @Get('history/:emailId')
  getHistoryItem(@Param('orgId') orgId: string, @Param('emailId') emailId: string) {
    return this.outboundEmail.findById(orgId, emailId);
  }
}
