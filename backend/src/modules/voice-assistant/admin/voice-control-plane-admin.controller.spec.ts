import 'reflect-metadata';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { VoiceControlPlaneAdminController } from './voice-control-plane-admin.controller';

describe('VoiceControlPlaneAdminController', () => {
  it('is gated to MASTER_ADMIN only', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, VoiceControlPlaneAdminController);
    expect(roles).toEqual(['MASTER_ADMIN']);
  });
});
