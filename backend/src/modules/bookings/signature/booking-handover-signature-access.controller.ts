import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { BookingHandoverSignatureService } from './booking-handover-signature.service';

/**
 * Token-gated signature view/download endpoint.
 * No session auth — access is granted only via short-lived opaque tokens
 * issued by an authenticated `booking.signature.read` caller.
 */
@Controller('booking-signature-access')
export class BookingHandoverSignatureAccessController {
  constructor(private readonly signatures: BookingHandoverSignatureService) {}

  @Get(':token')
  async view(@Param('token') token: string, @Res() res: Response) {
    await this.signatures.streamByAccessToken(token, res);
  }
}
