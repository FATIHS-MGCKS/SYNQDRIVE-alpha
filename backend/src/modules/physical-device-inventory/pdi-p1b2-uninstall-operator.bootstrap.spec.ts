import { MODULE_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import {
  createPdiP1b2UninstallOperatorApplicationContext,
  PdiP1b2UninstallOperatorBootstrapModule,
  PDI_P1B2_UNINSTALL_OPERATOR_MINIMAL_PROVIDERS,
} from './pdi-p1b2-uninstall-operator.bootstrap';

jest.mock('../../app.module', () => ({
  AppModule: {
    forRootAsync: jest.fn(async () => {
      throw new Error('AppModule bootstrap must not be used for P1B.2 uninstall operator');
    }),
  },
}));

describe('pdi-p1b2-uninstall-operator.bootstrap', () => {
  it('registers only minimal providers', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, PdiP1b2UninstallOperatorBootstrapModule) ?? [];
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PdiP1b2UninstallOperatorBootstrapModule) ?? [];
    expect(imports).toEqual([]);
    expect(providers).toEqual([...PDI_P1B2_UNINSTALL_OPERATOR_MINIMAL_PROVIDERS]);
  });

  it('does not bootstrap AppModule', async () => {
    const createSpy = jest
      .spyOn(NestFactory, 'createApplicationContext')
      .mockResolvedValue({ close: jest.fn() } as never);

    await createPdiP1b2UninstallOperatorApplicationContext();

    expect(AppModule.forRootAsync).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledWith(PdiP1b2UninstallOperatorBootstrapModule, {
      logger: false,
    });

    createSpy.mockRestore();
  });
});
