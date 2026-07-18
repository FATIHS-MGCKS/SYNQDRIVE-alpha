import { buildDocumentActionPlan } from './document-action-plan.builder';
import { assessDamagePlan } from './document-action-planner.damage-rules';
import { assessFinePlan } from './document-action-planner.fine-rules';
import { assessFinancePlan } from './document-action-planner.invoice-rules';
import { assessInspectionPlan } from './document-action-planner.inspection-rules';
import { buildFollowUpSuggestions } from './document-follow-up-suggestion.generator';
import {
  DAMAGE_ACCIDENT_FOLLOW_UP_RULES,
  DOCUMENT_FOLLOW_UP_RULES_VERSION,
  evaluateVersionedFollowUpTrigger,
  FINE_NOTICE_FOLLOW_UP_RULES,
  GENERAL_FOLLOW_UP_RULES,
  INSPECTION_FOLLOW_UP_RULES,
  INVOICE_FOLLOW_UP_RULES,
  SERVICE_FOLLOW_UP_RULES,
} from './document-follow-up-subtype-rules';
import { DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES } from './document-follow-up-suggestion.types';

function buildPlan(input: {
  extractionId: string;
  documentType: string;
  confirmedData: Record<string, unknown>;
  planContext: Parameters<typeof buildDocumentActionPlan>[0]['planContext'];
  metadata?: Record<string, unknown>;
}) {
  const plan = buildDocumentActionPlan({
    extractionId: input.extractionId,
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentType: input.documentType,
    confirmedData: input.confirmedData,
    plausibilityChecks: [],
    planContext: input.planContext,
  });
  return input.metadata ? { ...plan, metadata: input.metadata } : plan;
}

function suggestionTitles(
  confirmedData: Record<string, unknown>,
  rules: readonly (typeof FINE_NOTICE_FOLLOW_UP_RULES)[number][],
  plan: ReturnType<typeof buildPlan>,
) {
  return buildFollowUpSuggestions({
    extractionId: plan.extractionId ?? 'ext-1',
    plan,
    confirmedData,
    registryRules: rules,
  }).map((row) => row.title);
}

