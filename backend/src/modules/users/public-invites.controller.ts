import { Body, Controller, Headers, Post } from '@nestjs/common';
import { InviteAcceptService } from './invite-accept.service';
import { AcceptInviteDto, ValidateInviteDto } from './dto/organization-invite.dto';
import { extractOptionalAuthIdentity } from '@shared/auth/optional-auth.util';

/**
 * Public invite acceptance — validate is anonymous; accept optionally reads JWT
 * when present to bind existing-user acceptance to verified identity.
 */
@Controller('invites')
export class PublicInvitesController {
  constructor(private readonly inviteAccept: InviteAcceptService) {}

  @Post('validate')
  validate(@Body() body: ValidateInviteDto) {
    return this.inviteAccept.validateInviteToken(body.token);
  }

  @Post('accept')
  accept(
    @Body() body: AcceptInviteDto,
    @Headers('authorization') authorization?: string,
  ) {
    const auth = extractOptionalAuthIdentity(authorization);
    return this.inviteAccept.acceptInvite(body, auth);
  }
}
