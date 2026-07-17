import {
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES,
  type DocumentFollowUpSuggestionType,
} from './document-follow-up-suggestion.types';

export const DOCUMENT_FOLLOW_UP_RULES_VERSION = '1.0.0' as const;

export const DOCUMENT_FOLLOW_UP_RULE_TRIGGERS = {
  MISSING_DRIVER: 'missing_driver',
  MISSING_CUSTOMER: 'missing_customer',
  MISSING_BOOKING: 'missing_booking',
  MISSING_VENDOR: 'missing_vendor',
  DEADLINE_DETECTED: 'deadline_detected',
  DUPLICATE_REFERENCE: 'duplicate_reference',
  DEFECT_DETECTED: 'defect_detected',
  REINSPECTION_DUE: 'reinspection_due',
  NEXT_SERVICE_DUE: 'next_service_due',
  MILEAGE_THRESHOLD: 'mileage_threshold',
  PAYMENT_APPROVAL_NEEDED: 'payment_approval_needed',
  CUSTOMER_CONTACT_RELEVANT: 'customer_contact_relevant',
  INSURANCE_CONTEXT: 'insurance_context',
  ARCHIVE_READY: 'archive_ready',
} as const;

export type DocumentFollowUpRuleTrigger =
  (typeof DOCUMENT_FOLLOW_UP_RULE_TRIGGERS)[keyof typeof DOCUMENT_FOLLOW_UP_RULE_TRIGGERS];

export type VersionedFollowUpSuggestionRule = {
  code: string;
  message: string;
  ruleVersion: typeof DOCUMENT_FOLLOW_UP_RULES_VERSION;
  title: string;
  rationale: string;
  suggestionType: DocumentFollowUpSuggestionType;
  trigger: DocumentFollowUpRuleTrigger;
  severity: 'INFO' | 'WARNING';
};

function rule(
  partial: Omit<VersionedFollowUpSuggestionRule, 'ruleVersion' | 'message'> & {
    message?: string;
  },
): VersionedFollowUpSuggestionRule {
  return {
    ...partial,
    ruleVersion: DOCUMENT_FOLLOW_UP_RULES_VERSION,
    message: partial.message ?? partial.title,
  };
}

export const FINE_NOTICE_FOLLOW_UP_RULES: readonly VersionedFollowUpSuggestionRule[] = [
  rule({
    code: 'FINE_DRIVER_ASSIGNMENT',
    title: 'Fahrerzuordnung prüfen',
    rationale:
      'Die Fahrerzuordnung ist nicht bestätigt — bitte Kandidaten prüfen, bevor die Bußgeldakte weiterbearbeitet wird.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_DRIVER_CONTACT,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.MISSING_DRIVER,
    severity: 'WARNING',
  }),
  rule({
    code: 'FINE_DEADLINE_TASK',
    title: 'Frist-Task anlegen',
    rationale:
      'Im Dokument wurde eine Frist erkannt — bitte Fälligkeit bestätigen und als Nachverfolgung planen.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.REVIEW_DEADLINE,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.DEADLINE_DETECTED,
    severity: 'WARNING',
  }),
  rule({
    code: 'FINE_CUSTOMER_CONTACT',
    title: 'Kundenkontakt vorbereiten',
    rationale:
      'Bußgelder werden häufig an Kunde oder Mieter weitergeleitet — Kontakt nur nach expliziter Bestätigung vorbereiten.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_CUSTOMER_CONTACT,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.CUSTOMER_CONTACT_RELEVANT,
    severity: 'INFO',
  }),
];