describe('document-follow-up-subtype-rules', () => {
  it('exposes a stable rules version', () => {
    expect(DOCUMENT_FOLLOW_UP_RULES_VERSION).toBe('1.0.0');
    for (const rule of FINE_NOTICE_FOLLOW_UP_RULES) {
      expect(rule.ruleVersion).toBe('1.0.0');
      expect(rule.rationale.trim().length).toBeGreaterThan(10);
      expect(rule.suggestionType).toBeTruthy();
    }
  });

  describe('FINE_NOTICE', () => {
    const confirmedData = {
      dueDate: '2026-08-15',
      acceptedEntityLinks: [{ entityType: 'vehicle', entityId: 'veh-1' }],
    };
    const plan = buildPlan({
      extractionId: 'ext-fine',
      documentType: 'FINE',
      confirmedData,
      planContext: assessFinePlan({ effectiveDocumentType: 'FINE', confirmedData }),
    });

    it('suggests driver assignment, deadline task, and customer contact when relevant', () => {
      const titles = suggestionTitles(confirmedData, FINE_NOTICE_FOLLOW_UP_RULES, plan);
      expect(titles).toContain('Fahrerzuordnung prüfen');
      expect(titles).toContain('Frist-Task anlegen');
      expect(titles).toContain('Kundenkontakt vorbereiten');
      expect(titles).toContain('Keine Folgeaktion');
    });

    it('omits driver assignment when driver link is confirmed', () => {
      const withDriver = {
        ...confirmedData,
        acceptedEntityLinks: [
          { entityType: 'vehicle', entityId: 'veh-1' },
          { entityType: 'driver', entityId: 'drv-1' },
        ],
      };
      const suggestions = buildFollowUpSuggestions({
        extractionId: 'ext-fine',
        plan,
        confirmedData: withDriver,
        registryRules: FINE_NOTICE_FOLLOW_UP_RULES,
      });
      expect(
        suggestions.some((row) => row.generatedByRule.includes('FINE_DRIVER_ASSIGNMENT')),
      ).toBe(false);
    });
  });

  describe('INVOICE', () => {
    const confirmedData = {
      invoiceNumber: 'INV-100',
      totalCents: 12000,
      dueDate: '2026-09-01',
      acceptedEntityLinks: [{ entityType: 'vehicle', entityId: 'veh-1' }],
    };
    const plan = buildPlan({
      extractionId: 'ext-inv',
      documentType: 'INVOICE',
      confirmedData,
      planContext: assessFinancePlan({ effectiveDocumentType: 'INVOICE', confirmedData }),
    });

    it('suggests approval, payment deadline, and vendor assignment', () => {
      const titles = suggestionTitles(confirmedData, INVOICE_FOLLOW_UP_RULES, plan);
      expect(titles).toContain('Rechnung freigeben');
      expect(titles).toContain('Zahlungstermin prüfen');
      expect(titles).toContain('Anbieterzuordnung prüfen');
    });
  });

  describe('TUV_REPORT / BOKRAFT_REPORT', () => {
    const confirmedData = {
      eventDate: '2026-06-01',
      validUntil: '2027-06-01',
      defects: 'Bremslicht defekt',
      reinspectionRequired: true,
      reinspectionDeadline: '2026-07-01',
      acceptedEntityLinks: [{ entityType: 'vehicle', entityId: 'veh-1' }],
    };
    const plan = buildPlan({
      extractionId: 'ext-tuv',
      documentType: 'TUV_REPORT',
      confirmedData,
      planContext: assessInspectionPlan({ effectiveDocumentType: 'TUV_REPORT', confirmedData }),
    });

    it('suggests defect remediation and follow-up reinspection', () => {
      const titles = suggestionTitles(confirmedData, INSPECTION_FOLLOW_UP_RULES, plan);
      expect(titles).toContain('Mängelbeseitigung planen');
      expect(titles).toContain('Wiedervorlage planen');
    });
  });

  describe('DAMAGE_REPORT / ACCIDENT_REPORT', () => {
    const confirmedData = {
      eventDate: '2026-05-01',
      damageType: 'SCRATCH',
      insuranceReference: 'POL-123',
      acceptedEntityLinks: [{ entityType: 'vehicle', entityId: 'veh-1' }],
    };
    const plan = buildPlan({
      extractionId: 'ext-dmg',
      documentType: 'DAMAGE',
      confirmedData,
      planContext: assessDamagePlan({ effectiveDocumentType: 'DAMAGE', confirmedData }),
    });

    it('suggests vehicle inspection, insurance review, and customer contact', () => {
      const titles = suggestionTitles(confirmedData, DAMAGE_ACCIDENT_FOLLOW_UP_RULES, plan);
      expect(titles).toContain('Fahrzeugprüfung veranlassen');
      expect(titles).toContain('Versicherung prüfen');
      expect(titles).toContain('Kundenkontakt vorbereiten');
    });
  });

  describe('SERVICE_REPORT', () => {
    const confirmedData = {
      eventDate: '2026-04-01',
      nextServiceDate: '2026-10-01',
      odometerKm: 84500,
      nextServiceMileageKm: 90000,
      acceptedEntityLinks: [{ entityType: 'vehicle', entityId: 'veh-1' }],
    };
    const plan = buildPlan({
      extractionId: 'ext-svc',
      documentType: 'SERVICE',
      confirmedData,
      planContext: {
        documentType: 'SERVICE',
        planOutcome: 'READY',
        actions: [],
        missingRequirements: [],
      },
    });

    it('suggests next service and mileage deadline', () => {
      const titles = suggestionTitles(confirmedData, SERVICE_FOLLOW_UP_RULES, plan);
      expect(titles).toContain('Nächsten Service planen');
      expect(titles).toContain('Kilometerfrist prüfen');
    });
  });

  describe('GENERAL / OTHER', () => {
    const confirmedData = {
      summary: 'Allgemeine Korrespondenz',
      dueDate: '2026-12-01',
      acceptedEntityLinks: [{ entityType: 'vehicle', entityId: 'veh-1' }],
    };
    const plan = buildPlan({
      extractionId: 'ext-other',
      documentType: 'OTHER',
      confirmedData,
      planContext: {
        documentType: 'OTHER',
        planOutcome: 'READY',
        actions: [],
        missingRequirements: [],
      },
    });

    it('suggests responsible user, deadline review, and archive option', () => {
      const titles = suggestionTitles(confirmedData, GENERAL_FOLLOW_UP_RULES, plan);
      expect(titles).toContain('Zuständige Person zuordnen');
      expect(titles).toContain('Frist prüfen');
      expect(titles.some((title) => title === 'Archivieren' || title === 'Keine Folgeaktion')).toBe(
        true,
      );
    });
  });

  it('never emits a suggestion without rationale', () => {
    const confirmedData = {
      dueDate: '2026-08-15',
      invoiceNumber: 'INV-1',
      totalCents: 1000,
      acceptedEntityLinks: [{ entityType: 'vehicle', entityId: 'veh-1' }],
    };
    const plan = buildPlan({
      extractionId: 'ext-1',
      documentType: 'INVOICE',
      confirmedData,
      planContext: assessFinancePlan({ effectiveDocumentType: 'INVOICE', confirmedData }),
    });
    const suggestions = buildFollowUpSuggestions({
      extractionId: 'ext-1',
      plan,
      confirmedData,
      registryRules: INVOICE_FOLLOW_UP_RULES,
    });
    for (const row of suggestions) {
      expect(row.rationale.trim().length).toBeGreaterThan(10);
    }
  });

  it('evaluates archive_ready as always available for general documents', () => {
    expect(evaluateVersionedFollowUpTrigger('archive_ready', {})).toBe(true);
  });
});
