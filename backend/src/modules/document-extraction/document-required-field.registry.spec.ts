import { buildPlannerTestInput } from './document-action-planner.test-fixtures';
import { planDocumentActions } from './document-action-planner.engine';
import {
  evaluateRequiredFieldCondition,
  hasConfirmedFieldValue,
  isStageReady,
} from './document-required-field.evaluator';
import {
  DOCUMENT_REQUIRED_FIELD_PROFILES,
  getDocumentRequiredFieldProfile,
  listDocumentRequiredFieldProfiles,
} from './document-required-field.registry';
import { DOCUMENT_REQUIRED_FIELD_REGISTRY_VERSION } from './document-required-field.registry.types';
import { buildPublicRequiredFieldRegistryDto } from './document-required-field.registry.public';
import {
  resolveDocumentRequiredFieldProfile,
  resolveDocumentRequiredFieldProfileKey,
} from './document-required-field.resolver';
import { DocumentExtractionMetadataService } from './document-extraction-metadata.service';

const ARCHIVE_SUBTYPES = [
  'GENERAL_LETTER',
  'CUSTOMER_CORRESPONDENCE',
  'DRIVER_DOCUMENT',
  'INSURANCE_NOTICE',
  'PAYMENT_PROOF',
  'GENERAL_PROOF',
  'UNKNOWN_DOCUMENT_TYPE',
] as const;

const FINE_ALIAS_SUBTYPES = [
  'HEARING_FORM',
  'ANHOERUNGSBOGEN',
  'DRIVER_INQUIRY',
  'FAHRERERMITTLUNG',
] as const;

const FINANCE_ALIAS_SUBTYPES = [
  'GUTSCHRIFT',
  'MAHNUNG',
  'ZAHLUNGSNACHWEIS',
  'EINGANGSRECHNUNG',
] as const;

const EVIDENCE_ALIAS_SUBTYPES = ['WORKSHOP_REPORT', 'TECHNICAL_MEASUREMENT'] as const;

const PRISMA_DOCUMENT_SUBTYPES = [
  'UNSPECIFIED',
  'STANDARD',
  'CREDIT_NOTE',
  'PAYMENT_REMINDER',
  'PARKING_FINE',
  'SPEEDING_FINE',
  'ROUTINE_MAINTENANCE',
  'INSPECTION_PASS',
  'INSPECTION_FAIL',
  'OTHER',
] as const;

const PROFILE_FIXTURES: Record<
  string,
  { confirmedData: Record<string, unknown>; entityLinks?: ReturnType<typeof buildPlannerTestInput>['entityLinks'] }
> = {
  'fine.fine_notice': {
    confirmedData: {
      eventDate: '2026-01-01',
      totalCents: 8000,
      issuingAuthority: 'Stadt München',
      reportNumber: 'REF-1',
    },
  },
  'evidence.tire': {
    confirmedData: {
      eventDate: '2026-01-01',
      treadDepthMm: { fl: 5, fr: 5, rl: 5, rr: 5 },
    },
  },
  'evidence.brake': {
    confirmedData: {
      eventDate: '2026-04-01',
      frontPadMm: 8,
    },
  },
  'evidence.battery': {
    confirmedData: {
      eventDate: '2026-05-01',
      scope: 'lv',
      voltageV: 12.4,
    },
  },
  'finance.incoming_invoice': {
    confirmedData: {
      invoiceNumber: 'INV-1',
      totalCents: 11900,
      amountSemantics: 'GROSS',
      taxSemantics: 'EXPLICIT',
    },
  },
  'maintenance.service': {
    confirmedData: {
      eventDate: '2026-01-15',
      workshopName: 'Werkstatt',
    },
  },
};

