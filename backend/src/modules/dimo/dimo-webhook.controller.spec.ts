import { ServiceUnavailableException } from '@nestjs/common';
import { DeviceConnectionWebhookProcessingStatus } from '@prisma/client';
import { DimoWebhookController } from './dimo-webhook.controller';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';

function makeController(overrides?: {
  prisma?: Partial<PrismaServiceMock>;
  deviceConnection?: Partial<DeviceConnectionMock>;
  deviceConnectionInbox?: Partial<DeviceConnectionInboxMock>;
  rpmWebhookCandidate?: Partial<RpmWebhookMock>;
  snapshotWakeIntake?: Partial<SnapshotWakeIntakeMock>;
  verificationToken?: string;
  dtcSnapshotApply?: DtcSnapshotApplyMock;
}) {
  const prisma: PrismaServiceMock = {
    vehicle: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    vehicleLatestState: { updateMany: jest.fn() },
    vehicleDtcEvent: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides?.prisma,
  };
  const deviceConnection: DeviceConnectionMock = {
    ingestObdPlugStateChange: jest.fn().mockResolvedValue({ outcome: 'created', eventId: 'e1' }),
    ...overrides?.deviceConnection,
  };
  const deviceConnectionInbox: DeviceConnectionInboxMock = {
    intakeDeviceConnectionWebhook: jest.fn().mockResolvedValue({
      outcome: 'queued',
      inboxId: 'inbox-1',
      processingStatus: DeviceConnectionWebhookProcessingStatus.RECEIVED,
      eventId: 'e1',
    }),
    ...overrides?.deviceConnectionInbox,
  };
  const rpmWebhookCandidate: RpmWebhookMock = {
    ingestRpmThresholdEvent: jest.fn().mockResolvedValue({
      outcome: 'created',
      candidateId: 'rpm-1',
      status: 'CONTEXT_ENRICHED',
    }),
    ...overrides?.rpmWebhookCandidate,
  };
  const snapshotWakeIntake: SnapshotWakeIntakeMock = {
    handleProviderWake: jest.fn().mockResolvedValue({ outcome: 'ENQUEUED' }),
    ...overrides?.snapshotWakeIntake,
  };
  const dtcService = { upsertDtc: jest.fn(), clearDtc: jest.fn() };
  const dtcSnapshotApply: DtcSnapshotApplyMock = {
    applyBuiltProposal: jest.fn().mockResolvedValue({ decision: { outcome: 'APPLY_WEBHOOK_PARTIAL' } }),
    recordRejectedFetchMetadata: jest.fn().mockResolvedValue(undefined),
    ...overrides?.dtcSnapshotApply,
  };
  const dimoConf = {
    webhookVerificationToken: overrides?.verificationToken ?? process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN ?? '',
  };
  const controller = new DimoWebhookController(
    dimoConf as never,
    prisma as never,
    dtcService as never,
    deviceConnection as never,
    deviceConnectionInbox as never,
    rpmWebhookCandidate as never,
    snapshotWakeIntake as never,
    (overrides?.dtcSnapshotApply !== undefined ? dtcSnapshotApply : undefined) as never,
  );
  return {
    controller,
    prisma,
    deviceConnection,
    deviceConnectionInbox,
    rpmWebhookCandidate,
    snapshotWakeIntake,
    dtcService,
    dtcSnapshotApply,
  };
}

type PrismaServiceMock = {
  vehicle: { findFirst: jest.Mock; findUnique?: jest.Mock };
  vehicleLatestState: { updateMany: jest.Mock };
  vehicleDtcEvent?: { findMany: jest.Mock };
  vehicleDataSourceLink?: { findFirst: jest.Mock };
};

type DtcSnapshotApplyMock = {
  applyBuiltProposal: jest.Mock;
  recordRejectedFetchMetadata: jest.Mock;
};

type DeviceConnectionMock = {
  ingestObdPlugStateChange: jest.Mock;
};

type DeviceConnectionInboxMock = {
  intakeDeviceConnectionWebhook: jest.Mock;
};

type RpmWebhookMock = {
  ingestRpmThresholdEvent: jest.Mock;
};

