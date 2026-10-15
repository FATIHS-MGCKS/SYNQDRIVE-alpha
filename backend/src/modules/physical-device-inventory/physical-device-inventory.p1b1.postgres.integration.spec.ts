/**
 * Physical Device Inventory P1B.1 — identity verification + install (PostgreSQL).
 */
import {
  BusinessType,
  PhysicalDeviceModelCode,
  PrismaClient,
  VehicleProviderConsentGrantType,
  VehicleProviderConsentStatus,
  VehicleRegistryLifecycle,
  VehicleStatus,
} from '@prisma/client';
import { VO_CONNECTION_IDENTITY_CONTRACT_VERSION } from '@modules/vehicle-onboarding/connection-identity/vehicle-connection-identity.contract';
import { VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION } from '@modules/vehicle-onboarding/connection-identity/source-link-connection-identity.metadata';
import { randomUUID } from 'node:crypto';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PhysicalDeviceIdentityAttestationKind } from './dto/verify-physical-device-identity.dto';
import {
  PHYSICAL_DEVICE_ALREADY_INSTALLED,
  PHYSICAL_DEVICE_IDEMPOTENCY_PAYLOAD_MISMATCH,
  PHYSICAL_DEVICE_IDENTITY_EVIDENCE_INSUFFICIENT,
  PHYSICAL_DEVICE_P1B1_WRITES_DISABLED,
  PHYSICAL_DEVICE_VEHICLE_NOT_ELIGIBLE,
  PHYSICAL_DEVICE_VEHICLE_ORG_MISMATCH,
} from './physical-device-inventory.errors';

const LIVE =
  process.env.PHYSICAL_DEVICE_INVENTORY_POSTGRES_INTEGRATION === '1' && !!process.env.DATABASE_URL;
const REQUIRED = process.env.PHYSICAL_DEVICE_INVENTORY_POSTGRES_REQUIRED === '1';

const describeLive = LIVE ? describe : describe.skip;

