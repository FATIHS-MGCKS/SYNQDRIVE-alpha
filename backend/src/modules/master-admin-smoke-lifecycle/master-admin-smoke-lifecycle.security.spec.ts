import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { MasterAdminSmokeLifecycleModule } from './master-admin-smoke-lifecycle.module';

describe('MasterAdminSmokeLifecycleModule security', () => {
  it('does not register HTTP controllers', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, MasterAdminSmokeLifecycleModule) as
      | unknown[]
      | undefined;
    expect(controllers ?? []).toHaveLength(0);
  });
});
