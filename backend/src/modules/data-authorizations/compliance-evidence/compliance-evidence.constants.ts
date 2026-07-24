export const COMPLIANCE_EVIDENCE = {
  recordVersion: 'compliance-evidence-v1',
  exportTtlHours: 72,
  asyncRowThreshold: 500,
  disclaimer:
    'Technischer Compliance-Evidence-Report für interne Datenschutz- und ISO-Prüfungen — keine automatische Compliance-Behauptung.',
  mandatorySectionsForFullPackage: [
    'PROCESSING_ACTIVITY_VERSION',
    'LEGAL_BASIS',
    'ENFORCEMENT_COVERAGE',
    'REVIEW_APPROVAL',
    'RETENTION',
  ] as const,
} as const;

export const COMPLIANCE_EVIDENCE_SECTION_TYPES = [
  'PROCESSING_ACTIVITY_VERSION',
  'LEGAL_BASIS',
  'CONSENT',
  'PROVIDER_ACCESS_GRANT',
  'DATA_PROCESSING_AGREEMENT',
  'DPIA',
  'ENFORCEMENT_COVERAGE',
  'REVIEW_APPROVAL',
  'POLICY_DEPLOYMENT',
  'REVOCATION',
  'RETENTION',
  'DELETION',
  'AUTHORIZATION_DECISIONS',
  'RUNTIME_HEALTH',
  'PROVIDER_CONSISTENCY',
] as const;

export type ComplianceEvidenceSectionType = (typeof COMPLIANCE_EVIDENCE_SECTION_TYPES)[number];
