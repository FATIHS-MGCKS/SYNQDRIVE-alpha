import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { OrganizationStatus } from '@prisma/client';
import type { AdminCreateOrganizationDto } from '../dto/admin-create-organization.dto';
import type { AdminUpdateOrganizationDto } from '../dto/admin-update-organization.dto';

export function normalizeShortCodeInput(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  return normalized.length > 0 ? normalized : undefined;
}

export function mapAdminCreateToServiceInput(
  dto: AdminCreateOrganizationDto,
): Record<string, unknown> {
  return {
    companyName: dto.companyName,
    shortCode: dto.shortCode,
    businessType: dto.businessType ?? 'OTHER',
    status: dto.status ?? OrganizationStatus.PENDING,
    email: dto.email ?? dto.contactEmail ?? '',
    phone: dto.phone,
    address: dto.address,
    city: dto.city,
    country: dto.country,
    website: dto.website,
  };
}

export function mapAdminUpdateToPrisma(
  dto: AdminUpdateOrganizationDto,
): Prisma.OrganizationUpdateInput {
  const data: Prisma.OrganizationUpdateInput = {};

  if (dto.companyName !== undefined) data.companyName = dto.companyName;
  if (dto.shortCode !== undefined) {
    data.shortCode = dto.shortCode === null ? null : normalizeShortCodeInput(dto.shortCode) ?? null;
  }
  if (dto.businessType !== undefined) data.businessType = dto.businessType;
  if (dto.status !== undefined) {
    if (dto.status === OrganizationStatus.ARCHIVED) {
      throw new ConflictException({
        code: 'ORGANIZATION_ARCHIVED_REQUIRES_OFFBOARDING_FINALIZATION',
        message:
          'Organization ARCHIVED status requires controlled offboarding finalization; generic status mutation is not permitted',
      });
    }
    data.status = dto.status;
  }
  if (dto.email !== undefined) data.email = dto.email;
  if (dto.phone !== undefined) data.phone = dto.phone;
  if (dto.address !== undefined) data.address = dto.address;
  if (dto.city !== undefined) data.city = dto.city;
  if (dto.state !== undefined) data.state = dto.state;
  if (dto.zip !== undefined) data.zip = dto.zip;
  if (dto.country !== undefined) data.country = dto.country;
  if (dto.website !== undefined) data.website = dto.website;
  if (dto.timezone !== undefined) data.timezone = dto.timezone;
  if (dto.language !== undefined) data.language = dto.language;
  if (dto.managerName !== undefined) data.managerName = dto.managerName;
  if (dto.managerEmail !== undefined) data.managerEmail = dto.managerEmail;
  if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
  if (dto.legalCompanyName !== undefined) data.legalCompanyName = dto.legalCompanyName;
  if (dto.legalForm !== undefined) data.legalForm = dto.legalForm;
  if (dto.taxId !== undefined) data.taxId = dto.taxId;
  if (dto.taxNumber !== undefined) data.taxNumber = dto.taxNumber;
  if (dto.vatId !== undefined) data.vatId = dto.vatId;
  if (dto.isSmallBusiness !== undefined) data.isSmallBusiness = dto.isSmallBusiness;
  if (dto.defaultVatRate !== undefined) data.defaultVatRate = dto.defaultVatRate;
  if (dto.invoicePrefix !== undefined) data.invoicePrefix = dto.invoicePrefix;
  if (dto.paymentTermsDays !== undefined) data.paymentTermsDays = dto.paymentTermsDays;
  if (dto.invoiceEmail !== undefined) data.invoiceEmail = dto.invoiceEmail;
  if (dto.bankName !== undefined) data.bankName = dto.bankName;
  if (dto.iban !== undefined) data.iban = dto.iban;
  if (dto.bic !== undefined) data.bic = dto.bic;
  if (dto.pdfFooterText !== undefined) data.pdfFooterText = dto.pdfFooterText;
  if (dto.emailSignature !== undefined) data.emailSignature = dto.emailSignature;
  if (dto.accentColor !== undefined) data.accentColor = dto.accentColor;
  if (dto.logoDarkUrl !== undefined) data.logoDarkUrl = dto.logoDarkUrl;
  if (dto.pdfLogoUrl !== undefined) data.pdfLogoUrl = dto.pdfLogoUrl;

  return data;
}