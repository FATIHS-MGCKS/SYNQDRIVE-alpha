import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS } from './legal-document-permission.constants';
import { LegalDocumentsController } from './legal-documents.controller';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('LegalDocumentsController permissions characterization', () => {
  it('applies OrgScopingGuard, RolesGuard and PermissionsGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, LegalDocumentsController) ?? [];
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, RolesGuard, PermissionsGuard]),
    );
  });

  it.each([
    ['list', 'legal_documents.view'],
    ['getOne', 'legal_documents.view'],
    ['download', 'legal_documents.view'],
    ['listOrganizationEvents', 'legal_documents.audit_view'],
    ['listDocumentEvents', 'legal_documents.audit_view'],
    ['upload', 'legal_documents.upload'],
    ['submitForReview', 'legal_documents.submit_review'],
    ['approve', 'legal_documents.approve'],
    ['schedule', 'legal_documents.schedule'],
    ['updateApplicationScope', 'legal_documents.manage_scope'],
    ['activate', 'legal_documents.activate'],
    ['revoke', 'legal_documents.revoke'],
    ['archive', 'legal_documents.archive'],
  ] as const)('%s requires %s', (method, action) => {
    const requirement = LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS[action];
    expect(permissionOf(LegalDocumentsController.prototype, method)).toEqual({
      module: requirement.module,
      level: requirement.level,
    });
  });

  it('does not use coarse @Roles ORG_ADMIN decorators on mutations', () => {
    const proto = LegalDocumentsController.prototype as unknown as Record<string, unknown>;
    for (const method of ['upload', 'activate', 'approve', 'archive']) {
      expect(Reflect.getMetadata('roles', proto[method] as object)).toBeUndefined();
    }
  });
});