export const INVOICE_FOLLOW_UP_RULES: readonly VersionedFollowUpSuggestionRule[] = [
  rule({
    code: 'INVOICE_PAYMENT_APPROVAL',
    title: 'Rechnung freigeben',
    rationale:
      'Rechnungsdaten sind erfasst — Freigabe und Zahlungsprüfung erfolgen nur nach manueller Bestätigung.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PAYMENT_REVIEW,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.PAYMENT_APPROVAL_NEEDED,
    severity: 'WARNING',
  }),
  rule({
    code: 'INVOICE_PAYMENT_DEADLINE',
    title: 'Zahlungstermin prüfen',
    rationale:
      'Ein Zahlungs- oder Fälligkeitstermin wurde erkannt — bitte Termin bestätigen, bevor Aufgaben erstellt werden.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.REVIEW_DEADLINE,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.DEADLINE_DETECTED,
    severity: 'INFO',
  }),
  rule({
    code: 'INVOICE_VENDOR_ASSIGNMENT',
    title: 'Anbieterzuordnung prüfen',
    rationale:
      'Der Lieferant ist nicht eindeutig zugeordnet — bitte Anbieter verknüpfen, bevor Zahlung oder Freigabe erfolgt.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.ASSIGN_RESPONSIBLE_USER,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.MISSING_VENDOR,
    severity: 'WARNING',
  }),
];

export const INSPECTION_FOLLOW_UP_RULES: readonly VersionedFollowUpSuggestionRule[] = [
  rule({
    code: 'INSPECTION_DEFECT_REMEDIATION',
    title: 'Mängelbeseitigung planen',
    rationale:
      'Im Prüfbericht wurden Mängel erkannt — Werkstatttermin und Mängelbeseitigung nur nach Bestätigung vorschlagen.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.WORKSHOP_APPOINTMENT,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.DEFECT_DETECTED,
    severity: 'WARNING',
  }),
  rule({
    code: 'INSPECTION_FOLLOW_UP',
    title: 'Wiedervorlage planen',
    rationale:
      'Nachmeldung oder Wiedervorlage ist erforderlich — bitte Frist oder Prüftermin bestätigen.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.VEHICLE_INSPECTION,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.REINSPECTION_DUE,
    severity: 'INFO',
  }),
];

export const DAMAGE_ACCIDENT_FOLLOW_UP_RULES: readonly VersionedFollowUpSuggestionRule[] = [
  rule({
    code: 'DAMAGE_VEHICLE_INSPECTION',
    title: 'Fahrzeugprüfung veranlassen',
    rationale:
      'Schaden- oder Unfallmeldung erfordert häufig eine Sichtprüfung des Fahrzeugs — nur nach Bestätigung vorschlagen.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.VEHICLE_INSPECTION,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.DEFECT_DETECTED,
    severity: 'INFO',
  }),
  rule({
    code: 'DAMAGE_INSURANCE_REVIEW',
    title: 'Versicherung prüfen',
    rationale:
      'Versicherungs- oder Polizeikontext erkannt — Versicherungsnachverfolgung nur nach expliziter Bestätigung.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.INSURANCE_REVIEW,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.INSURANCE_CONTEXT,
    severity: 'INFO',
  }),
  rule({
    code: 'DAMAGE_CUSTOMER_CONTACT',
    title: 'Kundenkontakt vorbereiten',
    rationale:
      'Kunde oder Mieter sollte über den Schaden informiert werden — Kontakt nur nach Bestätigung vorbereiten.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_CUSTOMER_CONTACT,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.CUSTOMER_CONTACT_RELEVANT,
    severity: 'INFO',
  }),
];

export const SERVICE_FOLLOW_UP_RULES: readonly VersionedFollowUpSuggestionRule[] = [
  rule({
    code: 'SERVICE_NEXT_APPOINTMENT',
    title: 'Nächsten Service planen',
    rationale:
      'Ein nächster Service- oder Wartungstermin wurde erkannt — bitte Termin bestätigen, bevor Folgeaktionen erstellt werden.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.WORKSHOP_APPOINTMENT,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.NEXT_SERVICE_DUE,
    severity: 'INFO',
  }),
  rule({
    code: 'SERVICE_MILEAGE_DEADLINE',
    title: 'Kilometerfrist prüfen',
    rationale:
      'Serviceintervall oder Kilometergrenze erkannt — Frist nur bei bestätigten Werten als Aufgabe vorschlagen.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.REVIEW_DEADLINE,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.MILEAGE_THRESHOLD,
    severity: 'INFO',
  }),
];

