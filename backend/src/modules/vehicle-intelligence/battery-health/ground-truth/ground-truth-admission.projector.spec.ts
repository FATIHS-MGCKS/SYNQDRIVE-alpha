import { ServiceEventOrigin, ServiceEventType } from '@prisma/client';
import { projectGroundTruthAdmissionV1 } from './ground-truth-admission.projector';
import {
  GROUND_TRUTH_ADMISSION_LEVEL,
  GROUND_TRUTH_ADMISSION_REASON,
  type GroundTruthAdmissionContextV1,
} from './ground-truth-admission.types';

function ctx(
  partial: Partial<GroundTruthAdmissionContextV1> & Pick<GroundTruthAdmissionContextV1, 'groundTruthType'>,
): GroundTruthAdmissionContextV1 {
  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    vehicleOrganizationId: 'org-1',
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
        sourceIdentity: {
          batteryEvidence: {
            id: 'ev',
            scope: 'LV',
            sourceType: 'WORKSHOP_MEASUREMENT',
            valueType: 'VOLTAGE_V',
            observedAtIso: '2026-01-01T00:00:00.000Z',
          },
        },
      }),
    );
    expect(d.level).toBe(GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH);
  });

  it('B — workshop HV measurement admitted', () => {
    const d = projectGroundTruthAdmissionV1(
      ctx({
        groundTruthType: 'WORKSHOP_MEASUREMENT',
        batteryScope: 'HV',
        sourceIdentity: {
          batteryEvidence: {
            id: 'ev',
            scope: 'HV',
            sourceType: 'WORKSHOP_MEASUREMENT',
            valueType: 'SOH_PERCENT',
            observedAtIso: '2026-01-01T00:00:00.000Z',
          },
        },
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
            batteryEvidence: {
              id: 'ev',
              scope,
              sourceType: 'DOCUMENT_CONFIRMED',
              valueType: 'VOLTAGE_V',
              observedAtIso: '2026-01-01T00:00:00.000Z',
            },
            documentExtraction: {
              id: 'doc',
              effectiveDocumentType: 'BATTERY',
              status: 'APPLIED',
            },
          },
        }),
      );
      expect(d.level).toBe(GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH);
    }
  });

  it('E — generic replacement without scope evidence is unverified', () => {
    const d = projectGroundTruthAdmissionV1(
      ctx({
        groundTruthType: 'BATTERY_REPLACEMENT',
        sourceAuthority: 'CONFIRMED_DOCUMENT',
        sourceIdentity: {
          serviceEvent: {
            id: 'evt',
            eventType: ServiceEventType.BATTERY_REPLACEMENT,
            eventDateIso: '2026-01-01T00:00:00.000Z',
            origin: ServiceEventOrigin.AI_UPLOAD,
          },
        },
      }),
    );
    expect(d.level).toBe(GROUND_TRUTH_ADMISSION_LEVEL.UNVERIFIED_EVIDENCE);
    expect(d.reasons).toContain(GROUND_TRUTH_ADMISSION_REASON.REPLACEMENT_SCOPE_AMBIGUOUS);
  });

  it('F — BEV drive profile does not auto-admit HV replacement without evidence', () => {
    const d = projectGroundTruthAdmissionV1(
      ctx({
        groundTruthType: 'BATTERY_REPLACEMENT',
        batteryScope: 'HV',
        sourceIdentity: {
          serviceEvent: {
            id: 'evt',
            eventType: ServiceEventType.BATTERY_REPLACEMENT,
            eventDateIso: '2026-01-01T00:00:00.000Z',
            origin: ServiceEventOrigin.MANUAL,
          },
        },
      }),
    );
    expect(d.level).not.toBe(GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH);
  });

  it('G — origin MANUAL does not imply confirmed', () => {
    const d = projectGroundTruthAdmissionV1(
      ctx({
        groundTruthType: 'BATTERY_REPLACEMENT',
        sourceIdentity: {
          serviceEvent: {
            id: 'evt',
            eventType: ServiceEventType.BATTERY_REPLACEMENT,
            eventDateIso: '2026-01-01T00:00:00.000Z',
            origin: ServiceEventOrigin.MANUAL,
          },
          batteryEvidence: {
            id: 'ev',
            scope: 'LV',
            sourceType: 'MANUAL_REPORT',
            valueType: 'VOLTAGE_V',
            observedAtIso: '2026-01-01T00:00:00.000Z',
          },
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
          sourceIdentity: {
            batteryEvidence: {
              id: 'ev',
              scope: 'LV',
              sourceType,
              valueType: 'VOLTAGE_V',
              observedAtIso: '2026-01-01T00:00:00.000Z',
            },
          },
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
          batteryEvidence: {
            id: 'ev',
            scope: 'LV',
            sourceType: 'WORKSHOP_MEASUREMENT',
            valueType: 'VOLTAGE_V',
            observedAtIso: '2026-01-01T00:00:00.000Z',
          },
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
          batteryEvidence: {
            id: 'ev',
            scope: 'LV',
            sourceType: 'WORKSHOP_MEASUREMENT',
            valueType: 'VOLTAGE_V',
            observedAtIso: '2026-01-01T00:00:00.000Z',
          },
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
          batteryEvidence: {
            id: 'ev',
            scope: 'LV',
            sourceType: 'DOCUMENT_CONFIRMED',
            valueType: 'VOLTAGE_V',
            observedAtIso: '2026-01-01T00:00:00.000Z',
          },
          documentExtraction: {
            id: 'doc',
            effectiveDocumentType: 'BATTERY',
            status: 'READY_FOR_REVIEW',
          },
        },
      }),
    );
    expect(d.reasons).toContain(GROUND_TRUTH_ADMISSION_REASON.DOCUMENT_UNCONFIRMED);
  });
});
