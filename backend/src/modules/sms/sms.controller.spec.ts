import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { SmsController } from './sms.controller';
import { SmsConfigService } from './sms-config.service';
import { buildSyntheticSmsConfigPublicDto } from './sms-config.public';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('SmsController', () => {
  const service = {
    getPublicConfig: jest.fn(),
  } as unknown as SmsConfigService;

  const controller = new SmsController(service);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies OrgScopingGuard, PermissionsGuard, and RolesGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, SmsController) ?? [];
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, PermissionsGuard, RolesGuard]),
    );
  });

  it('getConfig requires communication.read', () => {
    expect(permissionOf(SmsController.prototype, 'getConfig')).toEqual({
      module: 'communication',
      level: 'read',
    });
  });

  it('delegates getConfig to SmsConfigService without mutation', async () => {
    const dto = buildSyntheticSmsConfigPublicDto('org-1');
    (service.getPublicConfig as jest.Mock).mockResolvedValue(dto);

    const result = await controller.getConfig('org-1');

    expect(service.getPublicConfig).toHaveBeenCalledWith('org-1');
    expect(result).toEqual(dto);
    expect(result).not.toHaveProperty('apiKey');
    expect(result).not.toHaveProperty('webhookSigningSecret');
  });
});
