import { randomUUID } from 'crypto';
import {
  PrismaClient,
  type Organization,
  type OrganizationLegalDocument,
} from '@prisma/client';
import { DOCUMENT_TYPE, LEGAL_STATUS } from '../documents.constants';

export type LegalDocumentsPostgresFixture = {
  suffix: string;
  orgA: Organization;
  orgB: Organization;
  docOrgA: OrganizationLegalDocument;
  docOrgB: OrganizationLegalDocument;
};

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createLegalDocumentsPostgresFixture(
  prisma: PrismaClient,
): Promise<LegalDocumentsPostgresFixture> {
  const suffix = uniqueSuffix();

  const orgA = await prisma.organization.create({
    data: {
      companyName: `Legal PG Test Org A ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
  });

  const orgB = await prisma.organization.create({
    data: {
      companyName: `Legal PG Test Org B ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
  });

  const baseDoc = {
    documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
    title: 'AGB Test',
    versionLabel: `v-${suffix}`,
    language: 'de',
    status: LEGAL_STATUS.APPROVED,
    fileName: 'agb.pdf',
    mimeType: 'application/pdf',
    storageProvider: 'local',
    objectKey: `organizations/${orgA.id}/legal/test-${suffix}.pdf`,
    checksum: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    sizeBytes: 100,
    scanStatus: 'SCAN_PASSED',
    jurisdictionCountry: 'DE',
  };

  const docOrgA = await prisma.organizationLegalDocument.create({
    data: {
      ...baseDoc,
      organizationId: orgA.id,
      objectKey: `organizations/${orgA.id}/legal/test-a-${suffix}.pdf`,
    },
  });

  const docOrgB = await prisma.organizationLegalDocument.create({
    data: {
      ...baseDoc,
      organizationId: orgB.id,
      objectKey: `organizations/${orgB.id}/legal/test-b-${suffix}.pdf`,
    },
  });

  return { suffix, orgA, orgB, docOrgA, docOrgB };
}

export async function cleanupLegalDocumentsPostgresFixture(
  prisma: PrismaClient,
  fixture: LegalDocumentsPostgresFixture,
): Promise<void> {
  const orgIds = [fixture.orgA.id, fixture.orgB.id];
  await prisma.organizationLegalDocumentEvent.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.legalDocumentDeliveryEvidence.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.organizationLegalDocument.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: orgIds } },
  });
}

export async function probeLegalDocumentsDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

export function randomRequestId(): string {
  return `req-${randomUUID()}`;
}
