import { ServiceEventOrigin, ServiceEventType } from '@prisma/client';
import { projectGroundTruthAdmissionV1 } from './ground-truth-admission.projector';
import {
  GROUND_TRUTH_ADMISSION_LEVEL,
  GROUND_TRUTH_ADMISSION_REASON,
  type GroundTruthAdmissionContextV1,
  type GroundTruthSourceIdentityV1,
} from './ground-truth-admission.types';

const ORG = 'org-1';
const VEH = 'veh-1';

function evidence(
  partial: Partial<NonNullable<GroundTruthSourceIdentityV1['batteryEvidence']>> &
    Pick<NonNullable<GroundTruthSourceIdentityV1['batteryEvidence']>, 'scope' | 'sourceType'>,
): NonNullable<GroundTruthSourceIdentityV1['batteryEvidence']> {
  return {
    id: 'ev-1',
    valueType: 'VOLTAGE_V',
    observedAtIso: '2026-01-01T00:00:00.000Z',
    numericValue: 12.4,
    unit: 'V',
    confidence: null,
    quality: 'workshop_measurement',
    measurementId: null,
    serviceEventId: null,
    documentExtractionId: null,
    vehicleId: VEH,
    ...partial,
  };
}

function serviceEvent(
  partial: Partial<NonNullable<GroundTruthSourceIdentityV1['serviceEvent']>>,
): NonNullable<GroundTruthSourceIdentityV1['serviceEvent']> {
  return {
    id: 'evt-1',
    eventType: ServiceEventType.BATTERY_REPLACEMENT,
    eventDateIso: '2026-01-01T00:00:00.000Z',
    origin: ServiceEventOrigin.AI_UPLOAD,
    organizationId: ORG,
    vehicleId: VEH,
    ...partial,
  };
}

function documentExtraction(
  partial: Partial<NonNullable<GroundTruthSourceIdentityV1['documentExtraction']>>,
): NonNullable<GroundTruthSourceIdentityV1['documentExtraction']> {
  return {
    id: 'doc-1',
    effectiveDocumentType: 'BATTERY',
    status: 'APPLIED',
    organizationId: ORG,
    vehicleId: VEH,
    ...partial,
  };
}

function ctx(
  partial: Partial<GroundTruthAdmissionContextV1> & Pick<GroundTruthAdmissionContextV1, 'groundTruthType'>,
): GroundTruthAdmissionContextV1 {
  return {
    organizationId: ORG,
    vehicleId: VEH,
    vehicleOrganizationId: ORG,
    batteryScope: 'LV',
    effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
    sourceAuthority: 'WORKSHOP',
    manualConfirmationTrusted: false,
    sourceIdentity: {},
    ...partial,
  };
}

