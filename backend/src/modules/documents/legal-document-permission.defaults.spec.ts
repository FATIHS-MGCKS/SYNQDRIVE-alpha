import { evaluateModulePermission, normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import {
  legalDocumentFullPermissions,
  legalDocumentReadPermissions,
  legalDocumentViewerPermissions,
} from './legal-document-permission.defaults';
import { LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS } from './legal-document-permission.constants';

describe('legal-document-permission.defaults', () => {
  it('maps viewer to read-only legal-documents module', () => {
    const perms = normalizeMembershipPermissions(legalDocumentViewerPermissions());
    expect(evaluateModulePermission(perms, 'legal-documents', 'read')).toBe(true);
    expect(evaluateModulePermission(perms, 'legal-documents', 'write')).toBe(false);
    expect(evaluateModulePermission(perms, 'legal-documents-audit', 'read')).toBe(false);
  });

  it('maps full permissions to manage for approve/activate actions', () => {
    const perms = normalizeMembershipPermissions(legalDocumentFullPermissions());
    expect(
      evaluateModulePermission(
        perms,
        LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS['legal_documents.approve'].module,
        LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS['legal_documents.approve'].level,
      ),
    ).toBe(true);
    expect(
      evaluateModulePermission(
        perms,
        LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS['legal_documents.upload'].module,
        LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS['legal_documents.upload'].level,
      ),
    ).toBe(true);
  });

  it('grants org_admin template full legal access', () => {
    const orgAdmin = DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === 'org_admin');
    const perms = normalizeMembershipPermissions(orgAdmin?.permissions);
    expect(evaluateModulePermission(perms, 'legal-documents', 'manage')).toBe(true);
    expect(evaluateModulePermission(perms, 'legal-documents-audit', 'read')).toBe(true);
  });

  it('grants sub_admin read-only legal access (legacy-compatible)', () => {
    const subAdmin = DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === 'sub_admin');
    const perms = normalizeMembershipPermissions(subAdmin?.permissions);
    expect(evaluateModulePermission(perms, 'legal-documents', 'read')).toBe(true);
    expect(evaluateModulePermission(perms, 'legal-documents', 'write')).toBe(false);
    expect(evaluateModulePermission(perms, 'legal-documents-audit', 'read')).toBe(true);
  });

  it('grants employee viewer read on legal-documents only', () => {
    const employee = DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === 'employee');
    const perms = normalizeMembershipPermissions(employee?.permissions);
    expect(evaluateModulePermission(perms, 'legal-documents', 'read')).toBe(true);
    expect(evaluateModulePermission(perms, 'legal-documents', 'write')).toBe(false);
    expect(evaluateModulePermission(perms, 'legal-documents-audit', 'read')).toBe(false);
  });

  it('exposes stable permission codes for each action', () => {
    expect(LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS['legal_documents.view'].code).toBe(
      'LEGAL_DOCUMENT_VIEW',
    );
    expect(LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS['legal_documents.override_handover'].code).toBe(
      'LEGAL_DOCUMENT_OVERRIDE_HANDOVER',
    );
  });
});
