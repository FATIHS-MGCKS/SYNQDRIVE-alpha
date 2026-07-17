import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  VoiceControlPlaneProvider,
  VoiceProviderAccountStatus,
  VoiceProviderAccountType,
} from '@prisma/client';
import { TWILIO_DEFAULT_EDGE, TWILIO_DEFAULT_REGION } from '@config/index';
import { PrismaService } from '@shared/database/prisma.service';
import { SecretRefResolver } from '@modules/twilio/secrets/secret-ref.resolver';
import { TwilioInvalidConfigurationError } from '@modules/twilio/errors/twilio-provider.errors';
import { ElevenLabsInvalidConfigurationError } from '../elevenlabs-provider/elevenlabs-provider.errors';

export type ElevenLabsTwilioImportCredentials = {
  accountSid: string;
  authToken: string;
};

@Injectable()
export class ElevenLabsTwilioImportCredentialsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly secretRefResolver: SecretRefResolver,
  ) {}

  /**
   * ElevenLabs native Twilio integration requires subaccount Account SID + Auth Token.
   * API keys alone are not supported per official ElevenLabs documentation.
   */
  async resolveSubaccountImportCredentials(
    organizationId: string,
  ): Promise<ElevenLabsTwilioImportCredentials> {
    const account = await this.prisma.voiceProviderAccount.findFirst({
      where: {
        organizationId,
        provider: VoiceControlPlaneProvider.TWILIO,
        accountType: VoiceProviderAccountType.SUBACCOUNT,
        archivedAt: null,
        status: VoiceProviderAccountStatus.ACTIVE,
      },
    });

    if (!account?.secretRef?.trim()) {
      throw new ElevenLabsInvalidConfigurationError(
        'Twilio subaccount credentials are not provisioned for organization.',
      );
    }

    const parentSid = this.config.get<string>('twilio.accountSid', '').trim();
    const resolved = await this.secretRefResolver.resolveJson<Record<string, unknown>>(
      account.secretRef,
    );
    const accountSid = typeof resolved.accountSid === 'string' ? resolved.accountSid.trim() : '';
    const authToken = typeof resolved.authToken === 'string' ? resolved.authToken.trim() : '';

    if (!accountSid) {
      throw new ElevenLabsInvalidConfigurationError('Subaccount SID is missing from secret reference.');
    }

    if (parentSid && accountSid === parentSid) {
      throw new TwilioInvalidConfigurationError(
        'Parent Twilio account credentials cannot be used for ElevenLabs import.',
      );
    }

    if (!authToken) {
      throw new ElevenLabsInvalidConfigurationError(
        'ElevenLabs native Twilio import requires subaccount Auth Token. API keys alone are not supported.',
      );
    }

    if (account.region?.trim().toLowerCase() !== TWILIO_DEFAULT_REGION) {
      throw new TwilioInvalidConfigurationError(
        `Twilio subaccount region must be ${TWILIO_DEFAULT_REGION}.`,
      );
    }

    if (account.edge?.trim().toLowerCase() !== TWILIO_DEFAULT_EDGE) {
      throw new TwilioInvalidConfigurationError(
        `Twilio subaccount edge must be ${TWILIO_DEFAULT_EDGE}.`,
      );
    }

    return { accountSid, authToken };
  }
}
