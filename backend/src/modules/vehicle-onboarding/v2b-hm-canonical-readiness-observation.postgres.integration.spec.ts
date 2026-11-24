/**
 * V2B-PR7 — HM canonical readiness observation (non-mutating).
 * Gate: `V2B_HM_CANONICAL_READINESS_OBSERVATION_PG=1`
 */
import {
  BusinessType,
  FuelType,
  OrganizationStatus,
  PrismaClient,
  ProductSlug,
  VehicleRegistryLifecycle,
  DocumentExtractionStatus,
  DocumentExtractionType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { BatteryReferenceCapacitySource } from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import { HmOnlyCanonicalReadinessObservationService } from './hm-only-canonical/hm-only-canonical-readiness-observation.service';
import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import {
  assertHmObservationFingerprintsEqual,
  captureHmObservationDbFingerprint,
} from './testing/v2b-hm-observation-db-fingerprint';
import { hmOnlyCanonicalRegistrationIdempotencyKey } from './hm-only-canonical/hm-only-canonical-registration.types';
import {
  assertHmPreRegistrationSnapshotUnchanged,
  buildHmObservationEvaluationSnapshot,
} from './hm-only-canonical/hm-only-canonical-observation-snapshot';
import {
  HM_OBSERVATION_PRISMA_ISOLATION,
  runHmObservationInReadOnlyTransaction,
} from './hm-only-canonical/hm-only-canonical-observation-readonly-tx';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { createHmOnlyCanonicalPgHarness } from './testing/v2b-hm-only-canonical-pg.harness';

const run = process.env.V2B_HM_CANONICAL_READINESS_OBSERVATION_PG === '1';

async function createOrg(
  prisma: PrismaClient,
  opts?: { withRental?: boolean; status?: OrganizationStatus },
) {
  const id = randomUUID();
  await prisma.organization.create({
    data: {
      id,
      companyName: `PR7 ${id.slice(0, 8)}`,
      businessType: BusinessType.RENTAL,
      status: opts?.status ?? OrganizationStatus.ACTIVE,
    },
  });
  if (opts?.withRental !== false) {
    await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  }
  return id;
}

async function createApprovedHmMirror(
  prisma: PrismaClient,
  orgId: string,
  opts?: {
    vin?: string;
    clearanceStatus?: string;
    sourceMode?: string;
    registrationState?: string;
    organizationId?: string;
    staleMirror?: boolean;
  },
) {
  const hmId = randomUUID();
  const resolvedVin = opts?.vin ?? `WBA${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const mirrorOrg = opts?.organizationId ?? orgId;
  await prisma.highMobilityVehicle.create({
    data: {
      id: hmId,
      organizationId: mirrorOrg,
      vin: resolvedVin,
      brand: 'BMW',
      packageType: 'HEALTH',
      sourceMode: (opts?.sourceMode ?? 'HM_ONLY') as 'HM_ONLY',
      clearanceStatus: (opts?.clearanceStatus ?? 'APPROVED') as 'APPROVED',
      hmVehicleReference: `hm-ref-${hmId.slice(0, 8)}`,
      registrationState: (opts?.registrationState ?? 'NOT_REGISTERED') as 'NOT_REGISTERED',
    },
  });
  if (opts?.staleMirror) {
    const stale = new Date('2020-01-01T00:00:00.000Z');
    await prisma.$executeRaw`
      UPDATE high_mobility_vehicles SET updated_at = ${stale}, created_at = ${stale} WHERE id = ${hmId}
    `;
  }
  return { hmId, vin: resolvedVin };
}

async function createOnboardingBatteryDocument(prisma: PrismaClient, orgId: string, capacityKwh: number) {
  const docId = randomUUID();
  await prisma.vehicleDocumentExtraction.create({
    data: {
      id: docId,
      organizationId: orgId,
      vehicleId: null,
      status: DocumentExtractionStatus.CONFIRMED,
      effectiveDocumentType: DocumentExtractionType.REGISTRATION_CERTIFICATE,
      contentSha256: `sha-${docId.slice(0, 8)}`,
      confirmedData: { scope: 'hv', capacityKwh },
    },
  });
  return docId;
}

async function ensureBasePlan(prisma: PrismaClient, orgId: string) {
  const fleet = await prisma.billingCatalogProduct.findUniqueOrThrow({ where: { key: 'FLEET' } });
  const subId = randomUUID();
  await prisma.billingSubscription.create({
    data: {
      id: subId,
      organizationId: orgId,
      status: 'ACTIVE',
      currency: 'EUR',
    },
  });
  await prisma.billingSubscriptionItem.create({
    data: {
      subscriptionId: subId,
      organizationId: orgId,
      billingProductId: fleet.id,
      itemRole: 'BASE_PLAN',
      quantity: 0,
      status: 'ACTIVE',
      validFrom: new Date('2020-01-01'),
    },
  });
}

function iceDto(hmId: string, orgId: string, overrides?: Partial<RegisterHmOnlyVehicleDto>): RegisterHmOnlyVehicleDto {
  return {
    hmVehicleId: hmId,
    organizationId: orgId,
    model: 'X5',
    year: 2022,
    fuelType: 'GASOLINE',
    vehicleType: 'SEDAN',
    ...overrides,
  };
}

function bevDto(
  hmId: string,
  orgId: string,
  docId: string,
  overrides?: Partial<RegisterHmOnlyVehicleDto>,
): RegisterHmOnlyVehicleDto {
  return {
    ...iceDto(hmId, orgId, { fuelType: 'ELECTRIC', model: 'i4', year: 2023, ...overrides }),
    hvBatteryUsableCapacityKwh: 64,
    hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
    hvBatteryReferenceDocumentId: docId,
  };
}

interface DbCounts {
  vehicles: number;
  cases: number;
  outbox: number;
  quantityEvents: number;
  sourceLinks: number;
  providerConsents: number;
  subscriptionItems: number;
}

async function snapshotCounts(prisma: PrismaClient, orgId: string): Promise<DbCounts> {
  const [vehicles, cases, outbox, quantityEvents, sourceLinks, providerConsents, subscriptionItems] =
    await Promise.all([
      prisma.vehicle.count({ where: { organizationId: orgId } }),
      prisma.vehicleOnboardingCase.count({ where: { organizationId: orgId } }),
      prisma.vehicleRegistryLifecycleOutbox.count({ where: { organizationId: orgId } }),
      prisma.billingQuantityEvent.count({ where: { organizationId: orgId } }),
      prisma.vehicleDataSourceLink.count({
        where: { vehicle: { organizationId: orgId } },
      }),
      prisma.vehicleProviderConsent.count({ where: { organizationId: orgId } }),
      prisma.billingSubscriptionItem.count({ where: { organizationId: orgId } }),
    ]);
  return { vehicles, cases, outbox, quantityEvents, sourceLinks, providerConsents, subscriptionItems };
}

function assertCountsUnchanged(before: DbCounts, after: DbCounts) {
  expect(after).toEqual(before);
}

function minimalVehicleCreate(
  orgId: string,
  vin: string,
  overrides?: {
    id?: string;
    model?: string;
    year?: number;
    vehicleName?: string;
    registryLifecycle?: VehicleRegistryLifecycle;
    fuelType?: FuelType;
  },
) {
  return {
    organizationId: orgId,
    vin,
    make: 'BMW',
    model: overrides?.model ?? 'Test',
    year: overrides?.year ?? 2020,
    vehicleName: overrides?.vehicleName ?? 'Test',
    fuelType: overrides?.fuelType ?? FuelType.GASOLINE,
    registryLifecycle: overrides?.registryLifecycle ?? VehicleRegistryLifecycle.ACTIVE,
    ...(overrides?.id ? { id: overrides.id } : {}),
  };
}

async function assertRowFingerprintUnchanged(
  db: PrismaClient,
  orgId: string,
  hmId: string,
  run: () => Promise<unknown>,
) {
  const before = await captureHmObservationDbFingerprint(db, orgId, hmId);
  await run();
  const after = await captureHmObservationDbFingerprint(db, orgId, hmId);
  assertHmObservationFingerprintsEqual(before, after);
}

(run ? describe : describe.skip)('V2B-PR7 HM readiness observation (postgres)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let observation: HmOnlyCanonicalReadinessObservationService;

  beforeAll(() => {
    prisma = new PrismaClient();
    prismaService = prisma as unknown as PrismaService;
    observation = new HmOnlyCanonicalReadinessObservationService(prismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('PR7-01 eligible HM ICE candidate', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const before = await snapshotCounts(prisma, orgId);
    await assertRowFingerprintUnchanged(prisma, orgId, hmId, async () => {
      const result = await observation.observeHmOnlyRegistrationAttempt({
        dto: iceDto(hmId, orgId),
        access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
      });
      expect(result.legacyAdmission).toBe('LEGACY_ADMISSIBLE');
      expect(result.canonicalAdmission).toBe('CANONICAL_ADMISSION_ELIGIBLE');
      expect(result.canonicalReadiness).toBe('CANONICAL_READINESS_PASS');
      expect(result.powertrainClass).toBe('ICE');
      expect(result.divergenceClassification).toBe('NO_DIVERGENCE');
    });
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });

  it('PR7-02 eligible HM BEV candidate with substantiated battery doc', async () => {
    const orgId = await createOrg(prisma);
    const docId = await createOnboardingBatteryDocument(prisma, orgId, 64);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const before = await snapshotCounts(prisma, orgId);
    const result = await observation.observeHmOnlyRegistrationAttempt({
      dto: bevDto(hmId, orgId, docId),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });
    expect(result.canonicalReadiness).toBe('CANONICAL_READINESS_PASS');
    expect(result.powertrainClass).toBe('BEV');
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });

  it('PR7-03 missing model/year blocks canonical', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const before = await snapshotCounts(prisma, orgId);
    const result = await observation.observeHmOnlyRegistrationAttempt({
      dto: iceDto(hmId, orgId, { model: undefined, year: undefined }),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });
    expect(result.canonicalReadiness).not.toBe('CANONICAL_READINESS_PASS');
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });

  it('PR7-04 BEV missing mandatory battery evidence blocks canonical', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const before = await snapshotCounts(prisma, orgId);
    const result = await observation.observeHmOnlyRegistrationAttempt({
      dto: iceDto(hmId, orgId, { fuelType: 'ELECTRIC', model: 'i4', year: 2023 }),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });
    expect(result.canonicalReadiness).toBe('CANONICAL_READINESS_BLOCKED');
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });

  it('PR7-05 unsubstantiated battery document blocks canonical', async () => {
    const orgId = await createOrg(prisma);
    const docId = await createOnboardingBatteryDocument(prisma, orgId, 40);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const before = await snapshotCounts(prisma, orgId);
    const result = await observation.observeHmOnlyRegistrationAttempt({
      dto: bevDto(hmId, orgId, docId, { hvBatteryUsableCapacityKwh: 90 }),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });
    expect(result.canonicalReadiness).toBe('CANONICAL_READINESS_BLOCKED');
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });

  it('PR7-08 cross-tenant HM mirror denied on legacy classifier', async () => {
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgA);
    const before = await snapshotCounts(prisma, orgA);
    const beforeB = await snapshotCounts(prisma, orgB);
    const fingerprintOrgABefore = await captureHmObservationDbFingerprint(prisma, orgA, hmId);
    const fingerprintOrgBBefore = await captureHmObservationDbFingerprint(prisma, orgB, hmId);
    const result = await observation.observeHmOnlyRegistrationAttempt({
      dto: iceDto(hmId, orgB),
      access: { tenantOrganizationId: orgB, isMasterAdmin: false, actorUserId: null },
    });
    expect(result.legacyBlockerReasonCodes).toContain('HM_TENANT_ACCESS_DENIED');
    expect(result.canonicalReadiness).not.toBe('CANONICAL_READINESS_PASS');
    expect(result.canonicalAdmission).toBe('CANONICAL_ADMISSION_NOT_EVALUABLE');
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgA));
    assertCountsUnchanged(beforeB, await snapshotCounts(prisma, orgB));
    const fingerprintOrgAAfter = await captureHmObservationDbFingerprint(prisma, orgA, hmId);
    const fingerprintOrgBAfter = await captureHmObservationDbFingerprint(prisma, orgB, hmId);
    assertHmObservationFingerprintsEqual(fingerprintOrgABefore, fingerprintOrgAAfter);
    assertHmObservationFingerprintsEqual(fingerprintOrgBBefore, fingerprintOrgBAfter);
  });

  it('PR7-09 inactive organization blocks canonical', async () => {
    const orgId = await createOrg(prisma, { status: OrganizationStatus.SUSPENDED });
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const before = await snapshotCounts(prisma, orgId);
    const access = { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null };
    const result = await observation.observeHmOnlyRegistrationAttempt({
      dto: iceDto(hmId, orgId),
      access,
    });
    expect(result.legacyAdmission).toBe('LEGACY_BLOCKED');
    expect(result.legacyBlockerReasonCodes).toContain('ORG_NOT_OPERATIONAL');
    expect(result.canonicalAdmission).toBe('CANONICAL_ADMISSION_BLOCKED');
    expect(result.canonicalAdmissionBlockerReasonCodes).toContain('ORG_NOT_OPERATIONAL');
    expect(result.canonicalReadiness).not.toBe('CANONICAL_READINESS_PASS');
    expect(result.canonicalBlockerReasonCodes).not.toContain('ORG_STATUS_NOT_ACTIVE');
    expect(result.expectedBillingClassification).not.toBe('BILLABLE_IF_ACTIVATED');
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });

  it('PR7-10 missing product entitlement blocks canonical', async () => {
    const orgId = await createOrg(prisma, { withRental: false });
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const before = await snapshotCounts(prisma, orgId);
    const result = await observation.observeHmOnlyRegistrationAttempt({
      dto: iceDto(hmId, orgId),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });
    expect(result.canonicalBlockerReasonCodes).toContain('PRODUCT_ENTITLEMENT_NOT_ACTIVE');
    expect(result.canonicalBlockerReasonCodes).not.toContain('PRODUCT_RESOLUTION_FAILED');
    expect(result.canonicalReadiness).not.toBe('CANONICAL_READINESS_PASS');
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });

  it('PR7-11 duplicate VIN in org blocks legacy and canonical paths', async () => {
    const orgId = await createOrg(prisma);
    const { hmId, vin } = await createApprovedHmMirror(prisma, orgId);
    await prisma.vehicle.create({
      data: minimalVehicleCreate(orgId, vin, {
        model: 'Existing',
        year: 2019,
        vehicleName: 'Existing',
      }),
    });
    const before = await snapshotCounts(prisma, orgId);
    const result = await observation.observeHmOnlyRegistrationAttempt({
      dto: iceDto(hmId, orgId),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });
    expect(result.legacyBlockerReasonCodes).toContain('VIN_ALREADY_EXISTS_IN_ORG');
    expect(result.canonicalBlockerReasonCodes).not.toContain('OBSERVATION_SNAPSHOT_RACE');
    expect(result.evaluationCompleteness).not.toBe('NOT_EVALUABLE');
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });

  it('PR7-13 OFFBOARDED existing vehicle blocks admission', async () => {
    const orgId = await createOrg(prisma);
    const { hmId, vin } = await createApprovedHmMirror(prisma, orgId);
    await prisma.vehicle.create({
      data: minimalVehicleCreate(orgId, vin, {
        model: 'Offboarded',
        year: 2018,
        vehicleName: 'Offboarded',
        registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED,
      }),
    });
    const before = await snapshotCounts(prisma, orgId);
    const result = await observation.observeHmOnlyRegistrationAttempt({
      dto: iceDto(hmId, orgId),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });
    expect(result.legacyBlockerReasonCodes).toContain('EXISTING_VEHICLE_OFFBOARDED_OR_ARCHIVED');
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });

  it('PR7-14 stale provider mirror flagged without mutation', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId, { staleMirror: true });
    const before = await snapshotCounts(prisma, orgId);
    const result = await observation.observeHmOnlyRegistrationAttempt({
      dto: iceDto(hmId, orgId),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });
    expect(result.providerMirrorFreshness).toBe('STALE');
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });

  it('PR7-15 billable prediction when base plan exists', async () => {
    const orgId = await createOrg(prisma);
    await ensureBasePlan(prisma, orgId);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const before = await snapshotCounts(prisma, orgId);
    const result = await observation.observeHmOnlyRegistrationAttempt({
      dto: iceDto(hmId, orgId),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });
    expect(result.expectedBillingClassification).toBe('BILLABLE_IF_ACTIVATED');
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });

  it('PR7-16 non-billable prediction without base plan', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const before = await snapshotCounts(prisma, orgId);
    const result = await observation.observeHmOnlyRegistrationAttempt({
      dto: iceDto(hmId, orgId),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });
    expect(result.expectedBillingClassification).toBe('NON_BILLABLE_IF_ACTIVATED');
    expect(result.billingPredictionReasonCode).toBe('NO_BASE_PLAN');
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });

  it('PR7-06 BEV missing mandatory HV technical baseline (VO-RDY-HV-BATTERY-001)', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    await assertRowFingerprintUnchanged(prisma, orgId, hmId, async () => {
      const result = await observation.observeHmOnlyRegistrationAttempt({
        dto: iceDto(hmId, orgId, { fuelType: 'ELECTRIC', model: 'i4', year: 2023 }),
        access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
      });
      expect(result.canonicalReadiness).toBe('CANONICAL_READINESS_BLOCKED');
      expect(result.canonicalBlockerReasonCodes).toContain('HV_BATTERY_REFERENCE_MISSING');
      expect(result.divergenceClassification).toBe('TECHNICAL_READINESS_DIVERGENCE');
    });
  });

  it('PR7-07 deferred brake/tire policy cannot waive mandatory BEV HV baseline', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    await assertRowFingerprintUnchanged(prisma, orgId, hmId, async () => {
      const result = await observation.observeHmOnlyRegistrationAttempt({
        dto: {
          ...iceDto(hmId, orgId, { fuelType: 'ELECTRIC', model: 'i4', year: 2023 }),
          hvBatteryUsableCapacityKwh: 64,
          hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
        },
        access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
      });
      expect(result.canonicalReadiness).toBe('CANONICAL_READINESS_BLOCKED');
      expect(result.canonicalBlockerReasonCodes).toContain('HV_BATTERY_REFERENCE_MISSING');
      expect(result.canonicalReadiness).not.toBe('CANONICAL_READINESS_PASS');
    });
  });

  it('PR7-12 legacy HM registered vehicle requires reconciliation', async () => {
    const orgId = await createOrg(prisma);
    const { hmId, vin } = await createApprovedHmMirror(prisma, orgId);
    const vehicleId = randomUUID();
    await prisma.vehicle.create({
      data: minimalVehicleCreate(orgId, vin, {
        id: vehicleId,
        model: 'Legacy',
        year: 0,
        vehicleName: 'Legacy',
      }),
    });
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: {
        registrationState: 'REGISTERED',
        synqdriveVehicleId: vehicleId,
      },
    });
    await assertRowFingerprintUnchanged(prisma, orgId, hmId, async () => {
      const result = await observation.observeHmOnlyRegistrationAttempt({
        dto: iceDto(hmId, orgId),
        access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
      });
      expect(result.canonicalAdmission).toBe('CANONICAL_LEGACY_RECONCILIATION_REQUIRED');
      expect(result.canonicalReadiness).toBe('CANONICAL_READINESS_NOT_EVALUABLE');
      expect(result.expectedBillingClassification).toBe('UNKNOWN');
    });
  });

  it('PR7-12b canonical completed case yields idempotent replay classification', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const harness = createHmOnlyCanonicalPgHarness(prisma);
    const access = { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null };
    const dto = iceDto(hmId, orgId);
    const registered = await harness.hmOnlyCanonical.register({ dto, access });
    const vehicleId = registered.synqdriveVehicleId;
    expect(vehicleId).toBeTruthy();
    const completedCase = await prisma.vehicleOnboardingCase.findFirst({
      where: {
        organizationId: orgId,
        vehicleId,
        status: 'COMPLETED',
        idempotencyKey: hmOnlyCanonicalRegistrationIdempotencyKey(orgId, hmId),
      },
    });
    expect(completedCase?.completedAt).toBeTruthy();
    const outboxBefore = await prisma.vehicleRegistryLifecycleOutbox.count({ where: { organizationId: orgId } });
    const billingBefore = await prisma.billingQuantityEvent.count({ where: { organizationId: orgId } });
    await assertRowFingerprintUnchanged(prisma, orgId, hmId, async () => {
      const result = await observation.observeHmOnlyRegistrationAttempt({ dto, access });
      expect(result.canonicalAdmission).toBe('CANONICAL_IDEMPOTENT_REPLAY');
      expect(result.expectedBillingClassification).toBe('NO_NEW_EFFECT_IDEMPOTENT_REPLAY');
      expect(
        await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }),
      ).toMatchObject({ id: vehicleId });
      expect(await prisma.vehicleRegistryLifecycleOutbox.count({ where: { organizationId: orgId } })).toBe(
        outboxBefore,
      );
      expect(await prisma.billingQuantityEvent.count({ where: { organizationId: orgId } })).toBe(billingBefore);
    });
  });

  it('PR7-17 repeated evaluation: zero durable mutation', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const before = await snapshotCounts(prisma, orgId);
    const access = { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null };
    await observation.observeHmOnlyRegistrationAttempt({ dto: iceDto(hmId, orgId), access });
    await observation.observeHmOnlyRegistrationAttempt({ dto: iceDto(hmId, orgId), access });
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });

  it('PR7-18 evaluation error isolation (missing HM row)', async () => {
    const orgId = await createOrg(prisma);
    const before = await snapshotCounts(prisma, orgId);
    const result = await observation.observeHmOnlyRegistrationAttempt({
      dto: iceDto(randomUUID(), orgId),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });
    expect(result.evaluationCompleteness).toBe('NOT_EVALUABLE');
    expect(result.canonicalReadiness).toBe('CANONICAL_READINESS_NOT_EVALUABLE');
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });

  it('PR7-22 stale pre-registration snapshot after HM mutation is NOT_EVALUABLE', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const hmRow = await prisma.highMobilityVehicle.findUniqueOrThrow({ where: { id: hmId } });
    const preRegistrationSnapshot = await buildHmObservationEvaluationSnapshot(prisma, hmRow, orgId);
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { registrationState: 'REGISTERED' },
    });
    const result = await observation.observeHmOnlyRegistrationAttempt({
      dto: iceDto(hmId, orgId),
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
      preRegistrationSnapshot,
    });
    expect(result.evaluationCompleteness).toBe('NOT_EVALUABLE');
    expect(result.canonicalBlockerReasonCodes).toContain('OBSERVATION_SNAPSHOT_RACE');
    expect(result.canonicalReadiness).not.toBe('CANONICAL_READINESS_PASS');
  });

  it('PR7-22b RepeatableRead cannot observe vehicle rows committed after snapshot', async () => {
    const orgId = await createOrg(prisma);
    const { hmId, vin } = await createApprovedHmMirror(prisma, orgId);
    const hmRow = await prisma.highMobilityVehicle.findUniqueOrThrow({ where: { id: hmId } });
    const outsider = new PrismaClient();
    try {
      const seenInsideTx = await runHmObservationInReadOnlyTransaction(prismaService, async (tx) => {
        const snapshot = await buildHmObservationEvaluationSnapshot(tx, hmRow, orgId);
        await outsider.vehicle.create({
          data: minimalVehicleCreate(orgId, vin, { model: 'PostSnapshot', vehicleName: 'PostSnapshot' }),
        });
        const check = await assertHmPreRegistrationSnapshotUnchanged(tx, snapshot, orgId);
        return { snapshot, check };
      });
      if (seenInsideTx === 'OBSERVATION_DB_CONSISTENCY_UNAVAILABLE') {
        throw new Error('unexpected OBSERVATION_DB_CONSISTENCY_UNAVAILABLE');
      }
      expect(seenInsideTx.check.ok).toBe(true);
      expect(seenInsideTx.snapshot.preExistingVehicleIdsForVin).toHaveLength(0);
    } finally {
      await outsider.$disconnect();
    }
  });

  it('PR7-20 shadow-hook pre-registration snapshot sequence', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const hmRecord = await prisma.highMobilityVehicle.findUniqueOrThrow({ where: { id: hmId } });
    const preRegistrationSnapshot = await buildHmObservationEvaluationSnapshot(
      prisma,
      hmRecord,
      orgId,
    );
    await assertRowFingerprintUnchanged(prisma, orgId, hmId, async () => {
      const result = await observation.observeHmOnlyRegistrationAttempt({
        dto: iceDto(hmId, orgId),
        access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
        preRegistrationSnapshot,
      });
      expect(result.legacyAdmission).toBe('LEGACY_ADMISSIBLE');
      expect(result.canonicalReadiness).toBe('CANONICAL_READINESS_PASS');
    });
  });

  it('PR7-21 fingerprint negative control detects mutation attempt', async () => {
    const orgId = await createOrg(prisma);
    const { hmId, vin } = await createApprovedHmMirror(prisma, orgId);
    const before = await captureHmObservationDbFingerprint(prisma, orgId, hmId);
    await prisma.vehicle.create({
      data: minimalVehicleCreate(orgId, `${vin}-mut`, {
        model: 'Mutated',
        year: 2020,
        vehicleName: 'Mutated',
      }),
    });
    const after = await captureHmObservationDbFingerprint(prisma, orgId, hmId);
    expect(() => assertHmObservationFingerprintsEqual(before, after)).toThrow();
  });

  it('PR7-TX-01 observation transaction RepeatableRead + read_only', async () => {
    const orgId = await createOrg(prisma);
    const outcome = await runHmObservationInReadOnlyTransaction(prismaService, async (tx) => {
      const [ro, iso] = await Promise.all([
        tx.$queryRaw<{ transaction_read_only: string }[]>`SHOW transaction_read_only`,
        tx.$queryRaw<{ transaction_isolation: string }[]>`SHOW transaction_isolation`,
      ]);
      expect(ro[0]?.transaction_read_only?.toLowerCase()).toBe('on');
      expect(iso[0]?.transaction_isolation?.toLowerCase()).toContain('repeatable');
      const org = await tx.organization.findUnique({ where: { id: orgId } });
      expect(org?.id).toBe(orgId);
      return 'ok';
    });
    expect(outcome).toBe('ok');
    expect(HM_OBSERVATION_PRISMA_ISOLATION).toBe(Prisma.TransactionIsolationLevel.RepeatableRead);
  });

  it('PR7-TX-02 postgres rejects writes inside observation transaction', async () => {
    const orgId = await createOrg(prisma);
    const outcome = await runHmObservationInReadOnlyTransaction(prismaService, async (tx) => {
      await tx.$executeRaw`
        UPDATE organizations
        SET company_name = company_name
        WHERE id = ${orgId}::uuid
      `;
      return 'should-not-reach';
    });
    expect(outcome).toBe('OBSERVATION_DB_CONSISTENCY_UNAVAILABLE');
  });

  it('PR7-19 concurrent evaluations: zero durable mutation', async () => {
    const orgId = await createOrg(prisma);
    const { hmId } = await createApprovedHmMirror(prisma, orgId);
    const before = await snapshotCounts(prisma, orgId);
    const access = { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null };
    const dto = iceDto(hmId, orgId);
    await Promise.all([
      observation.observeHmOnlyRegistrationAttempt({ dto, access }),
      observation.observeHmOnlyRegistrationAttempt({ dto, access }),
    ]);
    assertCountsUnchanged(before, await snapshotCounts(prisma, orgId));
  });
});