describeLive('PhysicalDeviceInventory P1B.1 (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: PhysicalDeviceInventoryService;
  const priorFlag = process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED;

  beforeAll(() => {
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = '1';
    prisma = new PrismaClient();
    service = new PhysicalDeviceInventoryService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = priorFlag;
    await prisma.$disconnect();
  });

  async function createOrg() {
    const id = randomUUID();
    await prisma.organization.create({
      data: {
        id,
        companyName: `PDI P1B1 ${id.slice(0, 8)}`,
        businessType: BusinessType.RENTAL,
      },
    });
    return id;
  }

  async function createActiveVehicle(orgId: string, lifecycle: VehicleRegistryLifecycle = 'ACTIVE') {
    const id = randomUUID();
    await prisma.vehicle.create({
      data: {
        id,
        organizationId: orgId,
        make: 'Test',
        model: 'Vehicle',
        year: 2024,
        fuelType: 'GASOLINE',
        status: VehicleStatus.AVAILABLE,
        registryLifecycle: lifecycle,
      },
    });
    return id;
  }

  async function intakeR1(serial: string, orgId?: string) {
    return service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: serial,
        warehouseLocation: 'WH-P1B1',
        ownerOrganizationId: orgId ?? null,
      },
      'master-admin',
    );
  }

  async function attachActiveR1DimoProviderLink(
    orgId: string,
    vehicleId: string,
    serial: string,
    options?: {
      inactive?: boolean;
      identitySerial?: string;
      verifiedModality?: string;
      physicalDeviceReference?: string;
    },
  ) {
    const dimoId = randomUUID();
    const linkId = randomUUID();
    const consentId = randomUUID();
    const externalId = `ext-${randomUUID().slice(0, 8)}`;
    await prisma.dimoVehicle.create({
      data: {
        id: dimoId,
        externalId,
        rawJson: { aftermarketDevice: { serial } },
      },
    });
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { dimoVehicleId: dimoId },
    });
    await prisma.vehicleProviderConsent.create({
      data: {
        id: consentId,
        vehicleId,
        organizationId: orgId,
        provider: 'DIMO',
        grantType: VehicleProviderConsentGrantType.DIMO_DIRECT,
        status: VehicleProviderConsentStatus.ACTIVE,
        scopes: [],
      },
    });
    await prisma.vehicleDataSourceLink.create({
      data: {
        id: linkId,
        vehicleId,
        provider: 'DIMO',
        sourceType: 'DIMO',
        dimoVehicleId: dimoId,
        consentId,
        isActive: !options?.inactive,
        deactivatedAt: options?.inactive ? new Date() : null,
        metadata: {
          connectionIdentity: {
            version: VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION,
            contractVersion: VO_CONNECTION_IDENTITY_CONTRACT_VERSION,
            providerSourceLinkId: linkId,
            preActivationProviderSourceRefId: 'pdi-p1b1-test',
            provider: 'DIMO',
            providerVehicleReference: externalId,
            sourceMirrorId: dimoId,
            proposedModality: options?.verifiedModality ?? 'HARDWARE_DEVICE',
            verifiedModality: options?.verifiedModality ?? 'HARDWARE_DEVICE',
            modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE',
            physicalDeviceReference:
              options?.physicalDeviceReference ?? options?.identitySerial ?? serial,
            verificationEvidence: [],
            verifiedAt: new Date().toISOString(),
            organizationId: orgId,
            vehicleId,
          },
        },
      },
    });
    return { dimoId, linkId };
  }

  it('rejects writes when P1B1 flag disabled', async () => {
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = '0';
    const device = await intakeR1(`R1-FLAG-${randomUUID().slice(0, 8)}`);
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    await expect(
      service.verifyIdentity(
        device.id,
        {
          attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
          providerReconciliationVehicleId: vehicle,
          reviewerUserId: 'master-admin',
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({
      response: { code: PHYSICAL_DEVICE_P1B1_WRITES_DISABLED },
    });
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = '1';
  });

  it('verifies R1 identity with DIMO mirror serial alignment and installs on ACTIVE vehicle', async () => {
    const serial = `R1-P1B1-${randomUUID().slice(0, 8)}`;
    const org = await createOrg();
    const vehicleId = await createActiveVehicle(org);
    await attachActiveR1DimoProviderLink(org, vehicleId, serial);

    const device = await intakeR1(serial, org);
    const verified = await service.verifyIdentity(
      device.id,
      {
        attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
        providerReconciliationVehicleId: vehicleId,
        reviewerUserId: 'master-admin',
      },
      'master-admin',
    );
    expect(verified.identityStatus).toBe('VERIFIED');
    expect(verified.installEligible).toBe(true);

    const outboxBefore = await prisma.vehicleRegistryLifecycleOutbox.count();
    const installed = await service.installOnVehicle(
      device.id,
      { vehicleId, installConfirmation: true, idempotencyKey: `install-${randomUUID()}` },
      'master-admin',
    );
    const outboxAfter = await prisma.vehicleRegistryLifecycleOutbox.count();
    expect(outboxAfter).toBe(outboxBefore);
    expect(installed.status).toBe('INSTALLED');
    expect(installed.currentVehicleId).toBe(vehicleId);

    const summary = await service.getStockSummary();
    expect(summary.byStatus.INSTALLED).toBeGreaterThanOrEqual(1);
  });

  it('fails Smart5 verification fail-closed', async () => {
    const device = await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.SMART5,
        serialNumber: 'SMART5-UNIT-TEST-001',
        warehouseLocation: 'WH-P1B1',
      },
      'master-admin',
    );
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    await expect(
      service.verifyIdentity(
        device.id,
        {
          attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
          providerReconciliationVehicleId: vehicle,
          reviewerUserId: 'master-admin',
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({
      response: { code: PHYSICAL_DEVICE_IDENTITY_EVIDENCE_INSUFFICIENT },
    });
  });

  it('blocks duplicate install on the same device', async () => {
    const serial = `R1-DUP-${randomUUID().slice(0, 8)}`;
    const org = await createOrg();
    const activeVehicle = await createActiveVehicle(org);
    await attachActiveR1DimoProviderLink(org, activeVehicle, serial);

    const device = await intakeR1(serial, org);
    await service.verifyIdentity(
      device.id,
      {
        attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
        providerReconciliationVehicleId: activeVehicle,
        reviewerUserId: 'master-admin',
      },
      'master-admin',
    );

    await service.installOnVehicle(
      device.id,
      { vehicleId: activeVehicle, installConfirmation: true },
      'master-admin',
    );

    await expect(
      service.installOnVehicle(
        device.id,
        { vehicleId: activeVehicle, installConfirmation: true },
        'master-admin',
      ),
    ).rejects.toMatchObject({
      response: { code: PHYSICAL_DEVICE_ALREADY_INSTALLED },
    });
  });

  it('blocks install on OFFBOARDED registry vehicle', async () => {
    const serial = `R1-OFF-${randomUUID().slice(0, 8)}`;
    const org = await createOrg();
    const activeVehicle = await createActiveVehicle(org);
    const offboardedVehicle = await createActiveVehicle(org, VehicleRegistryLifecycle.OFFBOARDED);
    await attachActiveR1DimoProviderLink(org, activeVehicle, serial);

    const device = await intakeR1(serial, org);
    await service.verifyIdentity(
      device.id,
      {
        attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
        providerReconciliationVehicleId: activeVehicle,
        reviewerUserId: 'master-admin',
      },
      'master-admin',
    );

    await expect(
      service.installOnVehicle(
        device.id,
        { vehicleId: offboardedVehicle, installConfirmation: true },
        'master-admin',
      ),
    ).rejects.toMatchObject({
      response: { code: PHYSICAL_DEVICE_VEHICLE_NOT_ELIGIBLE },
    });
  });

  it('enforces tenant isolation on install', async () => {
    const serial = `R1-TENANT-${randomUUID().slice(0, 8)}`;
    const orgA = await createOrg();
    const orgB = await createOrg();
    const vehicleA = await createActiveVehicle(orgA);
    const vehicleB = await createActiveVehicle(orgB);
    await attachActiveR1DimoProviderLink(orgA, vehicleA, serial);

    const device = await intakeR1(serial, orgA);
    await service.verifyIdentity(
      device.id,
      {
        attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
        providerReconciliationVehicleId: vehicleA,
        reviewerUserId: 'master-admin',
      },
      'master-admin',
    );

    await expect(
      service.installOnVehicle(
        device.id,
        { vehicleId: vehicleB, installConfirmation: true },
        'master-admin',
      ),
    ).rejects.toMatchObject({
      response: { code: PHYSICAL_DEVICE_VEHICLE_ORG_MISMATCH },
    });
  });

  it('rejects install idempotency payload mismatch', async () => {
    const serial = `R1-IDEM-${randomUUID().slice(0, 8)}`;
    const org = await createOrg();
    const v1 = await createActiveVehicle(org);
    const v2 = await createActiveVehicle(org);
    await attachActiveR1DimoProviderLink(org, v1, serial);

    const device = await intakeR1(serial, org);
    await service.verifyIdentity(
      device.id,
      {
        attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
        providerReconciliationVehicleId: v1,
        reviewerUserId: 'master-admin',
      },
      'master-admin',
    );

    const key = `idem-${randomUUID()}`;
    await service.installOnVehicle(
      device.id,
      { vehicleId: v1, installConfirmation: true, idempotencyKey: key },
      'master-admin',
    );

    await expect(
      service.installOnVehicle(
        device.id,
        { vehicleId: v2, installConfirmation: true, idempotencyKey: key },
        'master-admin',
      ),
    ).rejects.toMatchObject({
      response: { code: PHYSICAL_DEVICE_IDEMPOTENCY_PAYLOAD_MISMATCH },
    });
  });

  it('rejects verification when active DIMO provider link is missing', async () => {
    const serial = `R1-NOLINK-${randomUUID().slice(0, 8)}`;
    const org = await createOrg();
    const vehicleId = await createActiveVehicle(org);
    const dimoId = randomUUID();
    await prisma.dimoVehicle.create({
      data: {
        id: dimoId,
        externalId: `ext-${randomUUID().slice(0, 8)}`,
        rawJson: { aftermarketDevice: { serial } },
      },
    });
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { dimoVehicleId: dimoId },
    });
    const device = await intakeR1(serial, org);
    await expect(
      service.verifyIdentity(
        device.id,
        {
          attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
          providerReconciliationVehicleId: vehicleId,
          reviewerUserId: 'master-admin',
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({
      response: {
        code: PHYSICAL_DEVICE_IDENTITY_EVIDENCE_INSUFFICIENT,
        reasonCode: 'PROVIDER_DIMO_LINK_MISSING',
      },
    });
  });

  it('rejects verification when provider link is inactive', async () => {
    const serial = `R1-INACTIVE-${randomUUID().slice(0, 8)}`;
    const org = await createOrg();
    const vehicleId = await createActiveVehicle(org);
    await attachActiveR1DimoProviderLink(org, vehicleId, serial, { inactive: true });
    const device = await intakeR1(serial, org);
    await expect(
      service.verifyIdentity(
        device.id,
        {
          attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
          providerReconciliationVehicleId: vehicleId,
          reviewerUserId: 'master-admin',
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({
      response: {
        code: PHYSICAL_DEVICE_IDENTITY_EVIDENCE_INSUFFICIENT,
        reasonCode: 'PROVIDER_DIMO_LINK_INACTIVE_OR_SUPERSEDED',
      },
    });
  });

  it('rejects verification when connection identity serial conflicts', async () => {
    const serial = `R1-CONFLICT-${randomUUID().slice(0, 8)}`;
    const org = await createOrg();
    const vehicleId = await createActiveVehicle(org);
    await attachActiveR1DimoProviderLink(org, vehicleId, serial, {
      identitySerial: 'R1-OTHER-SERIAL',
    });
    const device = await intakeR1(serial, org);
    await expect(
      service.verifyIdentity(
        device.id,
        {
          attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
          providerReconciliationVehicleId: vehicleId,
          reviewerUserId: 'master-admin',
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({
      response: {
        code: PHYSICAL_DEVICE_IDENTITY_EVIDENCE_INSUFFICIENT,
        reasonCode: 'PROVIDER_CONNECTION_IDENTITY_SERIAL_MISMATCH',
      },
    });
  });

  it('rejects R1 verification when mirror has SOFTWARE_INTEGRATION connection identity', async () => {
    const serial = `R1-SW-${randomUUID().slice(0, 8)}`;
    const org = await createOrg();
    const vehicleId = await createActiveVehicle(org);
    await attachActiveR1DimoProviderLink(org, vehicleId, serial, {
      verifiedModality: 'SOFTWARE_INTEGRATION',
      physicalDeviceReference: 'NOT_APPLICABLE',
    });
    const device = await intakeR1(serial, org);
    await expect(
      service.verifyIdentity(
        device.id,
        {
          attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
          providerReconciliationVehicleId: vehicleId,
          reviewerUserId: 'master-admin',
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({
      response: {
        code: PHYSICAL_DEVICE_IDENTITY_EVIDENCE_INSUFFICIENT,
        reasonCode: 'PROVIDER_CONNECTION_IDENTITY_MODALITY_NOT_HARDWARE',
      },
    });
  });

  it('replays and conflicts identity verification idempotency keys', async () => {
    const serial = `R1-VIDEM-${randomUUID().slice(0, 8)}`;
    const org = await createOrg();
    const vehicleId = await createActiveVehicle(org);
    await attachActiveR1DimoProviderLink(org, vehicleId, serial);
    const device = await intakeR1(serial, org);
    const key = `verify-${randomUUID()}`;
    const base = {
      attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
      providerReconciliationVehicleId: vehicleId,
      reviewerUserId: 'master-admin',
      idempotencyKey: key,
    };
    const first = await service.verifyIdentity(
      device.id,
      { ...base, reviewerNotes: 'note-a' },
      'master-admin',
    );
    const replay = await service.verifyIdentity(
      device.id,
      { ...base, reviewerNotes: 'note-a' },
      'master-admin',
    );
    expect(replay.identityStatus).toBe('VERIFIED');
    expect(replay.id).toBe(first.id);

    const device2 = await intakeR1(`R1-VIDEM2-${randomUUID().slice(0, 8)}`, org);
    await expect(
      service.verifyIdentity(
        device2.id,
        { ...base, reviewerNotes: 'note-b' },
        'master-admin',
      ),
    ).rejects.toMatchObject({
      response: { code: PHYSICAL_DEVICE_IDEMPOTENCY_PAYLOAD_MISMATCH },
    });
  });

  it('handles concurrent identity verification with the same idempotency key', async () => {
    const serial = `R1-RACE-${randomUUID().slice(0, 8)}`;
    const org = await createOrg();
    const vehicleId = await createActiveVehicle(org);
    await attachActiveR1DimoProviderLink(org, vehicleId, serial);
    const device = await intakeR1(serial, org);
    const key = `verify-race-${randomUUID()}`;
    const payload = {
      attestationKind: PhysicalDeviceIdentityAttestationKind.PROVIDER_DIMO_SERIAL_RECONCILIATION,
      providerReconciliationVehicleId: vehicleId,
      reviewerUserId: 'master-admin',
      idempotencyKey: key,
      reviewerNotes: 'race',
    };
    const results = await Promise.allSettled([
      service.verifyIdentity(device.id, payload, 'master-admin'),
      service.verifyIdentity(device.id, payload, 'master-admin'),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(fulfilled.length + rejected.length).toBe(2);
    const auditRows = await prisma.physicalDeviceInventoryAuditEvent.count({
      where: {
        physicalDeviceId: device.id,
        eventKind: 'IDENTITY_VERIFICATION',
        idempotencyKey: key,
      },
    });
    expect(auditRows).toBe(1);
  });
});

if (REQUIRED && !LIVE) {
  throw new Error('PHYSICAL_DEVICE_INVENTORY_POSTGRES_REQUIRED but integration env not set');
}
