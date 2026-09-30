import { parseAdminBaselineCapturePayload } from '../policy/admin-baseline-capture.validation';
import { parseTechnicalBaselineCapturePayload } from '../policy/technical-baseline-capture.validation';
import { VEHICLE_ADMIN_BASELINE_DRAFT_VERSION } from '../contracts/vo-document-versions';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from '../contracts/vo-document-versions';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  assertProjectionOmitsRawSourceSnapshots,
  projectVehicleOnboardingCase,
} from '../http/vehicle-onboarding-case.projection';
import { toVehicleOnboardingHttpException } from '../http/vehicle-onboarding-http.util';
import { assertExpectedConcurrencyToken } from '../policy/onboarding-concurrency.util';
import {
  parseCaseListQuery,
  parseRequiredConcurrencyToken,
  parseSelectedProductRuntime,
} from '../policy/capture-request.validation';
import { ProductSlug } from '@prisma/client';

describe('vehicle onboarding capture API (unit)', () => {
  it('parses strict admin baseline', () => {
    const draft = parseAdminBaselineCapturePayload({
      version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
      vehicleName: ' Fleet 1 ',
      licensePlate: null,
      stationId: null,
      notes: '  ',
    });
    expect(draft.vehicleName).toBe('Fleet 1');
    expect(draft.notes).toBeNull();
  });

  it('rejects V1 technical baseline writes', () => {
    expect(() =>
      parseTechnicalBaselineCapturePayload({ version: 1, referenceInputs: {} }),
    ).toThrow(VehicleOnboardingError);
  });

  it('rejects serviceEventId in HV section', () => {
    expect(() =>
      parseTechnicalBaselineCapturePayload({
        version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
        hvBatteryReference: {
          capacityKwh: 75,
          capacityType: 'USABLE',
          source: 'MANUAL_VERIFIED',
          serviceEventId: 'evt-1',
        },
      }),
    ).toThrow(VehicleOnboardingError);
  });

  it('rejects malformed present brake section', () => {
    expect(() =>
      parseTechnicalBaselineCapturePayload({
        version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
        brakeReference: { frontPadNominalThicknessMm: 'bad' },
      }),
    ).toThrow(VehicleOnboardingError);
  });

  it('maps concurrency conflict to HTTP 409', () => {
    const ex = toVehicleOnboardingHttpException(
      new VehicleOnboardingError('ONBOARDING_CONCURRENCY_CONFLICT', 'conflict'),
    );
    expect(ex.getStatus()).toBe(409);
  });

  it('detects concurrency mismatch', () => {
    expect(() => assertExpectedConcurrencyToken('a', 'b')).toThrow(
      VehicleOnboardingError,
    );
    assertExpectedConcurrencyToken(null, null);
  });

  it('rejects admin unknown keys', () => {
    expect(() =>
      parseAdminBaselineCapturePayload({
        version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
        vehicleName: 'Car',
        arbitraryField: true,
      }),
    ).toThrow(VehicleOnboardingError);
  });

  it('rejects technical unknown top-level keys', () => {
    expect(() =>
      parseTechnicalBaselineCapturePayload({
        version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
        extra: true,
      }),
    ).toThrow(VehicleOnboardingError);
  });

  it('rejects brake unknown nested keys', () => {
    expect(() =>
      parseTechnicalBaselineCapturePayload({
        version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
        brakeReference: { frontPadNominalThicknessMm: 10, evil: true },
      }),
    ).toThrow(VehicleOnboardingError);
  });

  it('requires explicit concurrency token property', () => {
    expect(() => parseRequiredConcurrencyToken({})).toThrow(VehicleOnboardingError);
    expect(parseRequiredConcurrencyToken({ expectedConcurrencyToken: null })).toBeNull();
    expect(() => parseRequiredConcurrencyToken({ expectedConcurrencyToken: 1 })).toThrow(
      VehicleOnboardingError,
    );
  });

  it('validates selectedProduct at runtime', () => {
    expect(() => parseSelectedProductRuntime('NOT_A_PRODUCT')).toThrow(VehicleOnboardingError);
    expect(parseSelectedProductRuntime(ProductSlug.RENTAL)).toBe(ProductSlug.RENTAL);
  });

  it('validates list query params', () => {
    expect(() => parseCaseListQuery({ status: 'BROKEN' })).toThrow(VehicleOnboardingError);
    expect(() => parseCaseListQuery({ limit: 'abc' })).toThrow(VehicleOnboardingError);
  });

  it('projection omits raw provider snapshot payloads', () => {
    const now = new Date();
    const projection = projectVehicleOnboardingCase(
      {
        id: 'case-1',
        organizationId: 'org-1',
        sourceMode: 'MANUAL',
        status: 'OPEN',
        primarySourceProvider: 'MANUAL',
        primarySourceScopeKey: '',
        primarySourceExternalId: 'x',
        draftIdentityJson: {
          version: 1,
          vin: null,
          vinProvenance: null,
          vinVerificationState: null,
          make: 'Audi',
          model: 'A3',
          year: 2020,
          fuelType: 'GASOLINE',
          sourceEvidenceRefs: [],
        },
        draftIdentityVersion: 1,
        draftAdminBaselineJson: {
          version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
          vehicleName: null,
          licensePlate: null,
          stationId: null,
          notes: null,
        },
        draftAdminBaselineVersion: 1,
        draftTechnicalBaselineJson: { version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 },
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
        readinessSnapshotJson: null,
        readinessSnapshotVersion: 0,
        readinessProfileVersion: null,
        validationFindingsJson: { version: 1, findings: [] },
        validationFindingsVersion: 1,
        idempotencyKey: 'k',
        concurrencyToken: 'tok',
        vehicleId: null,
        initiatedByUserId: null,
        lastActorUserId: null,
        completedAt: null,
        cancelledAt: null,
        expiredAt: null,
        createdAt: now,
        updatedAt: now,
      } as any,
      [
        {
          id: 'ref-1',
          onboardingCaseId: 'case-1',
          provider: 'MANUAL',
          connectionScope: null,
          connectionScopeKey: '',
          externalVehicleIdentity: 'MANUAL:org:x',
          sourceMirrorTable: null,
          sourceMirrorId: null,
          provenanceAt: now,
          isPrimary: true,
          snapshotMetadataJson: { secretProviderPayload: true },
          snapshotMetadataVersion: 1,
          createdAt: now,
          updatedAt: now,
        } as any,
      ],
    );
    assertProjectionOmitsRawSourceSnapshots(projection);
    expect(projection.sourceRefs[0]).not.toHaveProperty('snapshotMetadataJson');
  });
});
