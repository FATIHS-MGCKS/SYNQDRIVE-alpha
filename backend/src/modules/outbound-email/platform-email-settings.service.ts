import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';

const SINGLETON_ID = 'platform';

export interface ResolvedPlatformEmailDefaults {
  defaultFromEmail: string;
  defaultFromName: string;
  defaultReplyToEmail: string | null;
}

export interface PlatformEmailSettingsAdminDto {
  defaultFromEmail: string;
  defaultFromName: string;
  defaultReplyToEmail: string | null;
  configuredInDatabase: boolean;
  effectiveFromEmail: string;
  effectiveFromName: string;
  effectiveReplyToEmail: string | null;
  updatedAt: string | null;
}

@Injectable()
export class PlatformEmailSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getAdminSettings(): Promise<PlatformEmailSettingsAdminDto> {
    const row = await this.prisma.platformEmailSettings.findUnique({
      where: { id: SINGLETON_ID },
    });
    const effective = await this.getResolvedDefaults();

    return {
      defaultFromEmail: row?.defaultFromEmail ?? this.envFromEmail(),
      defaultFromName: row?.defaultFromName ?? this.envFromName(),
      defaultReplyToEmail: row?.defaultReplyToEmail ?? this.envReplyTo(),
      configuredInDatabase: !!row,
      effectiveFromEmail: effective.defaultFromEmail,
      effectiveFromName: effective.defaultFromName,
      effectiveReplyToEmail: effective.defaultReplyToEmail,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async updateAdminSettings(
    input: {
      defaultFromEmail: string;
      defaultFromName: string;
      defaultReplyToEmail?: string | null;
    },
    updatedByUserId?: string | null,
  ): Promise<PlatformEmailSettingsAdminDto> {
    const defaultFromEmail = input.defaultFromEmail.trim().toLowerCase();
    const defaultFromName = input.defaultFromName.trim();
    const defaultReplyToEmail = input.defaultReplyToEmail?.trim() || null;

    if (!defaultFromEmail || !defaultFromName) {
      throw new BadRequestException('Default from email and name are required');
    }
    if (!this.isValidEmail(defaultFromEmail)) {
      throw new BadRequestException('Invalid default from email');
    }
    if (defaultReplyToEmail && !this.isValidEmail(defaultReplyToEmail)) {
      throw new BadRequestException('Invalid default reply-to email');
    }

    await this.prisma.platformEmailSettings.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        defaultFromEmail,
        defaultFromName,
        defaultReplyToEmail,
        updatedByUserId: updatedByUserId ?? null,
      },
      update: {
        defaultFromEmail,
        defaultFromName,
        defaultReplyToEmail,
        updatedByUserId: updatedByUserId ?? null,
      },
    });

    return this.getAdminSettings();
  }

  async getResolvedDefaults(): Promise<ResolvedPlatformEmailDefaults> {
    const row = await this.prisma.platformEmailSettings.findUnique({
      where: { id: SINGLETON_ID },
    });

    return {
      defaultFromEmail: row?.defaultFromEmail?.trim() || this.envFromEmail(),
      defaultFromName: row?.defaultFromName?.trim() || this.envFromName(),
      defaultReplyToEmail:
        row?.defaultReplyToEmail?.trim() || this.envReplyTo() || null,
    };
  }

  private envFromEmail(): string {
    return this.config.get<string>('email.defaultFrom', 'noreply@synqdrive.eu');
  }

  private envFromName(): string {
    return this.config.get<string>('email.defaultFromName', 'SynqDrive');
  }

  private envReplyTo(): string | null {
    const value = this.config.get<string>('email.defaultReplyTo', '')?.trim();
    return value || null;
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
}
