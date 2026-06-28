import { ServiceUnavailableException } from '@nestjs/common';
import { DimoWebhookController } from './dimo-webhook.controller';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';

function makeController(overrides?: {
  prisma?: Partial<PrismaServiceMock>;
  deviceConnection?: Partial<DeviceConnectionMock>;
}) {
  const prisma: PrismaServiceMock = {
    vehicle: { findFirst: jest.fn().mockResolvedValue(null) },
    vehicleLatestState: { updateMany: jest.fn() },
    ...overrides?.prisma,
  };
  const deviceConnection: DeviceConnectionMock = {
    ingestObdPlugStateChange: jest.fn().mockResolvedValue({ outcome: 'created', eventId: 'e1' }),
    ...overrides?.deviceConnection,
  };
  const dtcService = { upsertDtc: jest.fn() };
  const controller = new DimoWebhookController(
    prisma as never,
    dtcService as never,
    deviceConnection as never,
  );
  return { controller, prisma, deviceConnection, dtcService };
}

type PrismaServiceMock = {
  vehicle: { findFirst: jest.Mock };
  vehicleLatestState: { updateMany: jest.Mock };
};

type DeviceConnectionMock = {
  ingestObdPlugStateChange: jest.Mock;
};

describe('DimoWebhookController — verification handshake', () => {
  const originalVerificationToken = process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.DIMO_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN = originalVerificationToken;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.DIMO_WEBHOOK_SECRET = originalSecret;
  });

  it('returns verificationToken for DIMO URL probe without HMAC', async () => {
    process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN = 'synqdrive-prod-token';
    process.env.DIMO_WEBHOOK_SECRET = 'hmac-secret';
    process.env.NODE_ENV = 'production';

    const { controller } = makeController();
    const result = await controller.handleWebhook(
      { rawBody: Buffer.from('{"verification":"test"}') } as never,
      { verification: 'test' },
      undefined,
    );

    expect(result).toEqual({ verificationToken: 'synqdrive-prod-token' });
  });

  it('fails closed when verification token env is missing', async () => {
    delete process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN;
    process.env.NODE_ENV = 'production';

    const { controller } = makeController();
    await expect(
      controller.handleWebhook(
        { rawBody: Buffer.from('{"verification":"test"}') } as never,
        { verification: 'test' },
        undefined,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('DimoWebhookController — device connection CloudEvent', () => {
  const originalSecret = process.env.DIMO_WEBHOOK_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.DIMO_WEBHOOK_SECRET = originalSecret;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('processes dimo.trigger obdIsPluggedIn=false as device_connection', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DIMO_WEBHOOK_SECRET;

    const vehicle = { id: 'veh-1', organizationId: 'org-1' };
    const { controller, prisma, deviceConnection } = makeController({
      prisma: {
        vehicle: { findFirst: jest.fn().mockResolvedValue(vehicle) },
      },
    });

    const body = {
      type: 'dimo.trigger',
      subject: 'did:erc721:137:0xabc:777',
      time: '2026-06-28T12:00:00.000Z',
      data: {
        service: 'signals',
        metricName: 'obdIsPluggedIn',
        webhookName: 'OBD device unplugged',
        assetDID: 'did:erc721:137:0xabc:777',
        signal: { name: 'obdIsPluggedIn', timestamp: '2026-06-28T12:00:00.000Z', value: false },
      },
    };

    const result = await controller.handleWebhook({ rawBody: Buffer.from(JSON.stringify(body)) } as never, body);

    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
      where: { dimoVehicle: { tokenId: 777 } },
    });
    expect(deviceConnection.ingestObdPlugStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicle: { id: 'veh-1', organizationId: 'org-1' },
        tokenId: 777,
        pluggedIn: false,
      }),
    );
    expect(result).toMatchObject({ status: 'processed', type: 'device_connection' });
  });

  it('ignores blocked RPM engine webhook signals', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DIMO_WEBHOOK_SECRET;

    const { controller, deviceConnection } = makeController({
      prisma: {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({ id: 'v1', organizationId: 'o1' }),
        },
      },
    });

    const body = {
      type: 'dimo.trigger',
      subject: 'did:erc721:137:0xabc:1',
      data: {
        signal: { name: 'powertrainCombustionEngineSpeed', value: 4500 },
      },
    };

    const result = await controller.handleWebhook({ rawBody: Buffer.from(JSON.stringify(body)) } as never, body);
    expect(result).toEqual({ status: 'ignored', reason: 'blocked_engine_signal' });
    expect(deviceConnection.ingestObdPlugStateChange).not.toHaveBeenCalled();
  });
});