describe('projectGroundTruthAdmissionV1', () => {
  it('A — workshop LV measurement admitted', () => {
    const d = projectGroundTruthAdmissionV1(
      ctx({
        groundTruthType: 'WORKSHOP_MEASUREMENT',
        batteryScope: 'LV',
        sourceIdentity: { batteryEvidence: evidence({ scope: 'LV', sourceType: 'WORKSHOP_MEASUREMENT' }) },
      }),
    );
    expect(d.level).toBe(GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH);
  });

  it('B — workshop HV measurement admitted', () => {
    const d = projectGroundTruthAdmissionV1(
      ctx({
        groundTruthType: 'WORKSHOP_MEASUREMENT',
        batteryScope: 'HV',
        sourceIdentity: { batteryEvidence: evidence({ scope: 'HV', sourceType: 'WORKSHOP_MEASUREMENT' }) },
      }),
    );
    expect(d.level).toBe(GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH);
  });

  it('C/D — confirmed document LV/HV admitted', () => {
    for (const scope of ['LV', 'HV'] as const) {
      const d = projectGroundTruthAdmissionV1(
        ctx({
          groundTruthType: 'WORKSHOP_MEASUREMENT',
          batteryScope: scope,
          sourceAuthority: 'CONFIRMED_DOCUMENT',
          sourceIdentity: {
            batteryEvidence: evidence({ scope, sourceType: 'DOCUMENT_CONFIRMED' }),
            documentExtraction: documentExtraction({}),
          },
        }),
      );
      expect(d.level).toBe(GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH);
    }
  });

  it('E — confirmed document replacement with explicit scope admitted without numeric evidence', () => {
    const d = projectGroundTruthAdmissionV1(
      ctx({
        groundTruthType: 'BATTERY_REPLACEMENT',
        batteryScope: 'LV',
        sourceAuthority: 'CONFIRMED_DOCUMENT',
        sourceIdentity: { serviceEvent: serviceEvent({ origin: ServiceEventOrigin.AI_UPLOAD }) },
      }),
    );
    expect(d.level).toBe(GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH);
  });

  it('E2 — evidence scope mismatch blocks replacement', () => {
    const d = projectGroundTruthAdmissionV1(
      ctx({
        groundTruthType: 'BATTERY_REPLACEMENT',
        batteryScope: 'LV',
        sourceAuthority: 'CONFIRMED_DOCUMENT',
        sourceIdentity: {
          serviceEvent: serviceEvent({ origin: ServiceEventOrigin.AI_UPLOAD }),
          batteryEvidence: evidence({ scope: 'HV', sourceType: 'DOCUMENT_CONFIRMED' }),
        },
      }),
    );
    expect(d.level).toBe(GROUND_TRUTH_ADMISSION_LEVEL.UNVERIFIED_EVIDENCE);
    expect(d.reasons).toContain(GROUND_TRUTH_ADMISSION_REASON.REPLACEMENT_SCOPE_AMBIGUOUS);
  });

  it('E3 — manual confirmed trusted path admitted', () => {
    const d = projectGroundTruthAdmissionV1(
      ctx({
        groundTruthType: 'BATTERY_REPLACEMENT',
        batteryScope: 'HV',
        sourceAuthority: 'MANUAL_CONFIRMED',
        manualConfirmationTrusted: true,
        sourceIdentity: {
          serviceEvent: serviceEvent({ origin: ServiceEventOrigin.MANUAL }),
        },
      }),
    );
    expect(d.level).toBe(GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH);
  });

  it('F — BEV drive profile does not auto-admit HV replacement without evidence', () => {
    const d = projectGroundTruthAdmissionV1(
      ctx({
        groundTruthType: 'BATTERY_REPLACEMENT',
        batteryScope: 'HV',
        sourceIdentity: { serviceEvent: serviceEvent({ origin: ServiceEventOrigin.MANUAL }) },
      }),
    );
    expect(d.level).not.toBe(GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH);
  });

  it('G — origin MANUAL does not imply confirmed', () => {
    const d = projectGroundTruthAdmissionV1(
      ctx({
        groundTruthType: 'BATTERY_REPLACEMENT',
        sourceIdentity: {
          serviceEvent: serviceEvent({ origin: ServiceEventOrigin.MANUAL }),
          batteryEvidence: evidence({ scope: 'LV', sourceType: 'MANUAL_REPORT' }),
        },
      }),
    );
    expect(d.reasons).toContain(GROUND_TRUTH_ADMISSION_REASON.MANUAL_ORIGIN_NOT_CONFIRMED);
  });

  it('H/I — telemetry and model derived excluded', () => {
    for (const sourceType of ['TELEMETRY_DERIVED', 'MODEL_DERIVED'] as const) {
      const d = projectGroundTruthAdmissionV1(
        ctx({
          groundTruthType: 'WORKSHOP_MEASUREMENT',
          sourceIdentity: { batteryEvidence: evidence({ scope: 'LV', sourceType }) },
        }),
      );
      expect(d.level).toBe(GROUND_TRUTH_ADMISSION_LEVEL.EXCLUDED);
    }
  });

  it('J — missing effective time rejected', () => {
    const d = projectGroundTruthAdmissionV1(
      ctx({
        groundTruthType: 'WORKSHOP_MEASUREMENT',
        effectiveAt: null,
        sourceIdentity: {
          batteryEvidence: evidence({ scope: 'LV', sourceType: 'WORKSHOP_MEASUREMENT' }),
        },
      }),
    );
    expect(d.reasons).toContain(GROUND_TRUTH_ADMISSION_REASON.EFFECTIVE_TIME_REQUIRED);
  });

  it('K — cross-tenant excluded', () => {
    const d = projectGroundTruthAdmissionV1(
      ctx({
        vehicleOrganizationId: 'org-other',
        groundTruthType: 'WORKSHOP_MEASUREMENT',
        sourceIdentity: {
          batteryEvidence: evidence({ scope: 'LV', sourceType: 'WORKSHOP_MEASUREMENT' }),
        },
      }),
    );
    expect(d.reasons).toContain(GROUND_TRUTH_ADMISSION_REASON.SOURCE_TENANT_MISMATCH);
  });

  it('M — document unconfirmed excluded for measurement path', () => {
    const d = projectGroundTruthAdmissionV1(
      ctx({
        groundTruthType: 'WORKSHOP_MEASUREMENT',
        sourceIdentity: {
          batteryEvidence: evidence({ scope: 'LV', sourceType: 'DOCUMENT_CONFIRMED' }),
          documentExtraction: documentExtraction({ status: 'READY_FOR_REVIEW' }),
        },
      }),
    );
    expect(d.reasons).toContain(GROUND_TRUTH_ADMISSION_REASON.DOCUMENT_UNCONFIRMED);
  });
});
