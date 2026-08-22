import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildSyntheticSmsConfigPublicDto,
  mapOrgSmsConfigToPublicDto,
  type SmsConfigPublicDto,
} from './sms-config.public';

export type { SmsConfigPublicDto };

@Injectable()
export class SmsConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pure read — never creates or mutates OrgSmsConfig.
   * Missing row returns a synthetic NOT_CONFIGURED public DTO (hasConfigRow=false).
   */
  async getPublicConfig(orgId: string): Promise<SmsConfigPublicDto> {
    const config = await this.prisma.orgSmsConfig.findUnique({
      where: { organizationId: orgId },
    });

    if (!config) {
      return buildSyntheticSmsConfigPublicDto(orgId);
    }

    return mapOrgSmsConfigToPublicDto(config);
  }
}
