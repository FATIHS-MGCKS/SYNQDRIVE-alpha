import { Injectable, NotFoundException } from '@nestjs/common';
import { OrgEmailMode } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class OrgEmailSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(organizationId: string) {
    const existing = await this.prisma.orgEmailSettings.findUnique({
      where: { organizationId },
    });
    if (existing) return existing;

    return this.prisma.orgEmailSettings.create({
      data: {
        organizationId,
        mode: OrgEmailMode.SYNQDRIVE_DEFAULT,
      },
    });
  }

  async get(organizationId: string) {
    return this.getOrCreate(organizationId);
  }

  async update(
    organizationId: string,
    data: {
      mode?: OrgEmailMode;
      defaultFromName?: string | null;
      defaultReplyToEmail?: string | null;
      signatureHtml?: string | null;
      signatureText?: string | null;
    },
  ) {
    await this.getOrCreate(organizationId);
    return this.prisma.orgEmailSettings.update({
      where: { organizationId },
      data: {
        mode: data.mode,
        defaultFromName: data.defaultFromName,
        defaultReplyToEmail: data.defaultReplyToEmail,
        signatureHtml: data.signatureHtml,
        signatureText: data.signatureText,
      },
    });
  }

  async getOrganizationForPolicy(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        companyName: true,
        invoiceEmail: true,
        email: true,
        managerEmail: true,
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async getVerifiedDomain(organizationId: string) {
    return this.prisma.orgEmailDomain.findFirst({
      where: {
        organizationId,
        status: 'VERIFIED',
      },
      orderBy: { verifiedAt: 'desc' },
    });
  }
}