type SnapshotWakeIntakeMock = {
  handleProviderWake: jest.Mock;
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

describe('DimoWebhookController — snapshot wake intake', () => {
  const originalSecret = process.env.DIMO_WEBHOOK_SECRET;
  const originalVerificationToken = process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.DIMO_WEBHOOK_SECRET = originalSecret;
    process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN = originalVerificationToken;
    process.env.NODE_ENV = originalNodeEnv;
  });

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    delete process.env.DIMO_WEBHOOK_SECRET;
  });

  it('forwards speed wake to intake and surfaces wakeOutcome', async () => {
    const handleProviderWake = jest.fn().mockResolvedValue({ outcome: 'ENQUEUED' });
    const { controller } = makeController({
      snapshotWakeIntake: { handleProviderWake },
      prisma: {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'veh-1',
            organizationId: 'org-1',
            hardwareType: 'LTE_R1',
            fuelType: 'PETROL',
          }),
        },
      },
    });

    const body = {
      type: 'dimo.trigger',
      subject: 'did:erc721:137:0xabc:777',
      data: {
        signal: { name: 'speed', value: 12, timestamp: '2026-09-07T14:00:20.000Z' },
      },
    };

    const result = await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(body)) } as never,
      body,
      undefined,
      mockRes,
    );

    expect(handleProviderWake).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 777,
        signalName: 'speed',
        value: 12,
        timestamp: '2026-09-07T14:00:20.000Z',
      }),
    );
    expect(result).toMatchObject({ status: 'processed', type: 'speed', wakeOutcome: 'ENQUEUED' });
  });

  it('forwards ignition ON wake to intake', async () => {
    const handleProviderWake = jest.fn().mockResolvedValue({ outcome: 'COALESCED' });
    const { controller } = makeController({
      snapshotWakeIntake: { handleProviderWake },
      prisma: {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'veh-1',
            organizationId: 'org-1',
            hardwareType: 'LTE_R1',
            fuelType: 'PETROL',
          }),
        },
      },
    });

    const body = {
      type: 'dimo.trigger',
      subject: 'did:erc721:137:0xabc:777',
      data: {
        signal: { name: 'isIgnitionOn', value: true, timestamp: '2026-09-07T14:00:20.000Z' },
      },
    };

    const result = await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(body)) } as never,
      body,
      undefined,
      mockRes,
    );

    expect(handleProviderWake).toHaveBeenCalledWith(
      expect.objectContaining({ tokenId: 777, signalName: 'isIgnitionOn', value: true }),
    );
    expect(result).toMatchObject({ type: 'ignition', wakeOutcome: 'COALESCED' });
  });

  it('does not call snapshot wake intake for unrelated signals', async () => {
    const handleProviderWake = jest.fn();
    const { controller, rpmWebhookCandidate } = makeController({
      snapshotWakeIntake: { handleProviderWake },
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
      subject: 'did:erc721:137:0xabc:777',
      data: {
        metricName: 'vss.powertrainCombustionEngineSpeed',
        signal: { name: 'powertrainCombustionEngineSpeed', value: 5200 },
      },
    };

    await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(body)) } as never,
      body,
      undefined,
      mockRes,
    );

    expect(handleProviderWake).not.toHaveBeenCalled();
    expect(rpmWebhookCandidate.ingestRpmThresholdEvent).toHaveBeenCalled();
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
    const { controller, prisma, deviceConnectionInbox } = makeController({
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

    expect(prisma.vehicle.findFirst).not.toHaveBeenCalled();
    expect(deviceConnectionInbox.intakeDeviceConnectionWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
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

  it('processes unsigned dimo.trigger in production when verification token is configured', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN = 'synqdrive-prod-token';
    process.env.DIMO_WEBHOOK_SECRET = 'hmac-secret';

    const vehicle = { id: 'veh-1', organizationId: 'org-1', hardwareType: 'LTE_R1', fuelType: 'PETROL' };
    const { controller, deviceConnectionInbox } = makeController({
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
    expect(deviceConnectionInbox.intakeDeviceConnectionWebhook).toHaveBeenCalled();
  });

  it('rejects invalid HMAC signature without persisting inbox row', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN = 'synqdrive-prod-token';
    process.env.DIMO_WEBHOOK_SECRET = 'hmac-secret';

    const { controller, deviceConnectionInbox } = makeController({
      verificationToken: 'synqdrive-prod-token',
    });

    const body = {
      type: 'dimo.trigger',
      subject: 'did:erc721:137:0xabc:777',
      data: { signal: { name: 'obdIsPluggedIn', value: false } },
    };

    const result = await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(body)) } as never,
      body,
      'invalid-signature',
      mockRes,
    );

    expect(result).toEqual({ status: 'rejected', reason: 'invalid_signature' });
    expect(deviceConnectionInbox.intakeDeviceConnectionWebhook).not.toHaveBeenCalled();
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

describe('DimoWebhookController — DTC obdDTCList cohort admission', () => {
  const VID = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
  const originalEnv = {
    node: process.env.NODE_ENV,
    secret: process.env.DIMO_WEBHOOK_SECRET,
    dtc01a: process.env.DTC_01A_SAFETY_FOUNDATION_ENABLED,
    cohort: process.env.DTC_01F_COHORT_GATE_ENABLED,
    allowlist: process.env.DTC_01F_COHORT_VEHICLE_ALLOWLIST,
  };

  const dtcBody = {
    type: 'dimo.trigger',
    subject: 'did:erc721:137:0xabc:777',
    data: {
      signal: { name: 'obdDTCList', value: 'P0301', timestamp: '2026-10-15T12:00:00.000Z' },
    },
  };

  afterEach(() => {
    process.env.NODE_ENV = originalEnv.node;
    process.env.DIMO_WEBHOOK_SECRET = originalEnv.secret;
    process.env.DTC_01A_SAFETY_FOUNDATION_ENABLED = originalEnv.dtc01a;
    process.env.DTC_01F_COHORT_GATE_ENABLED = originalEnv.cohort;
    process.env.DTC_01F_COHORT_VEHICLE_ALLOWLIST = originalEnv.allowlist;
  });

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    delete process.env.DIMO_WEBHOOK_SECRET;
    delete process.env.DTC_01A_SAFETY_FOUNDATION_ENABLED;
    delete process.env.DTC_01F_COHORT_GATE_ENABLED;
    delete process.env.DTC_01F_COHORT_VEHICLE_ALLOWLIST;
  });

  function vehicleRow(lifecycle = 'ACTIVE') {
    return {
      id: VID,
      organizationId: 'org-1',
      hardwareType: 'LTE_R1',
      fuelType: 'PETROL',
      registryLifecycle: lifecycle,
    };
  }

  it('global flag off: legacy upsert for ACTIVE vehicle', async () => {
    const row = vehicleRow('ACTIVE');
    const { controller, dtcService, prisma, dtcSnapshotApply } = makeController({
      prisma: {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue(row),
          findUnique: jest.fn().mockResolvedValue({
            organizationId: row.organizationId,
            registryLifecycle: row.registryLifecycle,
          }),
        },
        vehicleDtcEvent: { findMany: jest.fn().mockResolvedValue([]) },
      },
    });

    await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(dtcBody)) } as never,
      dtcBody,
      undefined,
      mockRes,
    );

    expect(dtcService.upsertDtc).toHaveBeenCalled();
    expect(prisma.vehicleLatestState.updateMany).toHaveBeenCalled();
    expect(dtcSnapshotApply.applyBuiltProposal).not.toHaveBeenCalled();
  });

  it('global flag off: skips OFFBOARDED without legacy mutations', async () => {
    const row = vehicleRow('OFFBOARDED');
    const { controller, dtcService, prisma } = makeController({
      prisma: {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue(row),
          findUnique: jest.fn().mockResolvedValue({
            organizationId: row.organizationId,
            registryLifecycle: row.registryLifecycle,
          }),
        },
      },
    });

    await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(dtcBody)) } as never,
      dtcBody,
      undefined,
      mockRes,
    );

    expect(dtcService.upsertDtc).not.toHaveBeenCalled();
    expect(prisma.vehicleLatestState.updateMany).not.toHaveBeenCalled();
  });

  it('cohort on: allowlisted vehicle uses safety apply path', async () => {
    process.env.DTC_01A_SAFETY_FOUNDATION_ENABLED = 'true';
    process.env.DTC_01F_COHORT_GATE_ENABLED = 'true';
    process.env.DTC_01F_COHORT_VEHICLE_ALLOWLIST = VID;

    const row = vehicleRow('ACTIVE');
    const applyBuiltProposal = jest.fn().mockResolvedValue({ decision: { outcome: 'APPLY_WEBHOOK_PARTIAL' } });
    const { controller, dtcService, dtcSnapshotApply } = makeController({
      dtcSnapshotApply: { applyBuiltProposal, recordRejectedFetchMetadata: jest.fn() },
      prisma: {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue(row),
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({
              organizationId: row.organizationId,
              registryLifecycle: row.registryLifecycle,
            })
            .mockResolvedValueOnce({
              dimoVehicleId: 'dimo-1',
              dimoVehicle: { tokenId: 777 },
            }),
        },
        vehicleDataSourceLink: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'link-1',
            isActive: true,
            dimoVehicleId: 'dimo-1',
          }),
        },
      },
    });

    await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(dtcBody)) } as never,
      dtcBody,
      undefined,
      mockRes,
    );

    expect(applyBuiltProposal).toHaveBeenCalled();
    expect(dtcService.upsertDtc).not.toHaveBeenCalled();
  });

  it('cohort on: non-allowlisted skips DTC mutation (no legacy fallback)', async () => {
    process.env.DTC_01A_SAFETY_FOUNDATION_ENABLED = 'true';
    process.env.DTC_01F_COHORT_GATE_ENABLED = 'true';
    process.env.DTC_01F_COHORT_VEHICLE_ALLOWLIST = VID;

    const otherId = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
    const row = { ...vehicleRow('ACTIVE'), id: otherId };
    const { controller, dtcService, dtcSnapshotApply } = makeController({
      dtcSnapshotApply: {
        applyBuiltProposal: jest.fn(),
        recordRejectedFetchMetadata: jest.fn(),
      },
      prisma: {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue(row),
          findUnique: jest.fn().mockResolvedValue({
            organizationId: row.organizationId,
            registryLifecycle: row.registryLifecycle,
          }),
        },
      },
    });

    await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(dtcBody)) } as never,
      dtcBody,
      undefined,
      mockRes,
    );

    expect(dtcService.upsertDtc).not.toHaveBeenCalled();
    expect(dtcSnapshotApply.applyBuiltProposal).not.toHaveBeenCalled();
  });

  it('invalid cohort config skips webhook DTC mutations', async () => {
    process.env.DTC_01A_SAFETY_FOUNDATION_ENABLED = 'true';
    process.env.DTC_01F_COHORT_GATE_ENABLED = 'true';
    process.env.DTC_01F_COHORT_VEHICLE_ALLOWLIST = 'not-a-uuid';

    const row = vehicleRow('ACTIVE');
    const { controller, dtcService, dtcSnapshotApply } = makeController({
      dtcSnapshotApply: {
        applyBuiltProposal: jest.fn(),
        recordRejectedFetchMetadata: jest.fn(),
      },
      prisma: {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue(row),
          findUnique: jest.fn().mockResolvedValue({
            organizationId: row.organizationId,
            registryLifecycle: row.registryLifecycle,
          }),
        },
      },
    });

    await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(dtcBody)) } as never,
      dtcBody,
      undefined,
      mockRes,
    );

    expect(dtcService.upsertDtc).not.toHaveBeenCalled();
    expect(dtcSnapshotApply.applyBuiltProposal).not.toHaveBeenCalled();
  });

  it('fail-closed when vehicle row missing on DTC handle', async () => {
    const row = vehicleRow('ACTIVE');
    const { controller, dtcService } = makeController({
      prisma: {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue(row),
          findUnique: jest.fn().mockResolvedValue(null),
        },
      },
    });

    await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(dtcBody)) } as never,
      dtcBody,
      undefined,
      mockRes,
    );

    expect(dtcService.upsertDtc).not.toHaveBeenCalled();
  });

  it('safety path records rejected metadata for stale/missing webhook timestamp', async () => {
    process.env.DTC_01A_SAFETY_FOUNDATION_ENABLED = 'true';

    const row = vehicleRow('ACTIVE');
    const staleBody = {
      ...dtcBody,
      data: { signal: { name: 'obdDTCList', value: 'P0301', timestamp: null } },
    };
    const recordRejectedFetchMetadata = jest.fn().mockResolvedValue(undefined);
    const { controller, dtcService } = makeController({
      dtcSnapshotApply: {
        applyBuiltProposal: jest.fn(),
        recordRejectedFetchMetadata,
      },
      prisma: {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue(row),
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({
              organizationId: row.organizationId,
              registryLifecycle: row.registryLifecycle,
            })
            .mockResolvedValueOnce({
              dimoVehicleId: 'dimo-1',
              dimoVehicle: { tokenId: 777 },
            }),
        },
        vehicleDataSourceLink: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'link-1',
            isActive: true,
            dimoVehicleId: 'dimo-1',
          }),
        },
      },
    });

    await controller.handleWebhook(
      { rawBody: Buffer.from(JSON.stringify(staleBody)) } as never,
      staleBody,
      undefined,
      mockRes,
    );

    expect(dtcService.upsertDtc).not.toHaveBeenCalled();
    expect(recordRejectedFetchMetadata).toHaveBeenCalled();
  });
});
