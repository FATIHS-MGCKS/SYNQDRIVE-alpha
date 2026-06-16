import { Body, Controller, Post } from '@nestjs/common';
import { OrganizationInviteService } from './organization-invite.service';
import { AcceptInviteDto, ValidateInviteDto } from './dto/organization-invite.dto';

/**
 * Public invite acceptance — no auth required (token is the credential).
 * Registered in AuthGuard PUBLIC_EXACT_PATHS.
 */
@Controller('invites')
export class PublicInvitesController {
  constructor(private readonly invites: OrganizationInviteService) {}

  @Post('validate')
  validate(@Body() body: ValidateInviteDto) {
    return this.invites.validateInviteToken(body.token);
  }

  @Post('accept')
  accept(@Body() body: AcceptInviteDto) {
    return this.invites.acceptInvite(body);
  }
}
