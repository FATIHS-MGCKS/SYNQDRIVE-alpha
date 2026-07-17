export const GENERAL_CORRESPONDENCE_CLASSIFICATION_FIXTURE = {
  documentCategory: 'CUSTOMER',
  documentSubtype: 'CUSTOMER_CORRESPONDENCE',
  detectedDocumentType: 'OTHER',
  confidence: 0.74,
  rationale: 'Customer letter with subject line and addressee block without workshop service items',
  sourcePages: [1],
  alternatives: [
    {
      documentCategory: 'TECHNICAL',
      documentSubtype: 'SERVICE_REPORT',
      confidence: 0.52,
      rationale: 'Mentions vehicle model but no service stamp',
    },
    {
      documentCategory: 'GENERAL',
      documentSubtype: 'OTHER',
      confidence: 0.41,
      rationale: 'Generic correspondence layout',
    },
  ],
  detectedIdentifiers: [
    { identifierType: 'reference_number', value: 'REF-2026-0042', evidencePage: 1 },
    { identifierType: 'license_plate', value: 'M-AB 1234', evidencePage: 1 },
  ],
};

export const HIGH_CONFIDENCE_SERVICE_WITH_ALTERNATIVE_FIXTURE = {
  documentCategory: 'TECHNICAL',
  documentSubtype: 'SERVICE_REPORT',
  detectedDocumentType: 'SERVICE',
  confidence: 0.91,
  rationale: 'Workshop stamp and maintenance checklist on page 1',
  sourcePages: [1, 2],
  alternatives: [
    {
      documentCategory: 'FINANCE',
      documentSubtype: 'INVOICE',
      confidence: 0.78,
      rationale: 'Invoice totals visible on page 2',
    },
  ],
  detectedIdentifiers: [
    { identifierType: 'invoice_number', value: 'INV-77821', evidencePage: 2 },
  ],
};

export const CLEAR_FINE_NOTICE_FIXTURE = {
  documentCategory: 'AUTHORITY',
  documentSubtype: 'FINE_NOTICE',
  detectedDocumentType: 'FINE',
  confidence: 0.94,
  rationale: 'Penalty notice with offense type and payable amount',
  sourcePages: [1],
  alternatives: [],
  detectedIdentifiers: [
    { identifierType: 'fine_number', value: 'VB-2026-1199', evidencePage: 1 },
    { identifierType: 'license_plate', value: 'KS-FH 660E', evidencePage: 1 },
  ],
};

export const UNCLEAR_SUBTYPE_FIXTURE = {
  documentCategory: 'GENERAL',
  documentSubtype: 'OTHER',
  detectedDocumentType: 'UNKNOWN',
  confidence: 0.38,
  rationale: 'unclear',
  sourcePages: null,
  alternatives: [],
  detectedIdentifiers: [],
};

export const FORCED_SERVICE_GENERAL_LETTER_FIXTURE = {
  documentCategory: 'TECHNICAL',
  documentSubtype: 'SERVICE_REPORT',
  detectedDocumentType: 'SERVICE',
  confidence: 0.88,
  rationale: 'Letter format with customer address only',
  sourcePages: [1],
  alternatives: [
    {
      documentCategory: 'CUSTOMER',
      documentSubtype: 'CUSTOMER_CORRESPONDENCE',
      confidence: 0.81,
      rationale: 'Customer correspondence without workshop evidence',
    },
  ],
  detectedIdentifiers: [
    { identifierType: 'reference_number', value: 'KORR-2026-01', evidencePage: 1 },
  ],
};