export const GENERAL_FOLLOW_UP_RULES: readonly VersionedFollowUpSuggestionRule[] = [
  rule({
    code: 'GENERAL_RESPONSIBLE_USER',
    title: 'Zuständige Person zuordnen',
    rationale:
      'Für die weitere Bearbeitung fehlt eine eindeutige Zuordnung — bitte Buchung oder Verantwortlichen prüfen.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.ASSIGN_RESPONSIBLE_USER,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.MISSING_BOOKING,
    severity: 'INFO',
  }),
  rule({
    code: 'GENERAL_DEADLINE_REVIEW',
    title: 'Frist prüfen',
    rationale:
      'Im Dokument wurde eine Frist erkannt — bitte Fälligkeit bestätigen, bevor Erinnerungen erstellt werden.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.REVIEW_DEADLINE,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.DEADLINE_DETECTED,
    severity: 'INFO',
  }),
  rule({
    code: 'GENERAL_ARCHIVE_ONLY',
    title: 'Archivieren',
    rationale:
      'Keine weiteren Nachverfolgungen erforderlich — Dokument kann nach Prüfung archiviert bleiben.',
    suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.NO_FOLLOW_UP,
    trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.ARCHIVE_READY,
    severity: 'INFO',
  }),
];

const SUBTYPE_FOLLOW_UP_RULES: Record<string, readonly VersionedFollowUpSuggestionRule[]> = {
  FINE_NOTICE: FINE_NOTICE_FOLLOW_UP_RULES,
  DRIVER_IDENTIFICATION_REQUEST: [
    rule({
      code: 'AUTHORITY_DRIVER_IDENTIFICATION',
      title: 'Fahrerzuordnung prüfen',
      rationale:
        'Behörde fordert Fahreridentifikation — Zuordnung muss vor Antwort bestätigt werden.',
      suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_DRIVER_CONTACT,
      trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.MISSING_DRIVER,
      severity: 'WARNING',
    }),
  ],
  INVOICE: INVOICE_FOLLOW_UP_RULES,
  TUV_REPORT: INSPECTION_FOLLOW_UP_RULES,
  BOKRAFT_REPORT: INSPECTION_FOLLOW_UP_RULES,
  DAMAGE_REPORT: DAMAGE_ACCIDENT_FOLLOW_UP_RULES,
  ACCIDENT_REPORT: DAMAGE_ACCIDENT_FOLLOW_UP_RULES,
  SERVICE_REPORT: SERVICE_FOLLOW_UP_RULES,
  OTHER: GENERAL_FOLLOW_UP_RULES,
  PAYMENT_PROOF: GENERAL_FOLLOW_UP_RULES,
  INSURANCE_LETTER: [
    ...GENERAL_FOLLOW_UP_RULES.filter((row) => row.code !== 'GENERAL_ARCHIVE_ONLY'),
    rule({
      code: 'INSURANCE_LETTER_REVIEW',
      title: 'Versicherung prüfen',
      rationale: 'Versicherungsschreiben erfordert fachliche Prüfung — nur nach Bestätigung nachverfolgen.',
      suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.INSURANCE_REVIEW,
      trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.INSURANCE_CONTEXT,
      severity: 'INFO',
    }),
  ],
  CUSTOMER_CORRESPONDENCE: [
    rule({
      code: 'CORRESPONDENCE_CUSTOMER_LINK',
      title: 'Kundenkontakt vorbereiten',
      rationale: 'Korrespondenz erfordert bestätigten Kundenbezug — Kontakt nur nach expliziter Auswahl.',
      suggestionType: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_CUSTOMER_CONTACT,
      trigger: DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.CUSTOMER_CONTACT_RELEVANT,
      severity: 'WARNING',
    }),
    ...GENERAL_FOLLOW_UP_RULES.filter((row) => row.code !== 'GENERAL_RESPONSIBLE_USER'),
  ],
};

export function resolveVersionedFollowUpRules(
  documentSubtype: string | null | undefined,
): readonly VersionedFollowUpSuggestionRule[] {
  if (!documentSubtype) return [];
  return SUBTYPE_FOLLOW_UP_RULES[documentSubtype] ?? [];
}
