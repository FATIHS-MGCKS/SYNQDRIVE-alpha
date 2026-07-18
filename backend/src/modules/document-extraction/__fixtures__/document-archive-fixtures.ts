const ARCHIVE_BASE = {
  documentDate: '2026-04-02',
  sender: 'Stadtverwaltung München — Ordnungsamt',
  recipient: 'SynqDrive Fleet GmbH',
  referenceNumber: 'AZ-2026-4412',
  subject: 'Anhörung wegen Parkverstoß',
  summary: 'Behördliches Schreiben mit Frist zur Stellungnahme.',
  actionRequired: 'Stellungnahme prüfen und intern zuordnen.',
  deadlines: JSON.stringify([{ label: 'Stellungnahme bis', date: '2026-04-20' }]),
  mentionedEntities: JSON.stringify([
    { entityType: 'vehicle', label: 'M-AB 1234' },
    { entityType: 'fine', label: 'Parkverstoß 12.03.2026' },
  ]),
};

export const AUTHORITY_LETTER = {
  ...ARCHIVE_BASE,
  archiveSubtype: 'AUTHORITY_LETTER',
};

export const INSURANCE_LETTER = {
  archiveSubtype: 'INSURANCE_LETTER',
  documentDate: '2026-03-18',
  sender: 'Allianz Versicherung AG',
  recipient: 'SynqDrive Fleet GmbH',
  referenceNumber: 'SCH-2026-7781',
  subject: 'Schadenmeldung — Rückfrage Unterlagen',
  summary: 'Versicherer fordert Fotos und Werkstattkostenvoranschlag nach.',
  actionRequired: 'Unterlagen zusammenstellen — keine automatische Antwort.',
  deadlines: JSON.stringify([{ label: 'Unterlagen einreichen bis', date: '2026-04-01' }]),
  mentionedEntities: JSON.stringify([{ entityType: 'damage', label: 'Heckschaden BK-2026-0099' }]),
};

export const CUSTOMER_CORRESPONDENCE = {
  archiveSubtype: 'CUSTOMER_CORRESPONDENCE',
  documentDate: '2026-03-22',
  sender: 'Kundenservice SynqDrive',
  recipient: 'Fleet Operations',
  referenceNumber: 'TICK-8821',
  subject: 'Kundenanfrage zu Buchung BK-2026-0142',
  summary: 'Kunde meldet verspätete Rückgabe und bittet um Kulanzprüfung.',
  actionRequired: 'Interne Prüfung — kein automatischer Kundenkontakt.',
};

export const DRIVER_DOCUMENT = {
  archiveSubtype: 'DRIVER_DOCUMENT',
  documentDate: '2026-02-11',
  sender: 'Fahrer — nur Initialen erlaubt',
  recipient: 'SynqDrive Operations',
  referenceNumber: 'HANDOVER-2026-0211',
  subject: 'Übergabeprotokoll Ergänzung',
  summary: 'Fahrer bestätigt Zustand bei Rückgabe ohne neue Schadensmeldung.',
  actionRequired: 'Mit Handover abgleichen.',
};

export const PAYMENT_PROOF_ARCHIVE = {
  archiveSubtype: 'PAYMENT_PROOF',
  documentDate: '2026-03-05',
  sender: 'Commerzbank AG',
  recipient: 'SynqDrive Fleet GmbH',
  referenceNumber: 'TRX-998812',
  subject: 'Überweisungsbeleg',
  summary: 'Zahlungsnachweis für Werkstattrechnung WR-4412.',
  mentionedEntities: JSON.stringify([{ entityType: 'invoice', label: 'WR-4412' }]),
};

export const WORKSHOP_REPORT_ARCHIVE = {
  archiveSubtype: 'WORKSHOP_REPORT',
  documentDate: '2026-03-14',
  sender: 'Autohaus Weber',
  recipient: 'SynqDrive Fleet GmbH',
  referenceNumber: 'WR-2026-331',
  subject: 'Werkstattbericht — Diagnose ohne Freigabe',
  summary: 'Werkstatt dokumentiert Befund; keine automatische Servicebuchung.',
  actionRequired: 'Befund intern bewerten.',
  mentionedEntities: JSON.stringify([{ entityType: 'vehicle', label: 'VIN endet auf 4821' }]),
};

export const EXPERT_REPORT_ARCHIVE = {
  archiveSubtype: 'EXPERT_REPORT',
  documentDate: '2026-01-28',
  sender: 'Sachverständigenbüro Krause',
  recipient: 'SynqDrive Fleet GmbH',
  referenceNumber: 'SV-2026-019',
  subject: 'Gutachten — Schadenshöhe',
  summary: 'Sachverständiger schätzt Reparaturkosten; kein automatischer Schadensfall.',
  mentionedEntities: JSON.stringify([{ entityType: 'damage', label: 'Schadenfall März 2026' }]),
};

export const GENERAL_EVIDENCE = {
  archiveSubtype: 'GENERAL_EVIDENCE',
  documentDate: '2026-03-01',
  sender: 'Intern',
  referenceNumber: 'EV-2026-55',
  subject: 'Foto-Nachweis Fahrzeugzustand',
  summary: 'Allgemeiner Nachweis für interne Akte.',
};

export const CONTRACT_DOCUMENT = {
  archiveSubtype: 'CONTRACT_DOCUMENT',
  documentDate: '2025-12-01',
  sender: 'Leasingbank Nord',
  recipient: 'SynqDrive Fleet GmbH',
  referenceNumber: 'LV-2025-991',
  subject: 'Leasingvertrag Ergänzung',
  summary: 'Vertragsanhang mit Laufzeit und Kilometerregelung.',
  deadlines: JSON.stringify([{ label: 'Vertragsende', date: '2028-11-30' }]),
};

export const ARCHIVE_UNKNOWN = {
  archiveSubtype: 'UNKNOWN',
  summary: 'Dokumentart unklar — manuelle Klassifikation erforderlich.',
};

export const ARCHIVE_EMPTY = {};

export const ARCHIVE_INVENTED_ENTITY = {
  archiveSubtype: 'GENERAL_EVIDENCE',
  documentDate: '2026-03-10',
  summary: 'Testdokument mit erfundener Entität.',
  mentionedEntities: JSON.stringify([{ entityType: 'booking', id: 'bk-invented-001' }]),
};

export const ARCHIVE_SUBTYPE_FIXTURES = {
  AUTHORITY_LETTER,
  INSURANCE_LETTER,
  CUSTOMER_CORRESPONDENCE,
  DRIVER_DOCUMENT,
  PAYMENT_PROOF: PAYMENT_PROOF_ARCHIVE,
  WORKSHOP_REPORT: WORKSHOP_REPORT_ARCHIVE,
  EXPERT_REPORT: EXPERT_REPORT_ARCHIVE,
  GENERAL_EVIDENCE,
  CONTRACT_DOCUMENT,
  UNKNOWN: ARCHIVE_UNKNOWN,
} as const;
