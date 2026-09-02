import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { ReferenceCaptureController } from './reference-capture.controller';

function controllerGuards(controller: Function): Function[] {
  return (Reflect.getMetadata('__guards__', controller) ?? []) as Function[];
}

function handlerPermission(controller: Function, method: string) {
  const proto = controller.prototype;
  return Reflect.getMetadata(PERMISSION_KEY, proto[method]);
}

describe('ReferenceCaptureController security contract', () => {
  it('requires OrgScopingGuard, RolesGuard, and PermissionsGuard on controller', () => {
    const guards = controllerGuards(ReferenceCaptureController);
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, RolesGuard, PermissionsGuard]),
    );
  });

  it('requires fleet-condition:write for startRecording (FAST GO authority path)', () => {
    expect(handlerPermission(ReferenceCaptureController, 'startRecording')).toEqual({
      module: 'fleet-condition',
      level: 'write',
    });
  });

  it('requires fleet-condition:read for getSession and observations', () => {
    expect(handlerPermission(ReferenceCaptureController, 'getSession')).toEqual({
      module: 'fleet-condition',
      level: 'read',
    });
    expect(handlerPermission(ReferenceCaptureController, 'listObservations')).toEqual({
      module: 'fleet-condition',
      level: 'read',
    });
  });

  it('requires fleet-condition:write for abortSession (timeout compensation path)', () => {
    expect(handlerPermission(ReferenceCaptureController, 'abortSession')).toEqual({
      module: 'fleet-condition',
      level: 'write',
    });
  });
});
