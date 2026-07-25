import type { CustomerDocumentType } from '@prisma/client';

export function mapCustomerDocumentTypeToRegistry(
  type: CustomerDocumentType,
): 'license' | 'id_card' | 'passport' | 'contract' | 'other' {
  switch (type) {
    case 'LICENSE_FRONT':
    case 'LICENSE_BACK':
      return 'license';
    case 'ID_FRONT':
    case 'ID_BACK':
      return 'id_card';
    case 'PROOF_OF_ADDRESS':
      return 'contract';
    case 'OTHER':
    default:
      return 'other';
  }
}
