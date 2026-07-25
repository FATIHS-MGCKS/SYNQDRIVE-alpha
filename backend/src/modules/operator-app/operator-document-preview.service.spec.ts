import { UnauthorizedException } from '@nestjs/common';
import { OperatorDocumentPreviewService } from './operator-document-preview.service';

describe('OperatorDocumentPreviewService', () => {
  const service = new OperatorDocumentPreviewService({
    get: () => 'test-preview-secret',
  } as never);

  it('issues and verifies short-lived customer preview token', () => {
    const { token } = service.issueCustomerDocumentPreviewToken({
      organizationId: 'org-1',
      customerId: 'customer-1',
      documentId: 'doc-1',
      userId: 'user-1',
    });
    const claims = service.verifyCustomerDocumentToken(token);
    expect(claims.organizationId).toBe('org-1');
    expect(claims.customerId).toBe('customer-1');
  });

  it('rejects tampered preview token', () => {
    const { token } = service.issueGeneratedDocumentPreviewToken({
      organizationId: 'org-1',
      bookingId: 'booking-1',
      documentId: 'doc-1',
      userId: 'user-1',
    });
    expect(() => service.verifyGeneratedDocumentToken(`${token}x`)).toThrow(UnauthorizedException);
  });
});
