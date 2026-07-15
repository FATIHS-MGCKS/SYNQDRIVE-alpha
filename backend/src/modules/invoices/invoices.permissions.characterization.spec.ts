import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { InvoicesController } from './invoices.controller';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('InvoicesController permissions characterization', () => {
  it('applies OrgScopingGuard, RolesGuard and PermissionsGuard on controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, InvoicesController) ?? [];
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, RolesGuard, PermissionsGuard]),
    );
  });

  const readHandlers = [
    'listItems',
    'findAll',
    'getStats',
    'findOne',
    'findByCustomer',
    'getTimeline',
    'getDocumentsPanel',
    'downloadAttachment',
  ] as const;

  it.each(readHandlers)('%s requires invoices.read', (method) => {
    expect(permissionOf(InvoicesController.prototype, method)).toEqual({
      module: 'invoices',
      level: 'read',
    });
  });

  const writeHandlers = [
    'create',
    'update',
    'issue',
    'cancel',
    'markSent',
    'recordPayment',
    'markPaid',
    'generateDocument',
    'sendInvoiceEmail',
    'retryInvoiceEmail',
    'uploadAttachment',
  ] as const;

  it.each(writeHandlers)('%s requires invoices.write', (method) => {
    expect(permissionOf(InvoicesController.prototype, method)).toEqual({
      module: 'invoices',
      level: 'write',
    });
  });

  it('does not rely on ORG_ADMIN role decorator for document mutations', () => {
    const proto = InvoicesController.prototype as unknown as Record<string, unknown>;
    expect(Reflect.getMetadata('roles', proto.generateDocument as object)).toBeUndefined();
    expect(Reflect.getMetadata('roles', proto.sendInvoiceEmail as object)).toBeUndefined();
  });
});
