import { Injectable } from '@nestjs/common';
import { OrganizationLegalDocument } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { LegalDocumentForbiddenError } from './legal-documents-api.errors';
import { LEGAL_DOCUMENT_ERROR_CODES } from './legal-documents.errors';

export type LegalDocumentFourEyesOperation = 'approve' | 'activate';

/**
 * Configurable maker-checker enforcement for legal document lifecycle.
 * When enabled on the organization, approvers/activators must differ from upload/submit actors.
 */
@Injectable()
export class LegalDocumentFourEyesService {
  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(organizationId: string): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { legalDocumentFourEyesEnabled: true },
    });
    return org?.legalDocumentFourEyesEnabled === true;
  }

  async assertSeparation(
    organizationId: string,
    doc: Pick<
      OrganizationLegalDocument,
      'uploadedByUserId' | 'submittedForReviewByUserId' | 'approvedByUserId'
    >,
    actorUserId: string | null | undefined,
    operation: LegalDocumentFourEyesOperation,
  ): Promise<void> {
    if (!actorUserId) return;
    if (!(await this.isEnabled(organizationId))) return;

    const blocked = new Set<string>();
    if (doc.uploadedByUserId) blocked.add(doc.uploadedByUserId);
    if (operation === 'approve' && doc.submittedForReviewByUserId) {
      blocked.add(doc.submittedForReviewByUserId);
    }

    if (blocked.has(actorUserId)) {
      throw new LegalDocumentForbiddenError(
        'Four-eyes policy: the approver or activator must be a different user than the uploader or submitter',
        LEGAL_DOCUMENT_ERROR_CODES.FOUR_EYES_VIOLATION,
      );
    }
  }
}
