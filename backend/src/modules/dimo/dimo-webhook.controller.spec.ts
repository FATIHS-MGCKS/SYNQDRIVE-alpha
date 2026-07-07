import { ServiceUnavailableException } from '@nestjs/common';
import { DimoWebhookController } from './dimo-webhook.controller';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';

function makeController(overrides?: {
  prisma?: Partial<PrismaServiceMock>;
  deviceConnection?: Partial<DeviceConnectionMock>;
  rpmWebhookCandidate?: Partial<RpmWebhookMock>;
  verificationToken?: string;
  obdPlugInWebhookEnabled?: boolean;
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
  const rpmWebhookCandidate: RpmWebhookMock = {
    ingestRpmThresholdEvent: jest.fn().mockResolvedValue({
      outcome: 'created',
      candidateId: 'rpm-1',
      status: 'CONTEXT_ENRICHED',
    }),
    ...overrides?.rpmWebhookCandidate,
  };
  const dtcService = { upsertDtc: jest.fn() };
  const dimoConf = {
    webhookVerificationToken: overrides?.verificationToken ?? process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN ?? '',
    obdPlugInWebhookEnabled: overrides?.obdPlugInWebhookEnabled ?? false,
  };
  const controller = new DimoWebhookController(
    dimoConf as never,
    prisma as never,
    dtcService as never,
    deviceConnection as never,
    rpmWebhookCandidate as never,
  );
  return { controller, prisma, deviceConnection, rpmWebhookCandidate, dtcService };
}

type PrismaServiceMock = {
  vehicle: { findFirst: jest.Mock };
  vehicleLatestState: { updateMany: jest.Mock };
};

type DeviceConnectionMock = {
  ingestObdPlugStateChange: jest.Mock;
};

type RpmWebhookMock = {
  ingestRpmThresholdEvent: jest.Mock;
};

const mockRes = { type: jest.fn().mockReturnThis() } as never;

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
      mockRes,
    );

    expect(result).toBe('synqdrive-prod-token');
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
        mockRes,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('DimoWebhookController — device connection CloudEvent', () => {
  const originalSecret = process.env.DIMO_WEBHOOK_SECRET;
  const originalVerificationToken = process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.DIMO_WEBHOOK_SECRET = originalSecret;
    process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN = originalVerificationToken;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('processes dimo.trigger obdIsPluggedIn=false as device_connection', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DIMO_WEBHOOK_SECRET;

    const vehicle = { id: 'veh-1', organizationId: 'org-1', hardwareType: 'LTE_R1', fuelType: 'PETROL' };
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

    const result = await controller.handleWebhook({ rawBody: Buffer.from(JSON.stringify(body)) } as never, body, undefined, mockRes);

    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
      where: { dimoVehicle: { tokenId: 777 } },
      select: {
        id: true,
        organizationId: true,
        hardwareType: true,
        fuelType: true,
      },
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

  it('ignores blocked throttle engine webhook signals', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DIMO_WEBHOOK_SECRET;

    const { controller, deviceConnection, rpmWebhookCandidate } = makeController({
      prisma: {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'v1',
            organizationId: 'o1',
            hardwareType: 'LTE_R1',
            fuelType: 'PETROL',
          }),
        },
      },
    });

    const body = {
      type: 'dimo.trigger',
      subject: 'did:erc721:137:0xabc:1',
      data: {
        signal: { name: 'throttle', value: 90 },
      },
    };

    const result = await controller.handleWebhook({ rawBody: Buffer.from(JSON.stringify(body)) } as never, body, undefined, mockRes);
    expect(result).toEqual({ status: 'ignored', reason: 'blocked_engine_signal' });
    expect(deviceConnection.ingestObdPlugStateChange).not.toHaveBeenCalled();
    expect(rpmWebhookCandidate.ingestRpmThresholdEvent).not.toHaveBeenCalled();
  });

  it('processes dimo.trigger RPM as rpm_candidate', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DIMO_WEBHOOK_SECRET;

    const vehicle = {
      id: 'veh-1',
      organizationId: 'org-1',
      hardwareType: 'LTE_R1',
      fuelType: 'PETROL',
    };
    const { controller, rpmWebhookCandidate } = makeController({
      prisma: {
        vehicle: { findFirst: jest.fn().mockResolvedValue(vehicle) },
      },
    });

    const body = {
      type: 'dimo.trigger',
      subject: 'did:erc721:137:0xabc:777',
      data: {
        metricName: 'vss.powertrainCombustionEngineSpeed',
        webhookName: 'High RPM Triger',
        signal: { name: 'powertrainCombustionEngineSpeed', value: 5200 },
      },
    };

    const result = await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(body)) } as never,
      body,
      undefined,
      mockRes,
    );

    expect(rpmWebhookCandidate.ingestRpmThresholdEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicle,
        tokenId: 777,
        observedValue: 5200,
      }),
    );
    expect(result).toMatchObject({ status: 'processed', type: 'rpm_candidate', outcome: 'created' });
  });

  it('processes RPM webhook with valueNumber only', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DIMO_WEBHOOK_SECRET;

    const vehicle = {
      id: 'veh-1',
      organizationId: 'org-1',
      hardwareType: 'LTE_R1',
      fuelType: 'PETROL',
    };
    const { controller, rpmWebhookCandidate } = makeController({
      prisma: {
        vehicle: { findFirst: jest.fn().mockResolvedValue(vehicle) },
      },
    });

    const body = {
      type: 'dimo.trigger',
      subject: 'did:erc721:137:0xabc:777',
      data: {
        metricName: 'vss.powertrainCombustionEngineSpeed',
        displayName: 'High RPM Trigger',
        valueNumber: 5120,
      },
    };

    const result = await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(body)) } as never,
      body,
      undefined,
      mockRes,
    );

    expect(rpmWebhookCandidate.ingestRpmThresholdEvent).toHaveBeenCalledWith(
      expect.objectContaining({ observedValue: 5120 }),
    );
    expect(result).toMatchObject({ status: 'processed', type: 'rpm_candidate' });
  });

  it('ignores OBD plug-in webhooks when plug-in trigger is disabled', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DIMO_WEBHOOK_SECRET;

    const vehicle = { id: 'veh-1', organizationId: 'org-1', hardwareType: 'LTE_R1', fuelType: 'PETROL' };
    const { controller, deviceConnection } = makeController({
      obdPlugInWebhookEnabled: false,
      prisma: {
        vehicle: { findFirst: jest.fn().mockResolvedValue(vehicle) },
      },
    });

    const body = {
      type: 'dimo.trigger',
      subject: 'did:erc721:137:0xabc:777',
      data: {
        metricName: 'vss.obdIsPluggedIn',
        displayName: 'OBD Device Plugged in',
        valueNumber: 1,
      },
    };

    const result = await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(body)) } as never,
      body,
      undefined,
      mockRes,
    );

    expect(result).toMatchObject({
      status: 'ignored',
      type: 'device_connection',
      reason: 'plug_in_webhook_disabled',
    });
    expect(deviceConnection.ingestObdPlugStateChange).not.toHaveBeenCalled();
  });

  it('processes unsigned dimo.trigger in production when verification token is configured', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN = 'synqdrive-prod-token';
    process.env.DIMO_WEBHOOK_SECRET = 'hmac-secret';

    const vehicle = { id: 'veh-1', organizationId: 'org-1', hardwareType: 'LTE_R1', fuelType: 'PETROL' };
    const { controller, deviceConnection } = makeController({
      verificationToken: 'synqdrive-prod-token',
      prisma: {
        vehicle: { findFirst: jest.fn().mockResolvedValue(vehicle) },
      },
    });

    const body = {
      type: 'dimo.trigger',
      subject: 'did:erc721:137:0xabc:777',
      data: {
        metricName: 'vss.obdIsPluggedIn',
        webhookName: 'OBD Device unplugged',
        signal: { name: 'obdIsPluggedIn', value: false },
      },
    };

    const result = await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(body)) } as never,
      body,
      undefined,
      mockRes,
    );

    expect(result).toMatchObject({ status: 'processed', type: 'device_connection' });
    expect(deviceConnection.ingestObdPlugStateChange).toHaveBeenCalled();
  });

  it('rejects trigger payloads in production when verification token is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN;
    process.env.DIMO_WEBHOOK_SECRET = 'hmac-secret';

    const { controller } = makeController({ verificationToken: '' });
    const body = {
      type: 'dimo.trigger',
      subject: 'did:erc721:137:0xabc:1',
      data: { signal: { name: 'obdIsPluggedIn', value: true } },
    };

    const result = await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(body)) } as never,
      body,
      undefined,
      mockRes,
    );

    expect(result).toEqual({ status: 'rejected', reason: 'verification_not_configured' });
  });
});
