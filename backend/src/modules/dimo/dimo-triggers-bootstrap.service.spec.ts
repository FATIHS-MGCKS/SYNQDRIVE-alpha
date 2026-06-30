import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import dimoConfig from '@config/dimo.config';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoTriggersBootstrapService } from './dimo-triggers-bootstrap.service';
import { DimoTriggersService } from './dimo-triggers.service';
import {
  DIMO_TRIGGER_BOOTSTRAP_DISABLED_LOG,
  isDimoTriggerBootstrapEnabled,
} from './dimo-trigger-bootstrap.util';

describe('isDimoTriggerBootstrapEnabled', () => {
  it('is false by default', () => {
    expect(isDimoTriggerBootstrapEnabled({})).toBe(false);
    expect(isDimoTriggerBootstrapEnabled({ DIMO_TRIGGER_BOOTSTRAP_ENABLED: '' })).toBe(false);
    expect(isDimoTriggerBootstrapEnabled({ DIMO_TRIGGER_BOOTSTRAP_ENABLED: 'false' })).toBe(false);
  });

  it('is true only when explicitly set to true', () => {
    expect(isDimoTriggerBootstrapEnabled({ DIMO_TRIGGER_BOOTSTRAP_ENABLED: 'true' })).toBe(true);
    expect(isDimoTriggerBootstrapEnabled({ DIMO_TRIGGER_BOOTSTRAP_ENABLED: 'TRUE' })).toBe(true);
    expect(isDimoTriggerBootstrapEnabled({ DIMO_TRIGGER_BOOTSTRAP_ENABLED: '1' })).toBe(false);
  });
});

describe('DimoTriggersBootstrapService', () => {
  let bootstrap: DimoTriggersBootstrapService;
  let triggers: jest.Mocked<Pick<DimoTriggersService, 'ensureWebhookRegistered' | 'registerAllTriggersForVehicle'>>;
  let prisma: { vehicle: { findMany: jest.Mock } };
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    triggers = {
      ensureWebhookRegistered: jest.fn(),
      registerAllTriggersForVehicle: jest.fn(),
    };
    prisma = {
      vehicle: { findMany: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DimoTriggersBootstrapService,
        { provide: DimoTriggersService, useValue: triggers },
        { provide: PrismaService, useValue: prisma },
        {
          provide: dimoConfig.KEY,
          useValue: {
            webhookBaseUrl: 'https://app.synqdrive.eu',
            triggerBootstrapEnabled: false,
          },
        },
      ],
    }).compile();

    bootstrap = moduleRef.get(DimoTriggersBootstrapService);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('does not register webhooks or subscribe vehicles when bootstrap is disabled', async () => {
    await bootstrap.onModuleInit();

    expect(triggers.ensureWebhookRegistered).not.toHaveBeenCalled();
    expect(triggers.registerAllTriggersForVehicle).not.toHaveBeenCalled();
    expect(prisma.vehicle.findMany).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(DIMO_TRIGGER_BOOTSTRAP_DISABLED_LOG);
  });

  it('bootstraps webhook and vehicles only when DIMO_TRIGGER_BOOTSTRAP_ENABLED=true', async () => {
    const enabledModule = await Test.createTestingModule({
      providers: [
        DimoTriggersBootstrapService,
        { provide: DimoTriggersService, useValue: triggers },
        { provide: PrismaService, useValue: prisma },
        {
          provide: dimoConfig.KEY,
          useValue: {
            webhookBaseUrl: 'https://app.synqdrive.eu',
            triggerBootstrapEnabled: true,
          },
        },
      ],
    }).compile();

    const enabledBootstrap = enabledModule.get(DimoTriggersBootstrapService);
    triggers.ensureWebhookRegistered.mockResolvedValue('wh_1');
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'v1', dimoVehicle: { tokenId: 42 } },
      { id: 'v2', dimoVehicle: { tokenId: null } },
    ]);

    await enabledBootstrap.onModuleInit();

    expect(triggers.ensureWebhookRegistered).toHaveBeenCalledWith(
      'https://app.synqdrive.eu/api/v1/webhooks/dimo',
    );
    expect(triggers.registerAllTriggersForVehicle).toHaveBeenCalledTimes(1);
    expect(triggers.registerAllTriggersForVehicle).toHaveBeenCalledWith('wh_1', 42);
  });
});
