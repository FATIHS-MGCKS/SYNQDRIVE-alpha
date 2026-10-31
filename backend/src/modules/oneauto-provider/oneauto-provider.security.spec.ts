import { OneAutoProviderController } from './oneauto-provider.controller';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';

describe('OneAutoProviderController security characterization', () => {
  it('requires MASTER_ADMIN on controller', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, OneAutoProviderController);
    expect(roles).toEqual(['MASTER_ADMIN']);
  });

  it('exposes catalog and job routes under admin org scope', () => {
    const methods = [
      'getCatalog',
      'getAvailability',
      'quote',
      'execute',
      'getJob',
      'getResult',
    ];
    for (const name of methods) {
      expect(typeof OneAutoProviderController.prototype[name as keyof OneAutoProviderController]).toBe(
        'function',
      );
    }
  });
});