describe('document-required-field.registry', () => {
  it('exposes a versioned registry with unique profile keys', () => {
    const keys = listDocumentRequiredFieldProfiles().map((profile) => profile.profileKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DOCUMENT_REQUIRED_FIELD_REGISTRY_VERSION).toMatch(/^document-required-field-registry-v\d+$/);
  });

  it.each(DOCUMENT_REQUIRED_FIELD_PROFILES.map((profile) => [profile.profileKey, profile]))(
    'defines required-field contract for profile %s',
    (profileKey, profile) => {
      expect(profile.requiredForReview).toEqual(expect.any(Array));
      expect(profile.requiredForDraft).toEqual(expect.any(Array));
      expect(profile.requiredForApply).toEqual(expect.any(Array));
      expect(profile.optionalFields).toEqual(expect.any(Array));
      expect(profile.conditionalFields).toEqual(expect.any(Array));
      expect(profile.entityRequirements).toEqual(expect.any(Array));
      expect(profile.allowedActions.length).toBeGreaterThan(0);
      expect(profile.blockingRules).toEqual(expect.any(Array));
      expect(getDocumentRequiredFieldProfile(profileKey)).toBe(profile);
    },
  );

  it('never invents default field values when data is empty', () => {
    for (const profile of DOCUMENT_REQUIRED_FIELD_PROFILES) {
      const ready = isStageReady(profile, 'apply', { confirmedData: {}, entityLinks: [] });
      const hasRequirements =
        profile.requiredForApply.length > 0 ||
        profile.conditionalFields.some((rule) => rule.stages.includes('apply')) ||
        profile.entityRequirements.some((rule) => rule.stages.includes('apply'));
      if (hasRequirements) {
        expect(ready).toBe(false);
      }
    }
  });

  it.each(Object.entries(PROFILE_FIXTURES))(
    'marks apply stage ready for valid fixture %s',
    (profileKey, fixture) => {
      const profile = getDocumentRequiredFieldProfile(profileKey)!;
      const ready = isStageReady(profile, 'apply', {
        confirmedData: fixture.confirmedData,
        entityLinks: fixture.entityLinks ?? [
          { role: 'PRIMARY_VEHICLE', entityType: 'VEHICLE', entityId: 'veh-1' },
        ],
      });
      expect(ready).toBe(true);
    },
  );

  it('evaluates nested tread depth and any-of reference numbers', () => {
    expect(
      evaluateRequiredFieldCondition(
        {
          kind: 'nestedAnyPresent',
          parentKey: 'treadDepthMm',
          childKeys: ['fl'],
        },
        { treadDepthMm: { fl: 4.2 } },
      ),
    ).toBe(true);

    expect(
      evaluateRequiredFieldCondition(
        {
          kind: 'anyFieldPresent',
          fieldKeys: ['reportNumber', 'referenceNumber'],
        },
        { referenceNumber: 'ABC' },
      ),
    ).toBe(true);

    expect(hasConfirmedFieldValue({ treadDepthMm: { fl: 3 } }, 'treadDepthMm.fl')).toBe(true);
  });

  describe('subtype resolution', () => {
    it.each([
      ...ARCHIVE_SUBTYPES.map((subtype) => ({ subtype, type: 'OTHER' as const })),
      ...FINE_ALIAS_SUBTYPES.map((subtype) => ({ subtype, type: 'FINE' as const })),
      ...FINANCE_ALIAS_SUBTYPES.map((subtype) => ({ subtype, type: 'INVOICE' as const })),
      ...EVIDENCE_ALIAS_SUBTYPES.map((subtype) => ({ subtype, type: 'SERVICE' as const })),
    ])('resolves profile for alias subtype $subtype', ({ subtype, type }) => {
      const input = buildPlannerTestInput({
        effectiveDocumentType: type,
        documentSubtype: subtype,
      });
      expect(resolveDocumentRequiredFieldProfileKey(input)).toBeTruthy();
    });

    it.each(PRISMA_DOCUMENT_SUBTYPES.map((subtype) => [subtype]))(
      'resolves a profile for Prisma subtype %s',
      (subtype) => {
        const input = buildPlannerTestInput({
          effectiveDocumentType:
            subtype === 'CREDIT_NOTE' || subtype === 'PAYMENT_REMINDER'
              ? 'INVOICE'
              : subtype === 'PARKING_FINE' || subtype === 'SPEEDING_FINE'
                ? 'FINE'
                : subtype === 'ROUTINE_MAINTENANCE'
                  ? 'SERVICE'
                  : subtype === 'INSPECTION_PASS' || subtype === 'INSPECTION_FAIL'
                    ? 'TUV_REPORT'
                    : 'OTHER',
          documentSubtype: subtype,
        });
        const profileKey = resolveDocumentRequiredFieldProfileKey(input);
        expect(profileKey).toBeTruthy();
        expect(getDocumentRequiredFieldProfile(profileKey)).not.toBeNull();
      },
    );

    it('maps workshop measurement subtype to evidence profile', () => {
      const input = buildPlannerTestInput({
        effectiveDocumentType: 'SERVICE',
        documentSubtype: 'WORKSHOP_MEASUREMENT',
        confirmedData: {
          eventDate: '2026-06-01',
          description: 'Messprotokoll',
        },
      });
      expect(resolveDocumentRequiredFieldProfile(input).profileKey).toBe('evidence.workshop_measurement');
    });
  });

  it('includes registry version and profile key in action plan snapshot', () => {
    const result = planDocumentActions(
      buildPlannerTestInput({
        effectiveDocumentType: 'TIRE',
        confirmedData: {
          eventDate: '2026-01-01',
          treadDepthMm: { fl: 5, fr: 5, rl: 5, rr: 5 },
        },
      }),
    );

    expect(result.planDraft.snapshot).toMatchObject({
      requiredFieldRegistryVersion: DOCUMENT_REQUIRED_FIELD_REGISTRY_VERSION,
      requiredFieldProfileKey: 'evidence.tire',
    });
  });

  it('exposes registry through metadata API DTO', () => {
    const dto = buildPublicRequiredFieldRegistryDto();
    expect(dto.version).toBe(DOCUMENT_REQUIRED_FIELD_REGISTRY_VERSION);
    expect(dto.profiles.length).toBe(DOCUMENT_REQUIRED_FIELD_PROFILES.length);
    expect(dto.profiles[0]).toMatchObject({
      profileKey: expect.any(String),
      requiredForApply: expect.any(Array),
      allowedActions: expect.any(Array),
    });
  });

  it('metadata service returns required field registry', () => {
    const service = new DocumentExtractionMetadataService({
      get: () => 10,
    } as any);
    const metadata = service.getMetadata();
    expect(metadata.requiredFieldRegistry.version).toBe(DOCUMENT_REQUIRED_FIELD_REGISTRY_VERSION);
    expect(metadata.requiredFieldRegistry.profiles.length).toBeGreaterThan(0);
  });
});
