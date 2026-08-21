import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CommunicationProjectionFeatureService {
  constructor(private readonly configService: ConfigService) {}

  isWhatsAppProjectionEnabled(organizationId: string): boolean {
    const enabled = this.configService.get<boolean>(
      'communicationProjection.whatsappEnabled',
      false,
    );
    if (!enabled) {
      return false;
    }

    const allowlist = this.configService.get<string[]>(
      'communicationProjection.orgAllowlist',
      [],
    );
    if (allowlist.length === 0) {
      return true;
    }

    return allowlist.includes(organizationId);
  }

  isVoiceProjectionEnabled(organizationId: string): boolean {
    const enabled = this.configService.get<boolean>(
      'communicationProjection.voiceEnabled',
      false,
    );
    if (!enabled) {
      return false;
    }

    const allowlist = this.configService.get<string[]>(
      'communicationProjection.orgAllowlist',
      [],
    );
    if (allowlist.length === 0) {
      return true;
    }

    return allowlist.includes(organizationId);
  }
}
