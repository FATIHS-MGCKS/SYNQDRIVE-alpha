import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { DOCUMENT_UPLOAD_MODULE } from './document-extraction.constants';
import { DocumentExtractionController } from './document-extraction.controller';
import { DocumentExtractionOrgController } from './document-extraction-org.controller';
import { DocumentExtractionMetadataController } from './document-extraction-metadata.controller';

type ControllerClass = abstract new (...args: unknown[]) => unknown;

function classGuards(controller: ControllerClass) {
  return Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
}

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('DocumentExtractionController security', () => {
  it('applies vehicle ownership and permissions guards on vehicle routes', () => {
    expect(classGuards(DocumentExtractionController)).toEqual(
      expect.arrayContaining([RolesGuard, VehicleOwnershipGuard, PermissionsGuard]),
    );
  });

  it('requires document-upload read for GET handlers', () => {
    expect(permissionOf(DocumentExtractionController.prototype, 'list')).toEqual({
      module: DOCUMENT_UPLOAD_MODULE,
      level: 'read',
    });
    expect(permissionOf(DocumentExtractionController.prototype, 'getOne')).toEqual({
      module: DOCUMENT_UPLOAD_MODULE,
      level: 'read',
    });
    expect(permissionOf(DocumentExtractionController.prototype, 'download')).toEqual({
      module: DOCUMENT_UPLOAD_MODULE,
      level: 'read',
    });
  });

  it('requires document-upload write for mutating handlers', () => {
    for (const method of [
      'upload',
      'setDocumentType',
      'retry',
      'updateEntityLinks',
      'confirm',
      'cancel',
      'deleteFile',
    ] as const) {
      expect(permissionOf(DocumentExtractionController.prototype, method)).toEqual({
        module: DOCUMENT_UPLOAD_MODULE,
        level: 'write',
      });
    }
  });
});

describe('DocumentExtractionOrgController security', () => {
  it('applies org scoping and permissions guards', () => {
    expect(classGuards(DocumentExtractionOrgController)).toEqual(
      expect.arrayContaining([OrgScopingGuard, RolesGuard, PermissionsGuard]),
    );
  });

  it('requires document-upload read for org inbox and download', () => {
    expect(permissionOf(DocumentExtractionOrgController.prototype, 'list')).toEqual({
      module: DOCUMENT_UPLOAD_MODULE,
      level: 'read',
    });
    expect(permissionOf(DocumentExtractionOrgController.prototype, 'download')).toEqual({
      module: DOCUMENT_UPLOAD_MODULE,
      level: 'read',
    });
  });

  it('requires document-upload write for org entity link and vehicle reassignment', () => {
    for (const method of ['updateEntityLinks', 'reassignVehicle'] as const) {
      expect(permissionOf(DocumentExtractionOrgController.prototype, method)).toEqual({
        module: DOCUMENT_UPLOAD_MODULE,
        level: 'write',
      });
    }
  });
});

describe('DocumentExtractionMetadataController security', () => {
  it('requires authentication via RolesGuard only (no vehicle/org scope)', () => {
    expect(classGuards(DocumentExtractionMetadataController)).toEqual(
      expect.arrayContaining([RolesGuard]),
    );
    expect(classGuards(DocumentExtractionMetadataController)).not.toEqual(
      expect.arrayContaining([OrgScopingGuard, VehicleOwnershipGuard, PermissionsGuard]),
    );
  });
});
